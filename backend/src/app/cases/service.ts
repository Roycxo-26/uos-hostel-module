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
import * as responsibilitiesRepo from '../responsibilities/repository';
import * as repo from './repository';
import type {
  appealCaseSchema,
  decideCaseSchema,
  grantCaseAccessSchema,
  imposeEmergencyRestrictionSchema,
  investigateCaseSchema,
  issueNoticeSchema,
  reopenCaseSchema,
  reportCaseSchema,
  resolveCaseSchema,
  reviewEmergencyRestrictionSchema,
  revokeCaseAccessSchema,
  triageCaseSchema,
  updateMissingResidentChecklistSchema,
} from './validators';
import type { Case, CaseType } from './types';

async function canManageCases(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'case:manage');
}

// D17.09 depth (TODO.md Batch 24) — welfare_concern/safeguarding_concern
// are a genuinely restricted tier: the ordinary case:manage permission
// (any Warden/Head Warden) is deliberately NOT enough on its own. Access
// requires either a standing safeguarding role or an explicit, active,
// case-specific grant — see the migration's own header comment for why
// this is a two-mechanism model, not nine new platform roles.
const WELFARE_CASE_TYPES: ReadonlySet<CaseType> = new Set(['welfare_concern', 'safeguarding_concern']);
const STANDING_SAFEGUARDING_PRIVILEGE_TYPES = ['safeguarding_lead', 'safeguarding_deputy', 'welfare_officer', 'counsellor'];

async function canManageWelfareCase(user: AuthUser, caseId: string): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const standing = await responsibilitiesRepo.findActiveStandingRole(user.sub, STANDING_SAFEGUARDING_PRIVILEGE_TYPES);
  if (standing) return true;
  const grant = await repo.findActiveAccessGrant(caseId, user.sub);
  return Boolean(grant);
}

/** The one check every mutating action on a welfare/safeguarding case
 * routes through — branches to the restricted check for that tier, the
 * ordinary case:manage check for everything else. Takes the row's own
 * `id`+`case_type` rather than the whole row so callers that only have
 * `before` handy don't need to destructure it themselves. */
async function canManageThisCase(user: AuthUser, row: { id: string; case_type: CaseType }): Promise<boolean> {
  if (WELFARE_CASE_TYPES.has(row.case_type)) return canManageWelfareCase(user, row.id);
  return canManageCases(user);
}

/** A grant with `read_only=true` (Privacy/Legal/Auditor, per the policy's
 * own wording — "normally read-only") can see a welfare/safeguarding case
 * but must never be able to mutate it, even though canManageThisCase
 * already let them through the visibility gate. Standing roles and
 * non-read-only grants are never blocked here. */
async function isReadOnlyOnThisCase(user: AuthUser, row: { id: string; case_type: CaseType }): Promise<boolean> {
  if (!WELFARE_CASE_TYPES.has(row.case_type)) return false;
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return false;
  const standing = await responsibilitiesRepo.findActiveStandingRole(user.sub, STANDING_SAFEGUARDING_PRIVILEGE_TYPES);
  if (standing) return false;
  const grant = await repo.findActiveAccessGrant(row.id, user.sub);
  return Boolean(grant?.read_only);
}

async function assertCanMutate(user: AuthUser, before: Case): Promise<void> {
  if (!(await canManageThisCase(user, before))) {
    throw new ForbiddenError(
      WELFARE_CASE_TYPES.has(before.case_type) ? 'You are not on this case\'s safeguarding team' : 'Only staff can act on this case'
    );
  }
  if (await isReadOnlyOnThisCase(user, before)) {
    throw new ForbiddenError('Your access to this case is read-only');
  }
}

/** Population-targeted notify for the restricted tier — never
 * notifyCampusStaff (every Warden), which would broadcast a welfare/
 * safeguarding case to exactly the population the policy says must NOT
 * automatically see it. Standing role holders + anyone with a currently
 * active grant for this specific case. */
