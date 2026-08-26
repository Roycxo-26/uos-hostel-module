import { getPermissions, hasOrgRole, hasPermission, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type {
  cancelApplicationSchema,
  decideApplicationSchema,
  reopenApplicationSchema,
  resubmitApplicationSchema,
  submitApplicationSchema,
  withdrawApplicationSchema,
} from './validators';

const DECISION_LABEL: Record<string, string> = {
  approved: 'approved — moved to the allocation queue',
  waitlisted: 'waitlisted',
  returned: 'returned for correction',
  rejected: 'rejected',
};

/**
 * NOTE on eligibility: flow.md §16 (HST-OD items) and the source doc's Ch.6
 * both treat concrete eligibility rules (program/year/gender/distance/
 * category/accessibility) as tenant policy that hasn't been decided yet —
 * an Open Decision, not something to invent. This models the reviewer's
 * approve/waitlist/reject call *as* the eligibility decision (mandatory
 * reason for waitlist/reject) rather than fabricating a rules engine.
 */

export async function submitApplication(user: AuthUser, input: z.infer<typeof submitApplicationSchema>) {
  const campusId = resolveCampusId(user);

  const existing = await repo.findActiveForStudentTerm(user.sub, input.term);
  if (existing) {
    throw new ConflictError(`An active application already exists for term '${input.term}' (status: ${existing.status})`);
  }

  // D17.02 item 52 — renewalOfAllocationId only makes sense on a renewal
  // application; rejecting it elsewhere avoids a silently-ignored field.
  if (input.renewalOfAllocationId && input.applicationType !== 'renewal') {
    throw new ConflictError(`renewalOfAllocationId only applies when applicationType is 'renewal'`);
  }

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    student_id: user.sub,
    term: input.term,
    application_type: input.applicationType,
    renewal_of_allocation_id: input.renewalOfAllocationId ?? null,
    preferences: JSON.stringify(input.preferences),
    attachments: JSON.stringify(input.attachments),
    status: 'submitted',
  });

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'application.submitted',
    entityType: 'hostel_application',
    entityId: row.id,
    after: row,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C7 — every submission-style
  // action in this codebase (application, movement, transfer, case) wrote
  // its row and audit entry and then notified nobody; staff only ever found
  // out by manually re-checking a queue page. notify() below only fires on
  // a *decision*. Same fix applied in movements/transfers/cases services.
  await notifyCampusStaff(db, user.org_id, campusId, {
    type: 'application.submitted',
    title: 'New hostel application awaiting review',
    link: '/applications',
  });

  return row;
}

export async function getApplication(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Hostel application');
  // flow.md §5.2: a student may only ever see their own application, by ID
  // or by list — this closes the by-ID path (list is scoped below).
  if (!(await canViewAllApplications(user)) && row.student_id !== user.sub) {
    throw new ForbiddenError('You can only view your own application');
  }
  return row;
}

export async function listApplications(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canViewAllApplications(user)) ? undefined : user.sub;
  return repo.list({ status: filters.status, studentId });
}

// D17.02 item 51 — a reopened application is decidable again, exactly like
// a fresh submission or one already under review.
const DECIDABLE_FROM = new Set(['submitted', 'under_review', 'reopened']);

