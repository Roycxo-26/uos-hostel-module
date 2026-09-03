import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify } from '../../utils/notify';
import * as responsibilitiesRepo from '../responsibilities/repository';
import * as repo from './repository';
import { computeBalances } from './types';
import type {
  confirmFinancialEventSchema,
  disputeFinancialEventSchema,
  raiseFinancialEventSchema,
  reverseFinancialEventSchema,
} from './validators';

async function canManageFinance(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'finance_event:manage');
}

/**
 * item 109 — who may actually mark an event Finance-authoritative. BR.md
 * line 75's own role table names a distinct Finance Officer for this
 * ("post/confirm charge, receipt, deposit, refund or waiver result"), so
 * ordinary finance_event:manage (any Warden) is deliberately NOT enough —
 * same two-mechanism shape cases/service.ts's canManageWelfareCase already
 * established for the safeguarding tier: a stronger route-level permission
 * (finance_event:confirm, Head Warden only — see seeds/roleCatalogue) OR an
 * active standing 'finance_officer' responsibility_assignments row.
 */
async function canConfirmFinance(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  if (hasPermission(perms, 'finance_event:confirm')) return true;
  const standing = await responsibilitiesRepo.findActiveStandingRole(user.sub, ['finance_officer']);
  return Boolean(standing);
}

/** item 108/109 — always starts proposed/hostel_manual; only
 * confirmFinancialEvent below can move it to finance_confirmed/
 * finance_authoritative. Staff-only throughout — a resident proposing
 * their own charge would defeat the entire manual-evidence-vs-authoritative
 * distinction this table exists to enforce. */
export async function raiseFinancialEvent(user: AuthUser, input: z.infer<typeof raiseFinancialEventSchema>) {
  if (!(await canManageFinance(user))) throw new ForbiddenError('Only staff can raise a financial event');
  const campusId = resolveCampusId(user);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    student_id: input.studentId,
    event_type: input.eventType,
    amount: input.amount,
    description: input.description,
    evidence_notes: input.evidenceNotes ?? null,
    linked_reference_type: input.linkedReferenceType ?? null,
    linked_reference_id: input.linkedReferenceId ?? null,
    raised_by: user.sub,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'finance_event.raised',
    entityType: 'financial_event',
    entityId: row.id,
    after: row,
  });
  await notify({
    orgId: user.org_id,
    campusId,
    userId: input.studentId,
    type: 'finance_event.raised',
    title: `A ${input.eventType.replace(/_/g, ' ')} of ₹${input.amount} was recorded on your account — pending Finance confirmation`,
    body: input.description,
    link: '/finance',
  });

  return row;
}

export async function listFinancialEvents(user: AuthUser, filters: { studentId?: string; status?: string; eventType?: string }) {
  const isStaff = await canManageFinance(user);
  return repo.list({ ...filters, studentId: isStaff ? filters.studentId : user.sub });
}

export async function getFinancialEvent(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Financial event');
  if (row.student_id !== user.sub && !(await canManageFinance(user))) {
    throw new ForbiddenError('You can only view your own financial events');
  }
  return row;
}

/**
 * item 108 — the projection model. `confirmedBalance` only ever sums what
 * this tenant's own confirm action has actually marked finance_confirmed;
 * `pendingProjection` is everything Hostel has proposed but Finance hasn't
 * confirmed yet — a projection, never authoritative, named as such in the
 * field itself so no future caller mistakes it for a real balance. A
 * reversed event counts toward neither. mess_fee_reference never counts —
 * Mess owns that fee (BR.md §2), Hostel only references it.
 */
export async function getResidentFinancialSummary(user: AuthUser, studentId: string) {
  if (studentId !== user.sub && !(await canManageFinance(user))) {
    throw new ForbiddenError('You can only view your own financial summary');
  }
  const events = await repo.listForStudent(studentId);
  return { studentId, ...computeBalances(events), events };
}

/** item 109's DEV-SIMULATED Finance confirmation — no live Finance system
 * exists to call, so this is the dev-mode stand-in for the webhook/API
 * confirmation a real integration would eventually send, same reasoning as
 * the guardian OTP simulation (Batch 23). Available regardless of the
 * `disputed` flag — confirming a disputed event is itself a real, human
 * decision ("the dispute doesn't change the outcome"), not a bug to guard
 * against; the flag stays on the row either way as a permanent record that
 * it was once disputed, same as Checkout never clears damage_disputed. */
export async function confirmFinancialEvent(user: AuthUser, id: string, _input: z.infer<typeof confirmFinancialEventSchema>) {
  if (!(await canConfirmFinance(user))) throw new ForbiddenError('Only Head Warden or a standing Finance Officer can confirm a financial event');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Financial event');
  if (before.status === 'finance_confirmed') throw new ConflictError('Already confirmed');
  if (before.status === 'reversed') throw new ConflictError('Cannot confirm a reversed event');

  const after = await repo.update(id, {
    status: 'finance_confirmed',
    source: 'finance_authoritative',
    confirmed_by: user.sub,
    confirmed_at: db.fn.now(),
  });

  await recordAudit({
    orgId: before.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'finance_event.confirmed',
    entityType: 'financial_event',
    entityId: id,
    before,
    after,
  });
  await notify({
    orgId: before.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'finance_event.confirmed',
    title: `Finance confirmed your ${before.event_type.replace(/_/g, ' ')} of ₹${before.amount}`,
    link: '/finance',
  });

  return after;
}

/** Mirrors Checkout's own disputeDamage — only the resident this event
 * belongs to, and only while it's still awaiting confirmation (BR-HOS-014:
 * Hostel proposes, Finance confirms; disputing something already Finance-
 * confirmed is out of this module's authority to reverse unilaterally). */
export async function disputeFinancialEvent(user: AuthUser, id: string, input: z.infer<typeof disputeFinancialEventSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Financial event');
  if (before.student_id !== user.sub) throw new ForbiddenError('Only the resident this event belongs to can dispute it');
  if (before.status !== 'proposed') throw new ConflictError(`Cannot dispute an event in status '${before.status}'`);

  const after = await repo.update(id, { status: 'disputed', disputed: true, dispute_reason: input.disputeReason });

  await recordAudit({
    orgId: before.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'finance_event.disputed',
    entityType: 'financial_event',
    entityId: id,
    before,
    after,
    reason: input.disputeReason,
  });

  return after;
}

/** Staff's resolution path for a disputed (or simply mistaken) event —
 * voids it outright rather than editing the amount, same "never rewrite,
 * always record what actually happened" reasoning resident_privilege_
 * changes' supersededBy and cases' reopen both already follow. A voided
 * charge that should still be collected is raised again as a fresh event,
 * not un-reversed. */
export async function reverseFinancialEvent(user: AuthUser, id: string, input: z.infer<typeof reverseFinancialEventSchema>) {
  if (!(await canManageFinance(user))) throw new ForbiddenError('Only staff can reverse a financial event');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Financial event');
  if (before.status === 'reversed') throw new ConflictError('Already reversed');

  const after = await repo.update(id, {
    status: 'reversed',
    reversed_by: user.sub,
    reversed_at: db.fn.now(),
    reversal_reason: input.reason,
  });

  await recordAudit({
    orgId: before.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'finance_event.reversed',
    entityType: 'financial_event',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: before.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'finance_event.reversed',
    title: `Your ${before.event_type.replace(/_/g, ' ')} of ₹${before.amount} was reversed`,
    body: input.reason,
    link: '/finance',
  });

  return after;
}
