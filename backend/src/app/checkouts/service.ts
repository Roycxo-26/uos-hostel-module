import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as financeRepo from '../finance/repository';
import { computeBalances } from '../finance/types';
import * as maintenanceRepo from '../maintenance/repository';
import { computeRoomReadiness } from '../maintenance/types';
import * as messKitchenRepo from '../messKitchen/repository';
import * as roomAccessRepo from '../roomAccess/repository';
import * as safetyRepo from '../safety/repository';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import { PREREQUISITE_CHECKLIST_KEYS_BY_TYPE } from './validators';
import type {
  addCheckoutInventoryItemSchema,
  approveCheckoutSchema,
  cancelCheckoutSchema,
  disputeDamageSchema,
  inspectCheckoutSchema,
  recordClearanceSchema,
  recordContactAttemptSchema,
  reopenCheckoutSchema,
  requestCheckoutSchema,
  updatePrerequisiteChecklistSchema,
} from './validators';
import type { Checkout, CheckoutType } from './types';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function canManageCheckouts(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'checkout:manage');
}

function emptyChecklist(checkoutType: CheckoutType): Record<string, { completed: boolean }> {
  const keys = PREREQUISITE_CHECKLIST_KEYS_BY_TYPE[checkoutType] ?? [];
  return Object.fromEntries(keys.map((k) => [k, { completed: false }]));
}

/** ux-flow.md §3.3 "Initiate checkout" — self-service by default, staff may
 * initiate on a resident's behalf, same pattern as Transfer/Movement.
 * D17.12 item 103/106 — 'abandonment' is staff-only outright (a resident
 * obviously can't self-report their own abandonment), and starts the
 * legal-waiting-period clock immediately. */
export async function requestCheckout(user: AuthUser, input: z.infer<typeof requestCheckoutSchema>) {
  const targetStudentId = input.studentId ?? user.sub;
  if (targetStudentId !== user.sub && !(await canManageCheckouts(user))) {
    throw new ForbiddenError('Only staff can initiate a checkout on behalf of another resident');
  }
  if (input.checkoutType === 'abandonment' && !(await canManageCheckouts(user))) {
    throw new ForbiddenError('Only staff can record an abandonment checkout');
  }

  const allocation = await db('allocations').where({ student_id: targetStudentId, status: 'checked_in_active' }).first();
  if (!allocation) throw new NotFoundError('Active allocation for this resident');

  const existingActive = await repo.findActiveForAllocation(allocation.id);
  if (existingActive) throw new ConflictError('A checkout is already in progress for this allocation');

  let legalWaitingPeriodEndsAt: Date | null = null;
  if (input.checkoutType === 'abandonment') {
    const settings = await getSettings(user.org_id);
    legalWaitingPeriodEndsAt = new Date(Date.now() + settings.policyDefaults.abandonmentLegalWaitingPeriodDays * 24 * 60 * 60 * 1000);
  }

  try {
    const row = await repo.create({
      org_id: user.org_id,
      campus_id: allocation.campus_id,
      student_id: targetStudentId,
      allocation_id: allocation.id,
      bed_id: allocation.bed_id,
      reason: input.reason,
      checkout_type: input.checkoutType,
      prerequisite_checklist: JSON.stringify(emptyChecklist(input.checkoutType)),
      legal_waiting_period_ends_at: legalWaitingPeriodEndsAt,
    });

    // flow.md §6.2B: CheckedInActive -> CheckoutPending — an existing,
    // previously-dormant allocation status (present since migration 5,
    // never used until now, same as transfer_pending/no_show_review).
    await db('allocations').where({ id: allocation.id }).update({ status: 'checkout_pending', updated_at: db.fn.now() });

    await recordAudit({
      orgId: user.org_id,
      campusId: allocation.campus_id,
      actorUserId: user.sub,
      action: 'checkout.requested',
      entityType: 'checkout',
      entityId: row.id,
      after: row,
    });

    // Real gap, found live via SELF-TEST-GUIDE.md C10 — same shape as the
    // gap already fixed on applications/movements/transfers/cases: this
    // wrote the row and audit entry and notified nobody. Staff had no
    // signal a checkout was even waiting for inspection.
    await notifyCampusStaff(db, user.org_id, allocation.campus_id, {
      type: 'checkout.requested',
      title: `New ${input.checkoutType.replace(/_/g, ' ')} checkout requested, awaiting inspection`,
      link: '/checkout',
    });

    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A checkout is already in progress for this allocation');
    throw err;
  }
}

