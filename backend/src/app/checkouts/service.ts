import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type {
  approveCheckoutSchema,
  cancelCheckoutSchema,
  disputeDamageSchema,
  inspectCheckoutSchema,
  recordClearanceSchema,
  requestCheckoutSchema,
} from './validators';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function canManageCheckouts(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'checkout:manage');
}

/** ux-flow.md §3.3 "Initiate checkout" — self-service by default, staff may
 * initiate on a resident's behalf, same pattern as Transfer/Movement. */
export async function requestCheckout(user: AuthUser, input: z.infer<typeof requestCheckoutSchema>) {
  const targetStudentId = input.studentId ?? user.sub;
  if (targetStudentId !== user.sub && !(await canManageCheckouts(user))) {
    throw new ForbiddenError('Only staff can initiate a checkout on behalf of another resident');
  }

  const allocation = await db('allocations').where({ student_id: targetStudentId, status: 'checked_in_active' }).first();
  if (!allocation) throw new NotFoundError('Active allocation for this resident');

  const existingActive = await repo.findActiveForAllocation(allocation.id);
  if (existingActive) throw new ConflictError('A checkout is already in progress for this allocation');

  try {
    const row = await repo.create({
      org_id: user.org_id,
      campus_id: allocation.campus_id,
      student_id: targetStudentId,
      allocation_id: allocation.id,
      bed_id: allocation.bed_id,
      reason: input.reason,
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
      title: 'New checkout requested, awaiting inspection',
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
  return row;
}

export async function inspectCheckout(user: AuthUser, id: string, input: z.infer<typeof inspectCheckoutSchema>) {
  if (!(await canManageCheckouts(user))) throw new ForbiddenError('Only staff can record an inspection');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (before.status !== 'requested') throw new ConflictError(`Cannot inspect a checkout in status '${before.status}'`);

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
  if (before.status !== 'inspected') throw new ConflictError(`Cannot record clearance on a checkout in status '${before.status}'`);

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

/**
 * BR's approval matrix: "Checkout override | Initiator: Warden | Approver:
 * Head Warden/Admin authorised role | Control: Reason + unresolved
 * clearance risks mandatory." Normal approval (clearances complete) needs
 * only 'warden'; an override (clearances incomplete) requires 'head_warden'
 * specifically — a plain Warden literally cannot force this through, not
 * even by delegation, since BR names Head Warden/Admin explicitly as the
 * override authority, not a general escalation.
 */
export async function approveCheckout(user: AuthUser, id: string, input: z.infer<typeof approveCheckoutSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Checkout');
  if (before.status !== 'inspected') throw new ConflictError(`Cannot approve a checkout in status '${before.status}'`);

  const allClear = before.desk_cleared && before.finance_cleared;
  if (!allClear && !input.overrideReason) {
    throw new ConflictError('Clearances are not complete — provide an override reason to approve anyway, or wait for clearance');
  }

  const requiredRole = allClear ? 'warden' : 'head_warden';
  const resolution = await authorizeApproval(user, { requiredRole, campusId: before.campus_id });

  const after = await repo.update(id, {
    status: 'completed',
    approved_by: user.sub,
    approved_at: db.fn.now(),
    bed_outcome: input.bedOutcome,
    ...(input.overrideReason && { override_reason: input.overrideReason }),
  });

  await db('allocations').where({ id: before.allocation_id }).update({ status: 'ended', updated_at: db.fn.now() });
  await db('beds').where({ id: before.bed_id }).update({ status: input.bedOutcome, updated_at: db.fn.now() });

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
