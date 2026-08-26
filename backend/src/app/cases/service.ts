import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type {
  appealCaseSchema,
  decideCaseSchema,
  investigateCaseSchema,
  issueNoticeSchema,
  reopenCaseSchema,
  reportCaseSchema,
  resolveCaseSchema,
  triageCaseSchema,
} from './validators';

async function canManageCases(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'case:manage');
}

/** BR §9's own "fair response opportunity" requires the case SUBJECT to be
 * able to see their own notice/decision, not just the reporter — a real
 * gap found while wiring notifications (subject_user_id didn't exist when
 * canViewCase was first written in Batch 6) and fixed here alongside it.
 *
 * BR §16 controls: confidential cases are need-to-know — reporter, subject,
 * the assigned staffer, or a platform admin, not every Warden by default.
 * Filtered in-app rather than at the DB layer: acceptable at Phase 1 case
 * volume, flagged here as the thing to move to a DB-level filter first if
 * that stops being true.
 *
 * Real bug #1, found live via SELF-TEST-GUIDE.md C8/C9 prep: as written, an
 * UNASSIGNED confidential case (assigned_to still null — the state every
 * confidential case starts in) was invisible to every Warden/Head Warden
 * who wasn't the reporter/subject, with no exception. triageCase() itself
 * only ever checked canManageCases(), so the API *could* triage it — but
 * nothing in the UI could ever find it or open it to call that action in
 * the first place, a real deadlock: nobody could become the assignee,
 * because nobody but the reporter/subject could see it to assign
 * themselves. First fix: let case-managing staff see a confidential case
 * while it's still unassigned.
 *
 * Real bug #2, found live one step later in the SAME C9 walkthrough: that
 * first fix reverted visibility to strict need-to-know (reporter/subject/
 * the one assignee/admin) the moment ANYONE triaged it — which recreated
 * the exact same deadlock one stage further in. A Warden triages,
 * investigates, and issues notice on their own case, assigned to
 * themselves — but decideCase() requires HEAD WARDEN authority, a
 * different person who was never the assignee and now can't see the case
 * at all to act on it. Fixed by broadening visibility again once a case
 * reaches a decision-point-or-later status — notice_issued/appealed and
 * everything past them — to any case-managing staff, not just the
 * assignee. Confidentiality still holds tightly during active
 * investigation (assigned/in_progress): only the assignee, not every
 * Warden, can see working material mid-investigation. */
const CASE_STATUSES_NEEDING_BROADER_STAFF_VISIBILITY = new Set(['notice_issued', 'appealed', 'decided', 'resolved', 'closed', 'reopened']);

async function canViewCase(
  user: AuthUser,
  row: { reporter_user_id: string; subject_user_id: string | null; confidential: boolean; assigned_to: string | null; status: string }
): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  if (row.reporter_user_id === user.sub || row.subject_user_id === user.sub) return true;
  if (!row.confidential) return true; // non-confidential visibility to staff is enforced by canManageCases at the list/route level already
  if (row.assigned_to === user.sub) return true;
  if (!row.assigned_to || CASE_STATUSES_NEEDING_BROADER_STAFF_VISIBILITY.has(row.status)) return canManageCases(user);
  return false;
}

/** Who a notice/decision actually concerns — falls back to the reporter
 * when no distinct subject was named (the common Complaint case). */
function caseSubject(row: { reporter_user_id: string; subject_user_id: string | null }): string {
  return row.subject_user_id ?? row.reporter_user_id;
}

/** ux-flow.md §3.3 "Hostel Complaint form" / old rule book §10 "Incident
 * Report" — one intake for both, `caseType` only changes labeling
 * downstream (see migration's own comment). Complaints get an immediate
 * stub Desk ticket reference (BR §9/HST-WF-14: "create idempotent Desk
 * ticket" as part of intake) — incidents don't, they go through
 * discipline/security instead, not Desk. */