export async function listCheckouts(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canManageCheckouts(user)) ? undefined : user.sub;
  return repo.list({ status: filters.status, studentId });
}

export async function getCheckout(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Checkout');
  if (row.student_id !== user.sub && !(await canManageCheckouts(user))) {
    throw new ForbiddenError('You can only view your own checkout');
  }
  const inventoryItems = await repo.listInventoryItems(id);
  const contactAttempts = row.checkout_type === 'abandonment' ? await repo.listContactAttempts(id) : [];
  const checkinItems = await repo.listCheckinItemsForAllocation(row.allocation_id);
  // D17.05 (TODO.md Batch 27) item 109 — the resident's real financial
  // picture, shown alongside the finance_cleared toggle instead of leaving
  // it a blind boolean. A repo-to-repo read + the shared pure
  // computeBalances() helper (see finance/types.ts's own comment) —
  // finance_cleared itself stays the operational gate, unchanged.
  const financeEvents = await financeRepo.listForStudent(row.student_id);
  const financeSummary = computeBalances(financeEvents);

  // D17.08 (TODO.md Batch 29) item 119 — §16.7's composite room-readiness
  // gate, shown alongside the existing markRoomReadyForReuse toggle
  // instead of replacing it (same "informed, not automatic, human gate"
  // reasoning as financeSummary above). Repo-to-repo reads only, mirroring
  // maintenance/service.ts's own fetchRoomReadinessGates exactly — that
  // function itself can't be imported here (it's another module's
  // service.ts), so the two must be kept in sync by hand if either
  // changes.
  const bed = await db('beds').where({ id: row.bed_id }).first('room_id');
  let roomReadiness = null;
  if (bed?.room_id) {
    const [activeAllocation, housekeepingTask, inspection, hasUnresolvedCritical, safetyBlock, settings] = await Promise.all([
      db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where({ 'beds.room_id': bed.room_id, 'allocations.status': 'checked_in_active' }).first('allocations.id'),
      maintenanceRepo.findLatestHousekeepingTaskForRoom(bed.room_id),
      maintenanceRepo.findLatestInspectionForRoom(bed.room_id),
      maintenanceRepo.hasUnresolvedCriticalTicket(bed.room_id),
      safetyRepo.findBedSafetyBlock(row.bed_id),
      getSettings(user.org_id),
    ]);
    const minScore = settings.policyDefaults.roomReadinessMinCleanlinessScore;
    roomReadiness = computeRoomReadiness({
      physicalVacancy: !activeAllocation,
      inventoryKeyClearance: Boolean(row.item_return_verified_at),
      housekeepingComplete: housekeepingTask?.status === 'completed',
      inspectionPassed: Boolean(inspection && inspection.cleanliness_score >= minScore && !inspection.safety_hazard_flag),
      safetyClear: !safetyBlock.blocked,
      maintenanceClear: !hasUnresolvedCritical,
    });
  }

  return { ...row, inventoryItems, contactAttempts, checkinItems, financeSummary, roomReadiness };
}

// Same TRIAGEABLE_FROM-style widening cases/service.ts already established
// for its own reopen — inspectCheckout is reachable from a freshly
// requested checkout OR one just reopened, re-triaged exactly the same way
// either time.
const INSPECTABLE_FROM = new Set(['requested', 'reopened']);

