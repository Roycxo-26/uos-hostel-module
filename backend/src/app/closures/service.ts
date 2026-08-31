import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ConflictError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { notify, notifyCampusStaff, notifyOccupantsInScope } from '../../utils/notify';
import * as headcountRepo from '../headcount/repository';
import * as safetyRepo from '../safety/repository';
import * as structureRepo from '../structure/repository';
import * as repo from './repository';
import { REOPENING_CHECKLIST_KEYS } from './validators';
import type {
  cancelClosureCaseSchema,
  createClosureCaseSchema,
  decideClosureCaseSchema,
  resolveImpactSchema,
  updateReopeningChecklistSchema,
} from './validators';
import type { ClosureCase, ClosureScopeType } from './types';

/** BRD's 7-value (shutdown) + 6-value (mass relocation) reason lists
 * overlap in intent but not in wording — see validators.ts's combined
 * REASON_CATEGORIES. Room-scope closures reuse rooms.status_reason_category
 * (Batch 16's 4-value enum), so every reason maps down to whichever of
 * those four it's actually describing. */
function toRoomReasonCategory(reason: ClosureCase['reason_category']): 'safety' | 'maintenance' | 'policy' | 'other' {
  if (['safety', 'water_sanitation_failure', 'disaster', 'emergency'].includes(reason)) return 'safety';
  if (['maintenance_renovation', 'structural_work', 'pest_treatment'].includes(reason)) return 'maintenance';
  if (['semester_vacation', 'low_occupancy_consolidation', 'event_operational'].includes(reason)) return 'policy';
  return 'other';
}

async function resolveScope(scopeType: ClosureScopeType, scopeId: string): Promise<{ campusId: string; hostelId: string }> {
  if (scopeType === 'hostel') {
    const row = await db('hostels').where({ id: scopeId }).first('campus_id', 'id');
    if (!row) throw new NotFoundError('Hostel');
    return { campusId: row.campus_id, hostelId: row.id };
  }
  if (scopeType === 'floor') {
    const row = await db('floors')
      .join('blocks', 'blocks.id', 'floors.block_id')
      .where('floors.id', scopeId)
      .first('floors.campus_id as campus_id', 'blocks.hostel_id as hostel_id');
    if (!row) throw new NotFoundError('Floor');
    return { campusId: row.campus_id, hostelId: row.hostel_id };
  }
  const row = await db('rooms')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .where('rooms.id', scopeId)
    .first('rooms.campus_id as campus_id', 'blocks.hostel_id as hostel_id');
  if (!row) throw new NotFoundError('Room');
  return { campusId: row.campus_id, hostelId: row.hostel_id };
}

/** Only 'shutdown' actually flips the scope entity's own lifecycle status
 * (suspended on close, active on reopen) — that's what makes "reopening"
 * a meaningful, gate-able concept (item 88). 'mass_relocation' relies
 * entirely on repository.ts's findClosureBlock to keep new occupancy out of
 * scope while it's open; the scope itself may keep operating for everyone
 * not directly affected (e.g. relocating one floor for pest treatment
 * doesn't take the whole hostel's own status out of 'active'). A genuine
 * behavioral fork on case_type, not a shared code path with a flag. */
async function setScopeStatus(
  caseType: ClosureCase['case_type'],
  scopeType: ClosureScopeType,
  scopeId: string,
  status: 'suspended' | 'active',
  reasonCategory: ClosureCase['reason_category'],
  reasonNotes: string | null
): Promise<void> {
  if (caseType !== 'shutdown') return;
  if (scopeType === 'hostel') {
    await structureRepo.updateHostel(scopeId, { status });
  } else if (scopeType === 'floor') {
    await structureRepo.updateFloor(scopeId, { status });
  } else {
    await structureRepo.updateRoomStatus(
      scopeId,
      status,
      status === 'active' ? null : reasonNotes,
      null,
      status === 'active' ? null : toRoomReasonCategory(reasonCategory)
    );
  }
}