async function notifyWelfareCaseTeam(orgId: string, campusId: string, caseId: string, entry: { type: string; title: string; link: string }) {
  const standing = await responsibilitiesRepo.listActiveStandingRoleHolders(STANDING_SAFEGUARDING_PRIVILEGE_TYPES);
  const grants = await repo.listAccessGrantsForCase(caseId);
  const activeGrantHolders = grants.filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date()));
  const userIds = new Set([...standing.map((r) => r.assignee_user_id), ...activeGrantHolders.map((g) => g.granted_to_user_id)]);
  for (const userId of userIds) {
    await notify({ orgId, campusId, userId, ...entry });
  }
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
 * D17.09 depth — welfare_concern/safeguarding_concern skip this whole
 * confidential-flag branch entirely and go straight to canManageWelfareCase:
 * that tier's restriction isn't conditional on a `confidential` checkbox
 * the way an ordinary incident's is, it's structural to the case type
 * itself.
 */
const CASE_STATUSES_NEEDING_BROADER_STAFF_VISIBILITY = new Set(['notice_issued', 'appealed', 'decided', 'resolved', 'closed', 'reopened']);

async function canViewCase(user: AuthUser, row: Case): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  if (row.reporter_user_id === user.sub || row.subject_user_id === user.sub) return true;
  if (WELFARE_CASE_TYPES.has(row.case_type)) return canManageWelfareCase(user, row.id);
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
 * discipline/security instead, not Desk. Welfare/safeguarding concerns
 * don't either — Desk is the wrong channel for either. */
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

  if (WELFARE_CASE_TYPES.has(input.caseType)) {
    // D17.09 items 95/96 — the restricted tier's whole point: this must
    // reach only the safeguarding case team, never every campus Warden.
    // With no standing team member yet assigned (a real, honest possibility
    // for a fresh tenant), this notifies nobody but the row still exists
    // and is fully visible/actionable to whoever gets granted access next —
    // same "case exists even if nobody's been told yet" shape as an
    // unassigned confidential incident already has.
    await notifyWelfareCaseTeam(user.org_id, campusId, row.id, {
      type: 'case.reported',
      title: `A new ${input.caseType.replace('_', ' ')} was reported and needs the safeguarding team's attention`,
      link: '/cases',
    });
  } else {
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
  }

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

/** Any authenticated user can list this now (route.ts) — no longer
 * staff-only. It started as "who a case can actually be assigned to"
 * (staff-only made sense there), but Grievances.tsx's resident-facing
 * "Raise a grievance" form reuses it too, for "which staff member does
 * this concern" — a Student needs to read this list just as much as a
 * Warden assigning a case. Just names/roles, same sensitivity as the
 * already-ungated resident directory above. */
export async function listCaseStaffDirectory(user: AuthUser) {
  return repo.listCaseStaffDirectory(resolveCampusId(user));
}

export async function listCases(user: AuthUser, filters: { status?: string; caseType?: string }) {
  const isStaff = await canManageCases(user);
  const rows = await repo.list({ ...filters, involvingUserId: isStaff ? undefined : user.sub });
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return rows;

  const visible: Case[] = [];
  for (const r of rows) {
    if (r.reporter_user_id === user.sub || r.subject_user_id === user.sub) {
      visible.push(r);
      continue;
    }
    if (WELFARE_CASE_TYPES.has(r.case_type)) {
      if (await canManageWelfareCase(user, r.id)) visible.push(r);
      continue;
    }
    // Mirrors canViewCase's own carve-out exactly — see that function's
    // comment for both bugs this closes. Staff see a confidential case when
    // it's unassigned (so someone can triage it) or once it's reached a
    // decision-point-or-later status (so the deciding authority, often not
    // the assignee, can reach it) — otherwise only the current assignee.
    if (!r.confidential || r.assigned_to === user.sub || (isStaff && (!r.assigned_to || CASE_STATUSES_NEEDING_BROADER_STAFF_VISIBILITY.has(r.status)))) {
      visible.push(r);
    }
  }
  return visible;
}