export async function reportCase(user: AuthUser, input: z.infer<typeof reportCaseSchema>) {
  const campusId = resolveCampusId(user);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    reporter_user_id: user.sub,
    subject_user_id: input.subjectUserId ?? null,
    case_type: input.caseType,
    category: input.category,
    description: input.description,
    room_id: input.roomId ?? null,
    confidential: input.confidential,
    evidence: JSON.stringify(input.evidence),
    status: 'reported',
    ...(input.caseType === 'complaint' && { desk_ticket_reference: JSON.stringify({ status: 'pending_integration' }) }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'case.reported',
    entityType: 'case',
    entityId: row.id,
    after: row,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C7 — this wrote the row and
  // audit entry and notified nobody; staff only found out by manually
  // re-checking the queue. Same fix applied in applications/movements/
  // transfers services. Originally left OUT for confidential cases here,
  // reasoning that canViewCase()/listCases() hid an unassigned confidential
  // case from every non-reporter/subject Warden, so notifying them would
  // leak more than the list allowed them to see. That visibility gap is now
  // fixed (canViewCase lets case-managing staff see a confidential case
  // while it's still unassigned, specifically so someone CAN triage it) —
  // so withholding the notification here would just recreate the same
  // "how would anyone even know to look" dead end from the other side.
  // Title stays fully generic either way (no reporter/category/description
  // detail), same as every other notification in this codebase.
  await notifyCampusStaff(db, user.org_id, campusId, {
    type: 'case.reported',
    title: `New ${input.caseType} reported, awaiting triage`,
    link: '/cases',
  });

  return row;
}

/** Any authenticated user — self-service, same reasoning as reportCase
 * itself. Not staff-gated and not filtered to 'student' role holders; see
 * repository.ts's own comment on why this can't just reuse
 * responsibilities' listResidentCandidates(). Returns everyone, including
 * the caller — see repository.ts's own comment on why self-exclusion
 * doesn't belong at this layer any more. */
export async function listResidentDirectory(_user: AuthUser) {
  return repo.listResidentDirectory();
}

/** Staff-only (mirrors triageCase's own gate) — who a case can actually be
 * assigned to, not the general resident directory above. */
export async function listCaseStaffDirectory(user: AuthUser) {
  return repo.listCaseStaffDirectory(resolveCampusId(user));
}

export async function listCases(user: AuthUser, filters: { status?: string; caseType?: string }) {
  const isStaff = await canManageCases(user);
  const rows = await repo.list({ ...filters, involvingUserId: isStaff ? undefined : user.sub });
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return rows;
  // Mirrors canViewCase's own carve-out exactly — see that function's
  // comment for both bugs this closes. Staff see a confidential case when
  // it's unassigned (so someone can triage it) or once it's reached a
  // decision-point-or-later status (so the deciding authority, often not
  // the assignee, can reach it) — otherwise only the current assignee.
  return rows.filter(
    (r) =>
      !r.confidential ||
      r.reporter_user_id === user.sub ||
      r.subject_user_id === user.sub ||
      r.assigned_to === user.sub ||
      (isStaff && (!r.assigned_to || CASE_STATUSES_NEEDING_BROADER_STAFF_VISIBILITY.has(r.status)))
  );
}

export async function getCase(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Case');
  if (!(await canViewCase(user, row))) throw new ForbiddenError('You do not have access to this case');
  return row;
}

// Real gap, found live via SELF-TEST-GUIDE.md C9 — reopenCase set status to
// 'reopened' with no action anywhere, front or back end, that ever accepted
// it as a starting point: a genuine dead end, same shape as the "Resolved"
// trap (bug #11) on a different transition. A reopened case gets re-triaged
// exactly like a freshly reported one — severity and assignment both get
// reconsidered rather than assumed still valid from before the reopen —
// which is why this is a widened Set rather than a new status-specific
// branch: it's the same step, just reachable from a second starting point.
const TRIAGEABLE_FROM = new Set(['reported', 'reopened']);

export async function triageCase(user: AuthUser, id: string, input: z.infer<typeof triageCaseSchema>) {
  if (!(await canManageCases(user))) throw new ForbiddenError('Only staff can triage a case');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  if (!TRIAGEABLE_FROM.has(before.status)) throw new ConflictError(`Cannot triage a case in status '${before.status}'`);
  // HOSTEL-GAP-ANALYSIS.md D17.21 item 80 gap-closure — the challenged
  // actor must never be the sole final reviewer of their own contested
  // matter. subject_user_id isn't restricted to students; nothing
  // previously stopped a staff member named as a case's subject from
  // being assigned to triage/investigate their own case. Flagged in the
  // gap ledger as a real, confirmed gap — closed here, not assumed
  // unreachable just because it's rare in practice.
  if (input.assignedTo === before.subject_user_id) {
    throw new ConflictError('Cannot assign a case to the person it concerns — this is a conflict of interest');
  }

  const after = await repo.update(id, {
    severity: input.severity,
    ...(input.confidential !== undefined && { confidential: input.confidential }),
    assigned_to: input.assignedTo,
    status: 'assigned',
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.triaged',
    entityType: 'case',
    entityId: id,
    before,
    after,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: input.assignedTo,
    type: 'case.assigned',
    title: `A ${before.case_type} was assigned to you: ${before.category}`,
    link: '/cases',
  });

  return after;
}

export async function investigateCase(user: AuthUser, id: string, input: z.infer<typeof investigateCaseSchema>) {
  if (!(await canManageCases(user))) throw new ForbiddenError('Only staff can investigate a case');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  if (before.status !== 'assigned') throw new ConflictError(`Cannot start investigation on a case in status '${before.status}'`);

  const after = await repo.update(id, { status: 'in_progress', investigation_notes: input.investigationNotes });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.investigation_started',
    entityType: 'case',
    entityId: id,
    before,
    after,
  });

  return after;
}