export async function inspectCheckout(user: AuthUser, id: string, input: z.infer<typeof inspectCheckoutSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can record an inspection');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (!INSPECTABLE_FROM.has(before.status)) throw new ConflictError(`Cannot inspect a checkout in status '${before.status}'`);

  const after = await repo.update(id, {
    status: 'inspected',
    inspection_notes: input.inspectionNotes ?? null,
    damage_found: input.damageFound,
    damage_charge_amount: input.damageChargeAmount ?? null,
    damage_description: input.damageDescription ?? null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.inspected',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C10 — the resident had no
  // way to know inspection happened, let alone that damage was found and a
  // charge is sitting on their checkout waiting to be disputed. Damage vs.
  // clean gets a different message; both still tell the resident something
  // actually moved.
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'checkout.inspected',
    title: input.damageFound
      ? `Damage found during your checkout inspection${input.damageChargeAmount ? ` (₹${input.damageChargeAmount})` : ''} — review and dispute if needed`
      : 'Your checkout inspection is complete — no damage found',
    link: '/checkout',
  });

  return after;
}

/** BR §10: "Resident review/dispute/waiver decision" — only the resident
 * being checked out, and only while there's a charge on record. */
export async function disputeDamage(user: AuthUser, id: string, input: z.infer<typeof disputeDamageSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (before.student_id !== user.sub) throw new ForbiddenError('Only the resident being checked out can dispute a damage charge');
  if (!before.damage_found) throw new ConflictError('No damage charge on record to dispute');

  const after = await repo.update(id, { damage_disputed: true, dispute_reason: input.disputeReason });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.damage_disputed',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
    reason: input.disputeReason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C10 — same shape as
  // appealCase's own gap in the cases module: a dispute is exactly the
  // kind of "new work waiting for staff" moment nothing notified anyone
  // about.
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'checkout.damage_disputed',
    title: 'A damage charge was disputed and needs review',
    link: '/checkout',
  });

  return after;
}

/** Stopgap manual confirmation — no live Desk/Finance integration exists,
 * same reasoning as movement_requests' staff-recorded exit/entry. */
export async function recordClearance(user: AuthUser, id: string, input: z.infer<typeof recordClearanceSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can record clearance status');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (!['inspected', 'reopened'].includes(before.status)) throw new ConflictError(`Cannot record clearance on a checkout in status '${before.status}'`);

  const after = await repo.update(id, {
    ...(input.deskCleared !== undefined && { desk_cleared: input.deskCleared }),
    ...(input.financeCleared !== undefined && { finance_cleared: input.financeCleared }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.clearance_recorded',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
  });

  return after;
}

// ============================================================================
// D17.12 item 103 — prerequisite checklist
// ============================================================================

export async function updatePrerequisiteChecklist(user: AuthUser, id: string, input: z.infer<typeof updatePrerequisiteChecklistSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can update the prerequisite checklist');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  const validKeys = PREREQUISITE_CHECKLIST_KEYS_BY_TYPE[before.checkout_type] ?? [];
  if (!validKeys.includes(input.key)) {
    throw new ValidationError(`'${input.key}' is not a valid checklist item for checkout type '${before.checkout_type}'`);
  }

  const checklist = { ...(before.prerequisite_checklist ?? {}) };
  checklist[input.key] = {
    completed: input.completed,
    completedBy: input.completed ? user.sub : undefined,
    completedAt: input.completed ? new Date().toISOString() : undefined,
    notes: input.notes,
  };

  const after = await repo.update(id, { prerequisite_checklist: JSON.stringify(checklist) });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.prerequisite_checklist_updated',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
  });
  return after;
}

// ============================================================================
// D17.12 item 104 — the three new independently-trackable milestones
// ============================================================================