export async function getCase(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Case');
  if (!(await canViewCase(user, row))) throw new ForbiddenError('You do not have access to this case');
  // `canManage` travels with the response rather than making the frontend
  // re-derive it: for a welfare/safeguarding case, a plain isStaff flag
  // (any Warden/Head Warden) is no longer the right question — only the
  // caller who actually passed canManageThisCase should ever see the
  // staff action panels for this specific case.
  const canManage = await canManageThisCase(user, row);
  const readOnly = canManage && (await isReadOnlyOnThisCase(user, row));
  const accessGrants = WELFARE_CASE_TYPES.has(row.case_type) && canManage ? await repo.listAccessGrantsForCase(id) : [];
  return { ...row, accessGrants, canManage, readOnly };
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
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);
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
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);
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
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);
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
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);
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
 *
 * D17.09 depth — for welfare_concern/safeguarding_concern, holding
 * head_warden is NOT enough on its own any more: `assertCanMutate` still
 * requires the deciding Head Warden to actually be on this specific case's
 * safeguarding team (standing role or an active grant), closing the exact
 * gap the policy names — "Head Warden — only the Hostel safety and
 * operational information required for action," not blanket authority
 * over every restricted case campus-wide.
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
  await assertCanMutate(user, before);

  const resolution = await authorizeApproval(user, { requiredRole: 'head_warden', campusId: before.campus_id, entityType: 'case' });

  const after = await repo.update(id, {
    status: 'decided',
    decision_outcome: input.decisionOutcome,
    decision_reason: input.decisionReason,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    ...(input.decisionOutcome === 'support_plan' && { follow_up_due_at: new Date(input.followUpDueAt!) }),
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

  if (WELFARE_CASE_TYPES.has(before.case_type)) {
    await notifyWelfareCaseTeam(user.org_id, before.campus_id, id, {
      type: 'case.appealed',
      title: 'A restricted case decision was appealed and needs review',
      link: '/cases',
    });
  } else {
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
  }

  return after;
}

/** ux-flow.md §3.3: "Student acknowledges resolution -> Closed." Usable by
 * the reporter (from 'resolved' — the acknowledgement itself) or staff
 * (from 'resolved' or 'decided' — an administrative close). */
export async function closeCase(user: AuthUser, id: string) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  const isReporter = before.reporter_user_id === user.sub;
  const isStaff = await canManageThisCase(user, before);
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
  if (!isReporter && !(await canManageThisCase(user, before))) throw new ForbiddenError('Only the reporter or staff can reopen this case');
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

  if (WELFARE_CASE_TYPES.has(before.case_type)) {
    await notifyWelfareCaseTeam(user.org_id, before.campus_id, id, {
      type: 'case.reopened',
      title: 'A closed restricted case was reopened and needs attention',
      link: '/cases',
    });
  } else {
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
  }

  return after;
}

// ============================================================================
// D17.09 items 96/99 — case-specific, time-bound access grants
// ============================================================================

/** Only someone already on the case team can grant further access —
 * matches the policy's own "Access must depend on: Case assignment" chain
 * (a grant can only ever be extended by someone who already has it, never
 * self-service, never a bare case:manage permission). */
