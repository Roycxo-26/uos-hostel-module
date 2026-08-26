import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import { notifyCampusStaff } from '../../utils/notify';
import * as headcountRepo from '../headcount/repository';
import * as movementRepo from '../movements/repository';
import * as repo from './repository';
import type {
  cancelDrillSchema,
  completeDrillSchema,
  markDrillEntrySchema,
  planDrillSchema,
  triggerEmergencySchema,
  updateSafetyStatusSchema,
} from './validators';

// ============================================================================
// D17.17 item 64 — hostel-level safety status projection. Deliberately
// hostel-scoped only, not per block/floor — the gap ledger's "property/area
// safety projection" language covers that; floor/block granularity is a
// real further step, not silently assumed here.
// ============================================================================

export async function updateSafetyStatus(user: AuthUser, hostelId: string, input: z.infer<typeof updateSafetyStatusSchema>) {
  const before = await repo.findHostel(hostelId);
  if (!before) throw new NotFoundError('Hostel');

  // The rule this schema/service exists to enforce, not just document:
  // COMPLIANT_CURRENT can never be inferred from unknown/stale data —
  // `dataAsOf` is always required by the schema, but a value from the
  // future would be a data-entry error, not genuinely "as of now".
  if (new Date(input.dataAsOf) > new Date()) {
    throw new ConflictError('dataAsOf cannot be in the future');
  }

  const after = await repo.updateHostelSafety(hostelId, {
    safety_status: input.status,
    safety_status_owner: input.owner,
    safety_data_as_of: input.dataAsOf,
    ...(input.profile !== undefined && { safety_profile: JSON.stringify(input.profile) }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'safety.status_updated',
    entityType: 'hostel',
    entityId: hostelId,
    before,
    after,
  });

  // A degraded/critical status is exactly the kind of thing the gap
  // ledger's own audit flags as needing to reach staff, not sit quietly on
  // a settings screen until someone happens to look.
  if (['FINDING_OPEN_CRITICAL', 'SAFETY_RESTRICTION_ACTIVE', 'CLOSED_FOR_SAFETY', 'EVACUATION_READINESS_DEGRADED'].includes(input.status)) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'safety.status_degraded',
      title: `Hostel safety status set to ${input.status.replace(/_/g, ' ')}`,
      link: '/structure',
    });
  }

  return after;
}

// ============================================================================
// D17.17 items 65/66 — evacuation drills and emergency muster, one
// lifecycle, `drill_type` distinguishing them.
// ============================================================================

async function validateScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string): Promise<{ campus_id: string }> {
  const table = scopeType === 'room' ? 'rooms' : scopeType === 'floor' ? 'floors' : 'hostels';
  const row = await db(table).where({ id: scopeId }).first('campus_id');
  if (!row) throw new NotFoundError(scopeType === 'room' ? 'Room' : scopeType === 'floor' ? 'Floor' : 'Hostel');
  return row;
}

export async function planDrill(user: AuthUser, input: z.infer<typeof planDrillSchema>) {
  const scope = await validateScope(input.scopeType, input.scopeId);
  const drill = await repo.createDrill({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    hostel_id: input.hostelId,
    drill_type: 'planned_drill',
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    status: 'planned',
    planned_date: input.plannedDate,
    assembly_points: input.assemblyPoints ? JSON.stringify(input.assemblyPoints) : null,
    opened_by: user.sub,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'drill.planned',
    entityType: 'evacuation_drill',
    entityId: drill.id,
    after: drill,
  });
  return drill;
}

/**
 * BRD's "validate resident, visitor and duty coverage snapshot" step —
 * kept as a plain staff confirmation for now rather than a real automatic
 * check, since the duty-roster module this would genuinely validate
 * against doesn't exist yet (D17.22, TODO.md Batch 21). Named here as a
 * real gap, not silently faked as a passing automatic check.
 */
export async function validateCoverage(user: AuthUser, drillId: string) {
  const before = await repo.findDrillById(drillId);
  if (!before) throw new NotFoundError('Evacuation drill');
  if (before.status !== 'planned') throw new ConflictError(`Cannot validate coverage on a drill in status '${before.status}'`);

  const after = await repo.updateDrill(drillId, { status: 'coverage_validated' });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'drill.coverage_validated',
    entityType: 'evacuation_drill',
    entityId: drillId,
    before,
    after,
  });
  return after;
}

/** Prefills entries the exact same way Headcount's openSession does —
 * residents currently checked in for this scope, minus those on an
 * approved/active movement (excused, not unresolved). Shared logic
 * imported directly from headcount/repository.ts and movements/
 * repository.ts rather than re-implemented — same cross-module
 * repository-to-repository pattern headcount/service.ts itself already
 * uses for responsibilities/movements. */
async function seedDrillEntries(orgId: string, campusId: string, drillId: string, scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  const residents = await headcountRepo.residentsInScope(scopeType, scopeId);
  for (const resident of residents) {
    const currentlyOut = await movementRepo.findCurrentlyOut(resident.student_id);
    await repo.createDrillEntry({
      org_id: orgId,
      campus_id: campusId,
      drill_id: drillId,
      student_id: resident.student_id,
      status: currentlyOut ? 'excused_on_leave' : 'unresolved',
    });
  }
  return residents.length;
}