export async function resolveCase(user: AuthUser, id: string, input: z.infer<typeof resolveCaseSchema>) {
  if (!(await canManageCases(user))) throw new ForbiddenError('Only staff can resolve a case');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  if (before.status !== 'in_progress') throw new ConflictError(`Cannot resolve a case in status '${before.status}' — no disciplinary decision needed path`);

  const after = await repo.update(id, {
    status: 'resolved',
    ...(input.investigationNotes !== undefined && { investigation_notes: input.investigationNotes }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.resolved',
    entityType: 'case',
    entityId: id,
    before,
    after,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.reporter_user_id,
    type: 'case.resolved',
    title: `Your ${before.case_type} was resolved: ${before.category}`,
    link: '/cases',
  });

  return after;
}

/** BR §9: "Notice and fair response opportunity" — must happen before
 * decideCase, giving the resident visibility into the allegation before any
 * disciplinary decision is made. */
export async function issueNotice(user: AuthUser, id: string, input: z.infer<typeof issueNoticeSchema>) {
  if (!(await canManageCases(user))) throw new ForbiddenError('Only staff can issue a disciplinary notice');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  if (before.status !== 'in_progress') throw new ConflictError(`Cannot issue a notice on a case in status '${before.status}'`);

  const after = await repo.update(id, { status: 'notice_issued', notice_text: input.noticeText });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.notice_issued',
    entityType: 'case',
    entityId: id,
    before,
    after,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: caseSubject(before),
    type: 'case.notice_issued',
    title: `A disciplinary notice was issued regarding: ${before.category}`,
    body: input.noticeText,
    link: '/cases',
  });

  return after;
}

/**
 * BR §11's approval matrix: "Discipline action | Warden/Head Warden |
 * Per institutional disciplinary authority." Modeled the same way Transfer/
 * Movement decisions are — requiring 'head_warden' specifically routes a
 * plain Warden through delegation/escalation rather than letting them
 * decide discipline outright, matching the old rule book's own distinction
 * ("Warden triages; Head Warden escalates; serious cases -> UOS-157").
 */
export async function decideCase(user: AuthUser, id: string, input: z.infer<typeof decideCaseSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  if (!['notice_issued', 'appealed'].includes(before.status)) {
    throw new ConflictError(`Cannot decide a case in status '${before.status}'`);
  }
  // D17.21 item 80 gap-closure — same conflict-of-interest rule as
  // triageCase above, applied at the actual decision point too.
  if (user.sub === before.subject_user_id) {
    throw new ConflictError('Cannot decide a case that concerns yourself — this is a conflict of interest');
  }

  const resolution = await authorizeApproval(user, { requiredRole: 'head_warden', campusId: before.campus_id });

  const after = await repo.update(id, {
    status: 'decided',
    decision_outcome: input.decisionOutcome,
    decision_reason: input.decisionReason,
    decided_by: user.sub,
    decided_at: db.fn.now(),
  });

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'case',
    entityId: id,
    requiredRole: 'head_warden',
    resolution,
    actualApproverUserId: user.sub,
    reason: input.decisionReason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.decided',
    entityType: 'case',
    entityId: id,
    before,
    after,
    reason: input.decisionReason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: caseSubject(before),
    type: 'case.decided',
    title: `A decision was recorded: ${input.decisionOutcome}`,
    body: input.decisionReason,
    link: '/cases',
  });

  return after;
}