async function assertMilestoneEditable(before: Checkout) {
  if (!['inspected', 'reopened'].includes(before.status)) {
    throw new ConflictError(`Cannot record this milestone on a checkout in status '${before.status}'`);
  }
}

export async function recordItemReturn(user: AuthUser, id: string) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can record item return');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  await assertMilestoneEditable(before);
  const after = await repo.update(id, { item_return_verified_at: db.fn.now(), item_return_verified_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'checkout.item_return_verified', entityType: 'checkout', entityId: id, before, after });
  return after;
}

export async function finalizeDamageAssessment(user: AuthUser, id: string) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can finalize the damage assessment');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  await assertMilestoneEditable(before);
  const after = await repo.update(id, { damage_assessment_finalized_at: db.fn.now(), damage_assessment_finalized_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'checkout.damage_assessment_finalized', entityType: 'checkout', entityId: id, before, after });

  // D17.05 (TODO.md Batch 27) item 108's own catalogue entry — a
  // damage_charge is a real financial event, not just two fields sitting
  // on the checkout row. Raised once, the first time this milestone is
  // finalized (`!before.damage_assessment_finalized_at` guards against a
  // second finalize call before approval re-raising a duplicate) — repo-to-
  // repo call, per this codebase's own "service.ts never imports another
  // module's service.ts" rule. Stays hostel_manual/proposed like every
  // other event; a Head Warden or standing Finance Officer still has to
  // confirm it separately (see finance/service.ts).
  if (!before.damage_assessment_finalized_at && before.damage_found && before.damage_charge_amount) {
    await financeRepo.create({
      org_id: user.org_id,
      campus_id: before.campus_id,
      student_id: before.student_id,
      event_type: 'damage_charge',
      amount: before.damage_charge_amount,
      description: before.damage_description ?? `Damage charge from checkout ${id}`,
      linked_reference_type: 'checkout',
      linked_reference_id: id,
      raised_by: user.sub,
    });
  }

  return after;
}

/** The real signal here is Batch 29 (Maintenance/housekeeping)'s own
 * readiness inspection, which doesn't exist yet — this is a plain staff
 * confirmation standing in for it, same "real gap, not silently faked"
 * reasoning safety/service.ts's validateCoverage already uses for its own
 * not-yet-built dependency. */
export async function markRoomReadyForReuse(user: AuthUser, id: string) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can mark the room ready for reuse');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  await assertMilestoneEditable(before);
  const after = await repo.update(id, { room_ready_for_reuse_at: db.fn.now(), room_ready_for_reuse_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'checkout.room_ready_for_reuse', entityType: 'checkout', entityId: id, before, after });
  return after;
}

// ============================================================================
// D17.12 item 106 — abandonment contact attempts
// ============================================================================

export async function recordContactAttempt(user: AuthUser, id: string, input: z.infer<typeof recordContactAttemptSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can record a contact attempt');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (before.checkout_type !== 'abandonment') throw new ConflictError('Contact attempts only apply to an abandonment checkout');

  const row = await repo.createContactAttempt({
    org_id: user.org_id,
    campus_id: before.campus_id,
    checkout_id: id,
    attempted_by: user.sub,
    method: input.method,
    outcome: input.outcome,
    notes: input.notes ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.contact_attempt_recorded',
    entityType: 'checkout_contact_attempt',
    entityId: row.id,
    after: row,
  });
  return row;
}

// ============================================================================
// D17.12 item 107 — itemized checkout inventory
// ============================================================================