export async function createClosureCase(user: AuthUser, input: z.infer<typeof createClosureCaseSchema>) {
  const scope = await resolveScope(input.scopeType, input.scopeId);
  if (input.scopeType !== 'hostel' && scope.hostelId !== input.hostelId) {
    throw new ValidationError('hostelId does not match the hostel that owns this scope');
  }

  const row = await repo.createCase({
    org_id: user.org_id,
    campus_id: scope.campusId,
    hostel_id: input.hostelId,
    case_type: input.caseType,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    reason_category: input.reasonCategory,
    reason_notes: input.reasonNotes ?? null,
    planned_start_date: input.plannedStartDate ?? null,
    planned_end_date: input.plannedEndDate ?? null,
    exception_policy: input.exceptionPolicy ?? null,
    proposed_by: user.sub,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campusId,
    actorUserId: user.sub,
    action: 'closure_case.proposed',
    entityType: 'closure_case',
    entityId: row.id,
    after: row,
  });
  await notifyCampusStaff(db, user.org_id, scope.campusId, {
    type: 'closure_case.proposed',
    title: `New ${input.caseType === 'shutdown' ? 'shutdown' : 'mass relocation'} case proposed for ${input.scopeType} scope, awaiting decision`,
    link: '/closures',
  });
  return row;
}

/** BR's own §5.2 approval framework (utils/approvalResolution.ts), same as
 * transfers/service.ts's decideTransfer — a shutdown/mass-relocation case
 * always requires head_warden, not a normal/exceptional split by type, since
 * every case here already carries hostel/floor-wide operational impact. */
export async function decideClosureCase(user: AuthUser, caseId: string, input: z.infer<typeof decideClosureCaseSchema>) {
  const before = await repo.findCaseById(caseId);
  if (!before) throw new NotFoundError('Closure case');
  if (before.status !== 'proposed') throw new ConflictError(`Cannot decide a closure case in status '${before.status}'`);

  const resolution = await authorizeApproval(user, { requiredRole: 'head_warden', campusId: before.campus_id });

  const after = await repo.updateCase(caseId, {
    status: input.decision,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    decision_reason: input.reason,
  });

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'closure_case',
    entityId: caseId,
    requiredRole: 'head_warden',
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `closure_case.${input.decision}`,
    entityType: 'closure_case',
    entityId: caseId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

/** Item 87 — the bulk-case wrapper itself: same atomic-write shape as
 * jobs/restoreTemporaryRelocations.ts (mark the scope, snapshot who's
 * affected, let each be resolved individually), but staff-triggered rather
 * than a background sweep. That's a deliberate difference, not an
 * oversight: the return job's destination is always known in advance (the
 * resident's own original bed); a closure's relocation destination is a
 * genuine judgement call ("bulk tooling may propose destinations, but
 * allocation/occupancy invariants remain per resident/bed" — BRD 24I.4),
 * so populating the roster is automatic but resolving each one stays a
 * human action via resolveImpact below.
 */
export async function startClosureCase(user: AuthUser, caseId: string) {
  const before = await repo.findCaseById(caseId);
  if (!before) throw new NotFoundError('Closure case');
  if (before.status !== 'approved') throw new ConflictError(`Cannot start a closure case in status '${before.status}'`);

  await setScopeStatus(before.case_type, before.scope_type, before.scope_id, 'suspended', before.reason_category, before.reason_notes);

  const residents = await headcountRepo.residentsInScope(before.scope_type, before.scope_id);
  for (const resident of residents) {
    const allocation = await db('allocations').where({ id: resident.allocation_id }).first('bed_id');
    await repo.createImpact({
      closure_case_id: caseId,
      org_id: user.org_id,
      campus_id: before.campus_id,
      student_id: resident.student_id,
      allocation_id: resident.allocation_id,
      source_bed_id: allocation?.bed_id ?? null,
    });
  }

  const after = await repo.updateCase(caseId, { status: 'active_closure', actual_start_date: db.fn.now() });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'closure_case.started',
    entityType: 'closure_case',
    entityId: caseId,
    before,
    after: { ...after, impactedResidentCount: residents.length },
  });
  await notifyOccupantsInScope(db, user.org_id, before.campus_id, before.scope_type, before.scope_id, {
    type: 'closure_case.started',
    title: `${before.case_type === 'shutdown' ? 'Your hostel/floor/room is closing' : 'You are part of a mass relocation'} — staff will contact you about next steps`,
    link: '/allocations',
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'closure_case.started',
    title: `Closure case active — ${residents.length} resident(s) need reconciliation`,
    link: '/closures',
  });
  return after;
}

/** A resident who moved into scope after startClosureCase already ran (or
 * was missed by the auto-populate join for any reason) — named gap,
 * covered by this one manual add rather than silently left unreachable. */