export async function grantCaseAccess(user: AuthUser, caseId: string, input: z.infer<typeof grantCaseAccessSchema>) {
  const before = await repo.findById(caseId);
  if (!before) throw new NotFoundError('Case');
  if (!WELFARE_CASE_TYPES.has(before.case_type)) throw new ConflictError('Access grants only apply to welfare/safeguarding cases');
  if (!(await canManageWelfareCase(user, caseId))) throw new ForbiddenError('You are not on this case\'s safeguarding team');

  const grant = await repo.createAccessGrant({
    org_id: before.org_id,
    campus_id: before.campus_id,
    case_id: caseId,
    granted_to_user_id: input.userId,
    role_label: input.roleLabel,
    read_only: input.readOnly ?? false,
    purpose: input.purpose,
    granted_by: user.sub,
    expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await recordAudit({
    orgId: before.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.access_granted',
    entityType: 'case_access_grant',
    entityId: grant.id,
    after: grant,
    reason: input.purpose,
  });
  await notify({
    orgId: before.org_id,
    campusId: before.campus_id,
    userId: input.userId,
    type: 'case.access_granted',
    title: `You were given ${input.readOnly ? 'read-only ' : ''}access to a restricted case`,
    link: '/cases',
  });

  return grant;
}

export async function revokeCaseAccess(user: AuthUser, grantId: string, input: z.infer<typeof revokeCaseAccessSchema>) {
  const before = await repo.findAccessGrantById(grantId);
  if (!before) throw new NotFoundError('Access grant');
  if (!(await canManageWelfareCase(user, before.case_id))) throw new ForbiddenError('You are not on this case\'s safeguarding team');

  const after = await repo.revokeAccessGrant(grantId, user.sub);

  await recordAudit({
    orgId: before.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.access_revoked',
    entityType: 'case_access_grant',
    entityId: grantId,
    before,
    after,
    reason: input.reason,
  });

  return after;
}

// ============================================================================
// D17.09 item 98 — missing-resident checklist
// ============================================================================

export async function updateMissingResidentChecklist(user: AuthUser, id: string, input: z.infer<typeof updateMissingResidentChecklistSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);

  const checklist = { ...(before.missing_resident_checklist ?? {}) };
  checklist[input.key] = {
    completed: input.completed,
    completedBy: input.completed ? user.sub : undefined,
    completedAt: input.completed ? new Date().toISOString() : undefined,
    notes: input.notes,
  };

  const after = await repo.update(id, { missing_resident_checklist: JSON.stringify(checklist) });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.missing_resident_checklist_updated',
    entityType: 'case',
    entityId: id,
    before,
    after,
  });

  return after;
}

// ============================================================================
// D17.09 item 99 — emergency privilege restriction
// ============================================================================

export async function imposeEmergencyRestriction(user: AuthUser, id: string, input: z.infer<typeof imposeEmergencyRestrictionSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);
  if (before.emergency_restriction_active) throw new ConflictError('An emergency restriction is already active on this case');

  const reviewDueAt = new Date(Date.now() + input.reviewDueInHours * 60 * 60 * 1000);
  const after = await repo.update(id, {
    emergency_restriction_active: true,
    emergency_restriction_reason: input.reason,
    emergency_restriction_imposed_by: user.sub,
    emergency_restriction_imposed_at: db.fn.now(),
    emergency_restriction_review_due_at: reviewDueAt,
    emergency_restriction_reviewed_at: null,
    emergency_restriction_reviewed_by: null,
    emergency_restriction_review_outcome: null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.emergency_restriction_imposed',
    entityType: 'case',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: caseSubject(before),
    type: 'case.emergency_restriction_imposed',
    title: 'A temporary emergency restriction has been placed pending review',
    body: input.reason,
    link: '/cases',
  });

  return after;
}

/** The "mandatory post-review" the policy asks for — a restriction can't
 * just sit active forever with no accountable follow-up; this is the only
 * way `emergency_restriction_active` ever goes back to false. */
export async function reviewEmergencyRestriction(user: AuthUser, id: string, input: z.infer<typeof reviewEmergencyRestrictionSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Case');
  await assertCanMutate(user, before);
  if (!before.emergency_restriction_active) throw new ConflictError('No active emergency restriction on this case to review');

  const after = await repo.update(id, {
    emergency_restriction_reviewed_at: db.fn.now(),
    emergency_restriction_reviewed_by: user.sub,
    emergency_restriction_review_outcome: input.outcome,
    ...(input.outcome === 'lifted' && { emergency_restriction_active: false }),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'case.emergency_restriction_reviewed',
    entityType: 'case',
    entityId: id,
    before,
    after,
    reason: input.notes,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: caseSubject(before),
    type: 'case.emergency_restriction_reviewed',
    title: `Your emergency restriction review is complete — ${input.outcome === 'lifted' ? 'restriction lifted' : 'restriction continues'}`,
    body: input.notes,
    link: '/cases',
  });

  return after;
}