export async function addCheckoutInventoryItem(user: AuthUser, id: string, input: z.infer<typeof addCheckoutInventoryItemSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can record checkout inventory');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (!['inspected', 'reopened'].includes(before.status)) throw new ConflictError(`Cannot record inventory on a checkout in status '${before.status}'`);

  if (input.checkinItemId) {
    const checkinItem = await db('checkin_inventory_items')
      .join('checkins', 'checkins.id', 'checkin_inventory_items.checkin_id')
      .where('checkin_inventory_items.id', input.checkinItemId)
      .andWhere('checkins.allocation_id', before.allocation_id)
      .first('checkin_inventory_items.id');
    if (!checkinItem) throw new ValidationError('That item is not from this resident\'s own check-in record.');
  }

  const row = await repo.createInventoryItem({
    org_id: user.org_id,
    campus_id: before.campus_id,
    checkout_id: id,
    checkin_item_id: input.checkinItemId ?? null,
    item_name: input.itemName,
    item_category: input.itemCategory,
    condition_at_checkout: input.conditionAtCheckout,
    classification: input.classification ?? null,
    photo_url: input.photoUrl ?? null,
    officer_notes: input.officerNotes ?? null,
    charge_amount: input.chargeAmount ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.inventory_item_recorded',
    entityType: 'checkout_inventory_item',
    entityId: row.id,
    after: row,
  });
  return row;
}

/**
 * BR's approval matrix: "Checkout override | Initiator: Warden | Approver:
 * Head Warden/Admin authorised role | Control: Reason + unresolved
 * clearance risks mandatory." Normal approval (clearances complete) needs
 * only 'warden'; an override (clearances incomplete) requires 'head_warden'
 * specifically — a plain Warden literally cannot force this through, not
 * even by delegation, since BR names Head Warden/Admin explicitly as the
 * override authority, not a general escalation.
 *
 * D17.12 item 104 — "all clear" now means all FIVE milestones, not two.
 * item 106 — an abandonment checkout has one more gate that NO override
 * can bypass: the legal waiting period and at least one logged contact
 * attempt. That's deliberate — the other five milestones are operational
 * housekeeping an authorised Head Warden can judgement-call past in an
 * emergency; the waiting period is a compliance boundary, not a judgement
 * call this codebase should let anyone override.
 */
export async function approveCheckout(user: AuthUser, id: string, input: z.infer<typeof approveCheckoutSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (!['inspected', 'reopened'].includes(before.status)) throw new ConflictError(`Cannot approve a checkout in status '${before.status}'`);

  if (before.checkout_type === 'abandonment') {
    const attemptCount = await repo.countContactAttempts(id);
    if (attemptCount === 0) throw new ConflictError('At least one contact attempt must be logged before an abandonment checkout can be approved');
    if (!before.legal_waiting_period_ends_at || new Date(before.legal_waiting_period_ends_at) > new Date()) {
      throw new ConflictError(`The legal waiting period has not elapsed yet (ends ${before.legal_waiting_period_ends_at})`);
    }
  }

  const allClear = Boolean(
    before.desk_cleared && before.finance_cleared && before.item_return_verified_at && before.damage_assessment_finalized_at && before.room_ready_for_reuse_at
  );
  if (!allClear && !input.overrideReason) {
    throw new ConflictError('Not all five checkout milestones are complete — provide an override reason to approve anyway, or wait for clearance');
  }

  const requiredRole = allClear ? 'warden' : 'head_warden';
  const resolution = await authorizeApproval(user, { requiredRole, campusId: before.campus_id, entityType: 'checkout' });

  const after = await repo.update(id, {
    status: 'completed',
    approved_by: user.sub,
    approved_at: db.fn.now(),
    bed_outcome: input.bedOutcome,
    ...(input.overrideReason && { override_reason: input.overrideReason }),
  });

  await db('allocations').where({ id: before.allocation_id }).update({ status: 'ended', updated_at: db.fn.now() });
  await db('beds').where({ id: before.bed_id }).update({ status: input.bedOutcome, updated_at: db.fn.now() });

  // D17.16 (TODO.md Batch 30, item 123) §24.4 — real occupancy just ended.
  await messKitchenRepo.recordOutboundEvent({
    org_id: user.org_id,
    campus_id: before.campus_id,
    student_id: before.student_id,
    event_type: 'd17.occupancy-ended.v1',
    payload: { checkoutId: id, allocationId: before.allocation_id, bedId: before.bed_id },
  });

  // D17.12 item 106 — belongings-inventory-and-storage route, reusing Batch
  // 18's property custody rather than a parallel storage concept. Only for
  // an abandonment checkout — an ordinary checkout's items go home with the
  // resident, not into custody.
  if (before.checkout_type === 'abandonment') {
    const items = await repo.listInventoryItems(id);
    for (const item of items) {
      await roomAccessRepo.createCustody({
        org_id: user.org_id,
        campus_id: before.campus_id,
        custody_type: 'checkout_belongings',
        item_description: item.item_name,
        student_id: before.student_id,
        collected_by: user.sub,
        condition_notes: item.officer_notes ?? null,
      });
    }
  }

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'checkout',
    entityId: id,
    requiredRole,
    resolution,
    actualApproverUserId: user.sub,
    reason: input.overrideReason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.completed',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
    reason: input.overrideReason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'checkout.completed',
    title: 'Your checkout is complete',
    body: input.overrideReason ? `Approved via override: ${input.overrideReason}` : undefined,
    link: '/checkout',
  });

  return after;
}