export async function addManualImpact(user: AuthUser, caseId: string, studentId: string) {
  const closureCase = await repo.findCaseById(caseId);
  if (!closureCase) throw new NotFoundError('Closure case');
  if (closureCase.status !== 'active_closure') throw new ConflictError(`Cannot add a resident to a case in status '${closureCase.status}'`);

  const allocation = await db('allocations').where({ student_id: studentId, status: 'checked_in_active' }).first();
  const row = await repo.createImpact({
    closure_case_id: caseId,
    org_id: user.org_id,
    campus_id: closureCase.campus_id,
    student_id: studentId,
    allocation_id: allocation?.id ?? null,
    source_bed_id: allocation?.bed_id ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: closureCase.campus_id,
    actorUserId: user.sub,
    action: 'closure_case.impact_added',
    entityType: 'closure_case_impact',
    entityId: row.id,
    after: row,
  });
  return row;
}

/**
 * Resolving one resident's impact. 'relocated' is the only outcome that
 * actually moves anyone — the same atomic old-bed-ends-first-then-new-bed-
 * opens sequence jobs/restoreTemporaryRelocations.ts already uses (and for
 * the same reason: uq_one_active_allocation_per_student would otherwise
 * collide on insert-before-end). The other three outcomes ('checked_out' /
 * 'on_leave' / 'exception_no_destination') are deliberately just
 * classification — a resident being checked out or sent on leave goes
 * through Checkout/Movement's own already-working flows; this module isn't
 * re-implementing either, only tracking which bucket each resident landed
 * in for the case's own reconciliation record.
 */
export async function resolveImpact(user: AuthUser, impactId: string, input: z.infer<typeof resolveImpactSchema>) {
  const impact = await repo.findImpactById(impactId);
  if (!impact) throw new NotFoundError('Closure case impact');
  if (impact.outcome !== 'pending') throw new ConflictError(`This resident's impact is already resolved as '${impact.outcome}'`);

  const closureCase = await repo.findCaseById(impact.closure_case_id);
  if (!closureCase || closureCase.status !== 'active_closure') {
    throw new ConflictError('The closure case for this resident is not currently active');
  }

  let newAllocationId: string | null = null;

  if (input.outcome === 'relocated') {
    if (!input.destinationBedId) throw new ValidationError('destinationBedId is required when outcome is "relocated"');
    const destBed = await db('beds').where({ id: input.destinationBedId }).first();
    if (!destBed) throw new NotFoundError('Destination bed');
    if (destBed.status !== 'available') throw new ConflictError(`Destination bed is '${destBed.status}', not available`);
    if (destBed.bed_category !== 'resident') throw new ConflictError('Destination bed is a guest short-stay bed, not available for resident occupancy');

    const safetyBlock = await safetyRepo.findBedSafetyBlock(destBed.id);
    if (safetyBlock.blocked) throw new ConflictError(safetyBlock.reason ?? 'This bed is under a safety block');
    const closureBlock = await repo.findClosureBlock(destBed.id);
    if (closureBlock.blocked) throw new ConflictError(closureBlock.reason ?? 'This bed is under an active closure');

    if (impact.allocation_id) {
      await db('allocations').where({ id: impact.allocation_id }).update({ status: 'ended', updated_at: db.fn.now() });
    }
    if (impact.source_bed_id) {
      await db('beds').where({ id: impact.source_bed_id }).update({ status: 'blocked', status_reason: 'Vacated for a closure/relocation case', updated_at: db.fn.now() });
    }

    const [newAllocation] = await db('allocations')
      .insert({
        org_id: closureCase.org_id,
        campus_id: closureCase.campus_id,
        application_id: null,
        student_id: impact.student_id,
        bed_id: destBed.id,
        status: 'checked_in_active',
        approver_user_id: user.sub,
        effective_from: db.fn.now(),
      })
      .returning('*');
    await db('beds').where({ id: destBed.id }).update({ status: 'occupied', updated_at: db.fn.now() });
    newAllocationId = newAllocation.id;
  }

  const after = await repo.updateImpact(impactId, {
    outcome: input.outcome,
    destination_bed_id: input.outcome === 'relocated' ? input.destinationBedId : null,
    new_allocation_id: newAllocationId,
    notes: input.notes ?? null,
    reconciled_at: db.fn.now(),
    reconciled_by: user.sub,
  });

  await recordAudit({
    orgId: closureCase.org_id,
    campusId: closureCase.campus_id,
    actorUserId: user.sub,
    action: 'closure_case.impact_resolved',
    entityType: 'closure_case_impact',
    entityId: impactId,
    before: impact,
    after,
  });
  await notify({
    orgId: closureCase.org_id,
    campusId: closureCase.campus_id,
    userId: impact.student_id,
    type: 'closure_case.impact_resolved',
    title:
      input.outcome === 'relocated'
        ? 'You have been relocated to a new bed as part of a closure case'
        : `Your closure case outcome was recorded: ${input.outcome.replace(/_/g, ' ')}`,
    link: '/allocations',
  });
  return after;
}

