import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import * as financeRepo from '../finance/repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import type {
  acknowledgeReturnSchema,
  cancelOrderSchema,
  linkComplaintSchema,
  markUnclaimedSchema,
  recordPickupSchema,
  recordReturnSchema,
  reopenOrderSchema,
  reportExceptionSchema,
  requestOrderSchema,
  resolveExceptionSchema,
} from './validators';

async function canManageLaundry(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'laundry:manage');
}

/** §24G.1: "D17 owns the resident service request/order, handoff,
 * status, quantity/condition evidence and complaint/reconciliation
 * context." Self-service by default, same pattern as checkouts/
 * movements/transfers — staff may request on a resident's behalf. */
export async function requestOrder(user: AuthUser, input: z.infer<typeof requestOrderSchema>) {
  const isStaff = await canManageLaundry(user);
  const targetStudentId = input.studentId ?? user.sub;
  if (targetStudentId !== user.sub && !isStaff) {
    throw new ForbiddenError('Only staff can request a laundry order on behalf of another resident');
  }
  const campusId = resolveCampusId(user);
  const settings = await getSettings(user.org_id);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    student_id: targetStudentId,
    service_type: input.serviceType,
    pickup_drop_location: input.pickupDropLocation ?? null,
    bag_token_id: input.bagTokenId ?? null,
    requested_pickup_at: input.requestedPickupAt ? new Date(input.requestedPickupAt) : null,
    item_categories: input.itemCategories ? JSON.stringify(input.itemCategories) : null,
    sla_hours: settings.policyDefaults.laundryDefaultSlaHours,
    created_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'laundry_order.requested', entityType: 'laundry_order', entityId: row.id, after: row });
  await notifyCampusStaff(db, user.org_id, campusId, {
    type: 'laundry_order.requested',
    title: `A ${input.serviceType.replace(/_/g, ' ')} laundry order is awaiting acceptance`,
    link: '/laundry',
  });
  return row;
}

export async function listOrders(user: AuthUser, filters: { status?: string; studentId?: string }) {
  const isStaff = await canManageLaundry(user);
  return repo.list({ ...filters, studentId: isStaff ? filters.studentId : user.sub });
}

export async function getOrder(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Laundry order');
  if (row.student_id !== user.sub && !(await canManageLaundry(user))) {
    throw new ForbiddenError('You can only view your own laundry orders');
  }
  return row;
}