export async function cancelCheckout(user: AuthUser, id: string, input: z.infer<typeof cancelCheckoutSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (!['requested', 'inspected'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a checkout in status '${before.status}'`);
  }
  if (before.student_id !== user.sub && !(await canManageCheckouts(user))) {
    throw new ForbiddenError('Only the resident or staff can cancel this checkout');
  }

  const after = await repo.update(id, { status: 'cancelled' });

  // Undo the CheckedInActive -> CheckoutPending block from request time.
  await db('allocations').where({ id: before.allocation_id }).update({ status: 'checked_in_active', updated_at: db.fn.now() });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.cancelled',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — cancelling silently
  // notified nobody, whichever side did it. Staff may already have spent
  // inspection time on this if the resident cancels; the resident needs
  // telling if staff cancel on their behalf.
  if (user.sub === before.student_id) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'checkout.cancelled',
      title: 'A checkout was cancelled by the resident',
      link: '/checkout',
    });
  } else {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: before.student_id,
      type: 'checkout.cancelled',
      title: 'Your checkout was cancelled by staff',
      body: input.reason,
      link: '/checkout',
    });
  }

  return after;
}

/**
 * D17.12 item 105 — mirrors cases/service.ts's reopenCase exactly, plus one
 * extra safety check that Cases never needed: a completed checkout already
 * changed a PHYSICAL resource's state (the bed). Reopening only reverses
 * that if nothing else has touched the bed since — if it's already been
 * reassigned to a new occupant, reopening would silently collide with
 * them, so this refuses outright instead, naming the real reason rather
 * than corrupting two residents' occupancy at once.
 */
export async function reopenCheckout(user: AuthUser, id: string, input: z.infer<typeof reopenCheckoutSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can reopen a checkout');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (before.status !== 'completed') throw new ConflictError(`Cannot reopen a checkout in status '${before.status}'`);

  const bed = await db('beds').where({ id: before.bed_id }).first();
  if (!bed || bed.status !== before.bed_outcome) {
    throw new ConflictError('The bed this checkout released has already changed state since — cannot safely reopen without colliding with whatever is using it now');
  }

  const after = await repo.update(id, { status: 'reopened', reopen_reason: input.reopenReason });

  await db('allocations').where({ id: before.allocation_id }).update({ status: 'checked_in_active', updated_at: db.fn.now() });
  await db('beds').where({ id: before.bed_id }).update({ status: 'occupied', updated_at: db.fn.now() });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'checkout.reopened',
    entityType: 'checkout',
    entityId: id,
    before,
    after,
    reason: input.reopenReason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'checkout.reopened',
    title: 'Your completed checkout was reopened',
    body: input.reopenReason,
    link: '/checkout',
  });

  return after;
}