export async function updateReopeningChecklist(user: AuthUser, caseId: string, input: z.infer<typeof updateReopeningChecklistSchema>) {
  const before = await repo.findCaseById(caseId);
  if (!before) throw new NotFoundError('Closure case');
  if (before.case_type !== 'shutdown') throw new ConflictError('Only a shutdown case has a reopening checklist');
  if (!['active_closure', 'reopening_planned'].includes(before.status)) {
    throw new ConflictError(`Cannot update the reopening checklist on a case in status '${before.status}'`);
  }

  const checklist = { ...(before.reopening_checklist ?? {}) };
  checklist[input.key] = {
    completed: input.completed,
    completedBy: input.completed ? user.sub : undefined,
    completedAt: input.completed ? new Date().toISOString() : undefined,
    notes: input.notes,
  };

  const after = await repo.updateCase(caseId, {
    reopening_checklist: JSON.stringify(checklist),
    ...(before.status === 'active_closure' && { status: 'reopening_planned' }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'closure_case.reopening_checklist_updated',
    entityType: 'closure_case',
    entityId: caseId,
    before,
    after,
  });
  return after;
}

/**
 * Item 88's actual gate, from the other side: this is the ONLY path that
 * can move a shutdown case's scope back to 'active' — structure/service.ts's
 * updateHostel rejects a direct status='active' write while
 * repository.ts's findOpenCaseForHostel still finds this case open. A
 * mass_relocation case completes the same way but never touched the scope's
 * own status in the first place (see setScopeStatus's own comment), so
 * there's no separate structure-level gate needed for it — only the
 * pending-impact check applies.
 */
export async function completeClosureCase(user: AuthUser, caseId: string) {
  const before = await repo.findCaseById(caseId);
  if (!before) throw new NotFoundError('Closure case');
  if (!['active_closure', 'reopening_planned'].includes(before.status)) {
    throw new ConflictError(`Cannot complete a closure case in status '${before.status}'`);
  }

  const pendingCount = await repo.countPendingImpacts(caseId);
  if (pendingCount > 0) {
    throw new ConflictError(`${pendingCount} resident(s) still have an unresolved impact on this case — resolve every impact before completing`);
  }

  if (before.case_type === 'shutdown') {
    const checklist = before.reopening_checklist ?? {};
    const missing = REOPENING_CHECKLIST_KEYS.filter((key) => !checklist[key]?.completed);
    if (missing.length > 0) {
      throw new ConflictError(`Reopening checklist incomplete — missing: ${missing.join(', ')}`);
    }
  }

  await setScopeStatus(before.case_type, before.scope_type, before.scope_id, 'active', before.reason_category, null);

  const after = await repo.updateCase(caseId, {
    status: before.case_type === 'shutdown' ? 'reopened' : 'completed',
    actual_end_date: db.fn.now(),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: before.case_type === 'shutdown' ? 'closure_case.reopened' : 'closure_case.completed',
    entityType: 'closure_case',
    entityId: caseId,
    before,
    after,
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'closure_case.completed',
    title: `${before.case_type === 'shutdown' ? 'Hostel/floor/room reopened' : 'Mass relocation case completed'} — case closed`,
    link: '/closures',
  });
  return after;
}

export async function cancelClosureCase(user: AuthUser, caseId: string, input: z.infer<typeof cancelClosureCaseSchema>) {
  const before = await repo.findCaseById(caseId);
  if (!before) throw new NotFoundError('Closure case');
  if (!['proposed', 'approved'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a closure case in status '${before.status}' — once it's active, complete it instead of cancelling`);
  }

  const after = await repo.updateCase(caseId, { status: 'cancelled', decision_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'closure_case.cancelled',
    entityType: 'closure_case',
    entityId: caseId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function getClosureCase(id: string) {
  const closureCase = await repo.findCaseById(id);
  if (!closureCase) throw new NotFoundError('Closure case');
  const impacts = await repo.listImpacts(id);
  return { ...closureCase, impacts };
}

export async function listClosureCases(filters: { hostelId?: string; status?: string }) {
  return repo.listCases(filters);
}