export async function decideApplication(user: AuthUser, applicationId: string, input: z.infer<typeof decideApplicationSchema>) {
  const before = await repo.findById(applicationId);
  if (!before) throw new NotFoundError('Hostel application');
  if (!DECIDABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot decide an application in status '${before.status}'`);
  }

  // flow.md §7 UX flow / HST-WF-02 narrative: an Approved application goes
  // straight into the allocation-ready queue — no separate manual gate
  // between "Approved" and "Allocation Ready" is described anywhere in the
  // source doc, so this treats them as one transition.
  const nextStatus = input.decision === 'approved' ? 'allocation_ready' : input.decision;

  const after = await repo.updateStatus(applicationId, {
    status: nextStatus,
    decision_reason: input.reason ?? null,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    // D17.02 item 50 — structured eligibility outcome, additive alongside
    // the workflow `status` transition above. Left untouched (not reset to
    // null) when the reviewer doesn't set one on this particular decision —
    // a prior conditional-eligibility record shouldn't vanish just because
    // a later, unrelated decision round didn't repeat it.
    ...(input.eligibilityOutcome !== undefined && { eligibility_outcome: input.eligibilityOutcome }),
    ...(input.eligibilityConditions !== undefined && { eligibility_conditions: JSON.stringify(input.eligibilityConditions) }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `application.${input.decision}`,
    entityType: 'hostel_application',
    entityId: applicationId,
    before,
    after,
    reason: input.reason,
  });

  // HOSTEL-GAP-ANALYSIS.md D17.03 item 53 gap-closure — 'waitlisted' used to
  // be nothing but this status label; deciding an application 'waitlisted'
  // now genuinely creates the real, ranked waitlist entry (see
  // allocations/service.ts's listWaitlist/getMyWaitlistPosition, the actual
  // consumers). Written as a direct table insert rather than importing
  // allocations/service.ts — this module never imports another module's
  // service layer (see e.g. createAllocation writing directly to
  // hostel_applications/beds), only ever its own repo plus shared table
  // access, so the same convention applies here in reverse.
  if (input.decision === 'waitlisted') {
    const preferences = before.preferences as Record<string, unknown> | null;
    await db('waitlist_entries').insert({
      org_id: user.org_id,
      campus_id: before.campus_id,
      application_id: applicationId,
      student_id: before.student_id,
      hostel_id: (preferences?.hostelId as string | undefined) ?? null,
    });
  }

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'application.decided',
    title: `Your hostel application was ${DECISION_LABEL[input.decision]}`,
    body: input.reason,
    link: '/applications',
  });

  return after;
}

/**
 * BR §6 / flow.md §6.3: RETURNED -> Submitted, a resubmission, not a new
 * decision round starting from Draft. Only the owning student may resubmit
 * (mirrors decideApplication's own reviewer-only symmetry), and only from
 * 'returned' — resubmitting an application that's in any other state would
 * either silently skip a decision round or resurrect a closed/rejected one.
 */
export async function resubmitApplication(user: AuthUser, applicationId: string, input: z.infer<typeof resubmitApplicationSchema>) {
  const before = await repo.findById(applicationId);
  if (!before) throw new NotFoundError('Hostel application');
  if (before.student_id !== user.sub) throw new ForbiddenError('You can only resubmit your own application');
  if (before.status !== 'returned') {
    throw new ConflictError(`Cannot resubmit an application in status '${before.status}' — only a returned application can be resubmitted`);
  }

  const after = await repo.updateStatus(applicationId, {
    status: 'submitted',
    decision_reason: null,
    decided_by: null,
    decided_at: null,
    ...(input.preferences !== undefined && { preferences: JSON.stringify(input.preferences) }),
    ...(input.attachments !== undefined && { attachments: JSON.stringify(input.attachments) }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'application.resubmitted',
    entityType: 'hostel_application',
    entityId: applicationId,
    before,
    after,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — a resubmission is
  // exactly the same "new work waiting for staff" moment the original
  // submission notification exists for, just missed on this action.
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'application.resubmitted',
    title: 'A returned application was resubmitted, awaiting review',
    link: '/applications',
  });

  return after;
}

// D17.02 item 51 — the three distinct outcomes BRD §10.6 lists that this
// module never had as real actions: Withdraw (applicant-voluntary),
// Cancel (institution-initiated, reason mandatory), Reopen (authorised
// correction/reconsideration, retaining prior episodes — decision_reason/
// decided_by/decided_at are deliberately left untouched, unlike
// resubmitApplication's reset, since a reopen is explicitly *not* a fresh
// decision round starting from a blank slate).

const WITHDRAWABLE_FROM = new Set(['draft', 'submitted', 'under_review', 'returned', 'waitlisted']);

export async function withdrawApplication(user: AuthUser, applicationId: string, input: z.infer<typeof withdrawApplicationSchema>) {
  const before = await repo.findById(applicationId);
  if (!before) throw new NotFoundError('Hostel application');
  if (before.student_id !== user.sub) throw new ForbiddenError('You can only withdraw your own application');
  if (!WITHDRAWABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot withdraw an application in status '${before.status}'`);
  }

  const after = await repo.updateStatus(applicationId, { status: 'withdrawn', decision_reason: input.reason ?? null });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'application.withdrawn',
    entityType: 'hostel_application',
    entityId: applicationId,
    before,
    after,
    reason: input.reason,
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'application.withdrawn',
    title: 'A hostel application was withdrawn by the applicant',
    link: '/applications',
  });
  return after;
}

const CANCELLABLE_FROM = new Set(['submitted', 'under_review', 'returned', 'waitlisted', 'allocation_ready']);

export async function cancelApplication(user: AuthUser, applicationId: string, input: z.infer<typeof cancelApplicationSchema>) {
  const before = await repo.findById(applicationId);
  if (!before) throw new NotFoundError('Hostel application');
  if (!CANCELLABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot cancel an application in status '${before.status}'`);
  }

  const after = await repo.updateStatus(applicationId, {
    status: 'cancelled',
    decision_reason: input.reason,
    decided_by: user.sub,
    decided_at: db.fn.now(),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'application.cancelled',
    entityType: 'hostel_application',
    entityId: applicationId,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'application.cancelled',
    title: 'Your hostel application was cancelled by the institution',
    body: input.reason,
    link: '/applications',
  });
  return after;
}

// Mirrors Cases' reopen pattern (backend/src/app/cases/service.ts) —
// broadened to any dead-end status, not just 'rejected'/'closed', since a
// withdrawn or cancelled application can just as legitimately need
// reopening (e.g. a resident who withdrew changes their mind, or an
// institution cancellation later turns out to be an error).
const REOPENABLE_FROM = new Set(['rejected', 'closed', 'cancelled', 'withdrawn']);

export async function reopenApplication(user: AuthUser, applicationId: string, input: z.infer<typeof reopenApplicationSchema>) {
  const before = await repo.findById(applicationId);
  if (!before) throw new NotFoundError('Hostel application');
  if (!REOPENABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot reopen an application in status '${before.status}'`);
  }

  const after = await repo.updateStatus(applicationId, { status: 'reopened', reopen_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'application.reopened',
    entityType: 'hostel_application',
    entityId: applicationId,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'application.reopened',
    title: 'Your hostel application was reopened for a fresh review',
    body: input.reason,
    link: '/applications',
  });
  return after;
}

/**
 * "Staff" here means the route-level gate on decideApplication
 * (requireHostelPermission('application:decide')) would also let this user
 * through — reusing that exact permission as the read-visibility signal
 * keeps the two in lockstep, rather than hand-maintaining a second notion of
 * "who counts as staff" that could drift from the actual route guard. Not
 * derivable from the JWT alone: Warden/Head Warden are this module's own
 * roles (hostel.user_roles), not the platform's org_role.
 */
async function canViewAllApplications(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'application:decide');
}