export async function acceptOrder(user: AuthUser, id: string) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can accept a laundry order');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'requested') throw new ConflictError(`Cannot accept an order in status '${before.status}'`);

  const after = await repo.update(id, { status: 'accepted' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.accepted', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}

/** Folds §24G.4's COUNT_VERIFIED into this one action — recording a
 * pickup count/weight IS the count verification, not a separate step. */
export async function recordPickup(user: AuthUser, id: string, input: z.infer<typeof recordPickupSchema>) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can record a laundry pickup');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'accepted') throw new ConflictError(`Cannot record pickup for an order in status '${before.status}'`);

  const after = await repo.update(id, {
    status: 'picked_up',
    actual_pickup_at: db.fn.now(),
    pickup_count: input.pickupCount,
    pickup_weight: input.pickupWeight ?? null,
    condition_exceptions_at_handoff: input.conditionExceptionsAtHandoff ?? null,
    bag_token_id: input.bagTokenId ?? before.bag_token_id,
    provider_reference: input.providerReference ?? before.provider_reference,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.picked_up', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}

export async function startProcessing(user: AuthUser, id: string) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can start processing a laundry order');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'picked_up') throw new ConflictError(`Cannot start processing an order in status '${before.status}'`);
  if (!before.pickup_count) throw new ConflictError('Cannot start processing before a pickup count is recorded');

  const after = await repo.update(id, { status: 'in_process' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.in_process', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}

/** Folds §24G.4's NOTIFIED into this action. */
export async function markReadyForReturn(user: AuthUser, id: string) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can mark a laundry order ready for return');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'in_process') throw new ConflictError(`Cannot mark ready an order in status '${before.status}'`);

  const after = await repo.update(id, { status: 'ready_for_return' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.ready_for_return', entityType: 'laundry_order', entityId: id, before, after });
  await notify({ orgId: user.org_id, campusId: before.campus_id, userId: before.student_id, type: 'laundry_order.ready_for_return', title: 'Your laundry is ready for return', link: '/laundry' });
  return after;
}

export async function recordReturn(user: AuthUser, id: string, input: z.infer<typeof recordReturnSchema>) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can record a laundry return');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'ready_for_return') throw new ConflictError(`Cannot record return for an order in status '${before.status}'`);

  const after = await repo.update(id, { status: 'returned', returned_count: input.returnedCount, returned_condition_notes: input.returnedConditionNotes ?? null, returned_at: db.fn.now() });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.returned', entityType: 'laundry_order', entityId: id, before, after });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'laundry_order.returned',
    title: 'Your laundry has been returned — please confirm the count',
    link: '/laundry',
  });
  return after;
}

/** §24G.3 "resident acknowledgement" — only the resident it belongs to. */
export async function acknowledgeReturn(user: AuthUser, id: string, _input: z.infer<typeof acknowledgeReturnSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'returned') throw new ConflictError(`Cannot acknowledge an order in status '${before.status}'`);
  if (before.student_id !== user.sub) throw new ForbiddenError('Only the resident this order belongs to can acknowledge it');

  const after = await repo.update(id, { status: 'resident_acknowledged', resident_acknowledged_at: db.fn.now() });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.acknowledged', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}

export async function closeOrder(user: AuthUser, id: string) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can close a laundry order');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'resident_acknowledged') throw new ConflictError(`Cannot close an order in status '${before.status}'`);

  const after = await repo.update(id, { status: 'closed' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.closed', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}

const EXCEPTION_REPORTABLE_FROM = new Set(['returned', 'ready_for_return', 'in_process']);

async function reportException(
  user: AuthUser,
  id: string,
  status: 'count_dispute' | 'lost_item' | 'damaged_item',
  input: z.infer<typeof reportExceptionSchema>
) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (!EXCEPTION_REPORTABLE_FROM.has(before.status)) throw new ConflictError(`Cannot report an exception for an order in status '${before.status}'`);
  if (before.student_id !== user.sub && !(await canManageLaundry(user))) {
    throw new ForbiddenError('Only the resident this order belongs to, or staff, can report this exception');
  }

  const after = await repo.update(id, { status, exception_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: `laundry_order.${status}`, entityType: 'laundry_order', entityId: id, before, after, reason: input.reason });
  await notifyCampusStaff(db, user.org_id, before.campus_id, { type: `laundry_order.${status}`, title: `A laundry order has a reported ${status.replace(/_/g, ' ')}`, body: input.reason, link: '/laundry' });
  return after;
}

export const disputeCount = (user: AuthUser, id: string, input: z.infer<typeof reportExceptionSchema>) => reportException(user, id, 'count_dispute', input);
export const reportLostItem = (user: AuthUser, id: string, input: z.infer<typeof reportExceptionSchema>) => reportException(user, id, 'lost_item', input);
export const reportDamagedItem = (user: AuthUser, id: string, input: z.infer<typeof reportExceptionSchema>) => reportException(user, id, 'damaged_item', input);

/** §24G.5: "Lost/damaged compensation requires authorised assessment and
 * Finance handoff." A compensation amount here raises a real Finance
 * 'refund' event (Batch 27's own table, repo-to-repo) linked back to this
 * order — never a direct wallet write, per D17-LAW-41. */
export async function resolveException(user: AuthUser, id: string, input: z.infer<typeof resolveExceptionSchema>) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can resolve a laundry exception');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (!['count_dispute', 'lost_item', 'damaged_item'].includes(before.status)) {
    throw new ConflictError(`Cannot resolve an exception for an order in status '${before.status}'`);
  }

  const after = await repo.update(id, {
    status: input.outcome === 'resolved_forward' ? 'returned' : 'closed',
    resolved_by: user.sub,
    resolved_at: db.fn.now(),
    resolution_notes: input.notes,
  });

  if (input.compensationAmount) {
    await financeRepo.create({
      org_id: user.org_id,
      campus_id: before.campus_id,
      student_id: before.student_id,
      event_type: 'refund',
      amount: input.compensationAmount,
      description: `Laundry ${before.status.replace(/_/g, ' ')} compensation: ${input.notes}`,
      linked_reference_type: 'laundry_order',
      linked_reference_id: id,
      raised_by: user.sub,
    });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'laundry_order.exception_resolved',
    entityType: 'laundry_order',
    entityId: id,
    before,
    after,
    reason: input.notes,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'laundry_order.exception_resolved',
    title: 'Your laundry order exception has been resolved',
    body: input.notes,
    link: '/laundry',
  });
  return after;
}

export async function markUnclaimed(user: AuthUser, id: string, _input: z.infer<typeof markUnclaimedSchema>) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can mark a laundry order unclaimed');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'ready_for_return') throw new ConflictError(`Cannot mark unclaimed an order in status '${before.status}'`);

  const after = await repo.update(id, { status: 'unclaimed_return' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.unclaimed', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}

const CANCELLABLE_FROM = new Set(['requested', 'accepted']);

export async function cancelOrder(user: AuthUser, id: string, input: z.infer<typeof cancelOrderSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (!CANCELLABLE_FROM.has(before.status)) throw new ConflictError(`Cannot cancel an order in status '${before.status}'`);
  if (before.student_id !== user.sub && !(await canManageLaundry(user))) {
    throw new ForbiddenError('Only the resident this order belongs to, or staff, can cancel it');
  }

  const after = await repo.update(id, { status: 'cancelled', cancelled_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.cancelled', entityType: 'laundry_order', entityId: id, before, after, reason: input.reason });
  return after;
}

export async function reopenOrder(user: AuthUser, id: string, input: z.infer<typeof reopenOrderSchema>) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can reopen a laundry order');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');
  if (before.status !== 'closed') throw new ConflictError(`Cannot reopen an order in status '${before.status}'`);

  const after = await repo.update(id, { status: 'reopened', reopen_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.reopened', entityType: 'laundry_order', entityId: id, before, after, reason: input.reason });
  return after;
}

/** §24G.3 "complaint/service-recovery reference" — a manual staff
 * cross-reference to a Case raised separately, same "not auto-linked"
 * reasoning as visitors'/off-campus's own issue-handoff comments. */
export async function linkComplaint(user: AuthUser, id: string, input: z.infer<typeof linkComplaintSchema>) {
  if (!(await canManageLaundry(user))) throw new ForbiddenError('Only staff can link a complaint reference');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Laundry order');

  const after = await repo.update(id, { complaint_reference: input.complaintReference });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'laundry_order.complaint_linked', entityType: 'laundry_order', entityId: id, before, after });
  return after;
}