/** BR §9: "Appeal/reconsideration -> New review round; preserve prior
 * decision".
 *
 * Real bug, found live via SELF-TEST-GUIDE.md C9 prep: this used to allow
 * ONLY the reporter to appeal — but a discipline decision concerns the
 * SUBJECT of an incident, not whoever happened to report it. The exact
 * "fair response opportunity" principle canViewCase() already applies to
 * *visibility* (subject_user_id can see their own notice/decision, per
 * that function's own comment) was never carried over to this action: the
 * subject could see a decision made about them and had no way to appeal
 * it. Reporter still keeps appeal rights too — either party the decision
 * genuinely involves can raise it. */
export async function appealCase(user: AuthUser, id: string, input: z.infer<typeof appealCaseSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  if (before.reporter_user_id !== user.sub && before.subject_user_id !== user.sub) {
    throw new ForbiddenError('Only the reporter or the case subject can appeal this case');
  }
  if (before.status !== 'decided') throw new ConflictError(`Cannot appeal a case in status '${before.status}'`);

  const after = await repo.update(id, { status: 'appealed', appeal_reason: input.appealReason });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.appealed',
    entityType: 'case',
    entityId: id,
    before,
    after,
    reason: input.appealReason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C9 — same shape as the
  // reportCase gap fixed earlier, just missed on this action: an appeal is
  // exactly the kind of "new work waiting for staff" moment that gap-fix
  // was meant to cover, and nothing notified anyone that a decided case
  // needed a second look. Safe to always notify here (unlike reportCase,
  // no confidential-vs-visible distinction to make) — by this point the
  // case is already at a decision-point-or-later status, which
  // canViewCase's own broadened-visibility rule already opens up to any
  // case-managing staff regardless of confidentiality.
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'case.appealed',
    title: 'A decision was appealed and needs review',
    link: '/cases',
  });

  return after;
}

/** ux-flow.md §3.3: "Student acknowledges resolution -> Closed." Usable by
 * the reporter (from 'resolved' — the acknowledgement itself) or staff
 * (from 'resolved' or 'decided' — an administrative close). */
export async function closeCase(user: AuthUser, id: string) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  const isReporter = before.reporter_user_id === user.sub;
  const isStaff = await canManageCases(user);
  if (!isReporter && !isStaff) throw new ForbiddenError('Only the reporter or staff can close this case');
  if (isReporter && !isStaff && before.status !== 'resolved') {
    throw new ConflictError('A reporter can only close a resolved case (acknowledging resolution)');
  }
  if (!['resolved', 'decided'].includes(before.status)) {
    throw new ConflictError(`Cannot close a case in status '${before.status}'`);
  }

  const after = await repo.update(id, { status: 'closed' });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.closed',
    entityType: 'case',
    entityId: id,
    before,
    after,
  });

  return after;
}

export async function reopenCase(user: AuthUser, id: string, input: z.infer<typeof reopenCaseSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  const isReporter = before.reporter_user_id === user.sub;
  if (!isReporter && !(await canManageCases(user))) throw new ForbiddenError('Only the reporter or staff can reopen this case');
  if (before.status !== 'closed') throw new ConflictError(`Cannot reopen a case in status '${before.status}'`);

  const after = await repo.update(id, { status: 'reopened', reopen_reason: input.reopenReason });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.reopened',
    entityType: 'case',
    entityId: id,
    before,
    after,
    reason: input.reopenReason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — same reasoning as
  // appealCase's own fix: reopening is "new work waiting for staff,"
  // whether the reporter or staff themselves did the reopening. Notifying
  // unconditionally either way is harmless — a staffer reopening their own
  // case just sees their own action reflected back, no real cost.
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'case.reopened',
    title: 'A closed case was reopened and needs attention',
    link: '/cases',
  });

  return after;
}