export async function startDrill(user: AuthUser, drillId: string) {
  const before = await repo.findDrillById(drillId);
  if (!before) throw new NotFoundError('Evacuation drill');
  if (!['planned', 'coverage_validated', 'notified'].includes(before.status)) {
    throw new ConflictError(`Cannot start a drill in status '${before.status}'`);
  }

  const after = await repo.updateDrill(drillId, { status: 'in_progress', started_at: db.fn.now() });
  const count = await seedDrillEntries(user.org_id, before.campus_id, drillId, before.scope_type, before.scope_id);

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'drill.started',
    entityType: 'evacuation_drill',
    entityId: drillId,
    before,
    after: { ...after, residentCount: count },
  });
  return after;
}

/**
 * D17.17 item 66 — the emergency-muster path. Skips planning/coverage-
 * validation entirely (there is no time for either in a real emergency —
 * LAW-15 "emergency tickets bypass avoidable delay" applies exactly here)
 * and starts immediately in one call. Escalation is maximum-urgency
 * notification to every campus staff member, not a routine notify().
 */
export async function triggerEmergencyMuster(user: AuthUser, input: z.infer<typeof triggerEmergencySchema>) {
  const scope = await validateScope(input.scopeType, input.scopeId);
  const drill = await repo.createDrill({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    hostel_id: input.hostelId,
    drill_type: 'real_emergency',
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    status: 'in_progress',
    started_at: db.fn.now(),
    opened_by: user.sub,
  });
  const count = await seedDrillEntries(user.org_id, scope.campus_id, drill.id, input.scopeType, input.scopeId);

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'drill.emergency_triggered',
    entityType: 'evacuation_drill',
    entityId: drill.id,
    after: { ...drill, residentCount: count },
  });
  await notifyCampusStaff(db, user.org_id, scope.campus_id, {
    type: 'drill.emergency_triggered',
    title: `EMERGENCY MUSTER triggered for ${input.scopeType} — assemble and account for every resident now`,
    link: '/structure',
  });

  return drill;
}

export async function markDrillEntry(user: AuthUser, drillId: string, input: z.infer<typeof markDrillEntrySchema>) {
  const drill = await repo.findDrillById(drillId);
  if (!drill) throw new NotFoundError('Evacuation drill');
  if (drill.status !== 'in_progress') throw new ConflictError(`Cannot mark an entry on a drill in status '${drill.status}'`);

  const before = await db('evacuation_drill_entries').where({ drill_id: drillId, student_id: input.studentId }).first();
  if (!before) throw new NotFoundError('Roster entry for this resident on this drill');

  const after = await repo.updateDrillEntry(drillId, input.studentId, {
    status: input.status,
    note: input.note ?? null,
    recorded_by: user.sub,
    recorded_at: db.fn.now(),
  });
  await recordAudit({
    orgId: drill.org_id,
    campusId: drill.campus_id,
    actorUserId: user.sub,
    action: 'drill.entry_marked',
    entityType: 'evacuation_drill_entry',
    entityId: after.id,
    before,
    after,
  });
  return after;
}

/**
 * Completing a drill/muster with unresolved persons is NOT blocked — a
 * software gate that prevented staff from closing out a real emergency
 * because someone couldn't be located would be actively harmful
 * (LAW-22's own "high-risk actions retain human authority": the human
 * decision to stand down is theirs, not this system's to withhold). What
 * this does instead: an unresolved count above zero at completion fires a
 * loud escalation notification, not a silent one.
 */
export async function completeDrill(user: AuthUser, drillId: string, input: z.infer<typeof completeDrillSchema>) {
  const before = await repo.findDrillById(drillId);
  if (!before) throw new NotFoundError('Evacuation drill');
  if (before.status !== 'in_progress') throw new ConflictError(`Cannot complete a drill in status '${before.status}'`);

  const unresolvedCount = await repo.countUnresolvedEntries(drillId);
  const after = await repo.updateDrill(drillId, {
    status: 'completed',
    completed_at: db.fn.now(),
    unresolved_count: unresolvedCount,
    findings: input.findings ?? null,
    corrective_actions: input.correctiveActions ? JSON.stringify(input.correctiveActions) : null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'drill.completed',
    entityType: 'evacuation_drill',
    entityId: drillId,
    before,
    after,
  });

  if (unresolvedCount > 0) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'drill.unresolved_persons',
      title: `${before.drill_type === 'real_emergency' ? 'EMERGENCY' : 'Drill'} closed with ${unresolvedCount} unresolved resident(s) — escalate to emergency/safety command`,
      link: '/structure',
    });
  } else if (before.drill_type === 'real_emergency') {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'drill.emergency_resolved',
      title: 'Emergency muster closed — everyone accounted for',
      link: '/structure',
    });
  }

  return after;
}

export async function cancelDrill(user: AuthUser, drillId: string, input: z.infer<typeof cancelDrillSchema>) {
  const before = await repo.findDrillById(drillId);
  if (!before) throw new NotFoundError('Evacuation drill');
  if (!['planned', 'coverage_validated', 'notified'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a drill in status '${before.status}' — only a not-yet-started drill can be cancelled`);
  }

  const after = await repo.updateDrill(drillId, { status: 'cancelled' });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'drill.cancelled',
    entityType: 'evacuation_drill',
    entityId: drillId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function getDrill(id: string) {
  const drill = await repo.findDrillById(id);
  if (!drill) throw new NotFoundError('Evacuation drill');
  const entries = await repo.listDrillEntries(id);
  return { ...drill, entries };
}

export async function listDrills(filters: { hostelId?: string; status?: string }) {
  return repo.listDrills(filters);
}

// D17.17 item 67 — the allocation/check-in-blocking hook itself lives in
// repository.ts's findBedSafetyBlock(), not here: it's a pure, side-effect-
// free read, and allocations/service.ts consumes it as a repo-to-repo
// import (matching this codebase's "no service imports another module's
// service" convention — see that function's own comment for the full
// reasoning).
