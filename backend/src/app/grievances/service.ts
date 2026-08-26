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
  acknowledgePolicySchema,
  assignIndependentReviewerSchema,
  assignReviewerSchema,
  closeGrievanceSchema,
  declinePolicySchema,
  issueDecisionSchema,
  issueFinalDecisionSchema,
  publishPolicyVersionSchema,
  raiseGrievanceSchema,
  reopenGrievanceSchema,
  resolveGrievanceSchema,
  respondToInformationRequestSchema,
  returnForInformationSchema,
  setInterimActionSchema,
  setReferralSchema,
  submitAppealSchema,
  withdrawGrievanceSchema,
} from './validators';

async function canManage(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'grievance:manage');
}

// ============================================================================
// D17.21 item 79 — grievance lifecycle. A sibling to Cases, not an
// overload of it: this challenges a DECISION (allocation, transfer,
// staff behaviour, damage assessment…), not conduct/discipline.
// ============================================================================

export async function raiseGrievance(user: AuthUser, input: z.infer<typeof raiseGrievanceSchema>) {
  const campusId = resolveCampusId(user);
  const row = await repo.createGrievance({
    org_id: user.org_id,
    campus_id: campusId,
    raised_by: user.sub,
    scope: input.scope,
    subject_user_id: input.subjectUserId ?? null,
    linked_entity_type: input.linkedEntityType ?? null,
    linked_entity_id: input.linkedEntityId ?? null,
    description: input.description,
    status: 'submitted',
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: row.campus_id,
    actorUserId: user.sub,
    action: 'grievance.raised',
    entityType: 'grievance',
    entityId: row.id,
    after: row,
  });
  await notifyCampusStaff(db, user.org_id, row.campus_id, {
    type: 'grievance.raised',
    title: `A new grievance was raised (${input.scope.replace(/_/g, ' ')})`,
    link: '/grievances',
  });

  return row;
}

/**
 * D17.21 item 80 — the conflict-of-interest check, for real: the person
 * being assigned to review a grievance can never be the person the
 * grievance is actually about. Called at every assignment/decision point
 * below, not just once at intake — a case can be reassigned, and each
 * reassignment needs the same guard.
 */
function assertNoConflict(candidateUserId: string, grievance: { subject_user_id: string | null; decided_by: string | null }) {
  if (candidateUserId === grievance.subject_user_id) {
    throw new ConflictError('Cannot assign this grievance to the person it concerns — this is a conflict of interest');
  }
}

const ASSIGNABLE_FROM = new Set(['submitted']);

export async function assignReviewer(user: AuthUser, id: string, input: z.infer<typeof assignReviewerSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can assign a grievance reviewer');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (!ASSIGNABLE_FROM.has(before.status)) throw new ConflictError(`Cannot assign a reviewer from status '${before.status}'`);
  assertNoConflict(input.reviewerId, before);

  const after = await repo.updateGrievance(id, { status: 'under_review', assigned_reviewer: input.reviewerId });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.assigned',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: input.reviewerId,
    type: 'grievance.assigned',
    title: 'A grievance was assigned to you for review',
    link: '/grievances',
  });
  return after;
}

export async function returnForInformation(user: AuthUser, id: string, input: z.infer<typeof returnForInformationSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can return a grievance for more information');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.status !== 'under_review') throw new ConflictError(`Cannot return for information from status '${before.status}'`);

  const after = await repo.updateGrievance(id, { status: 'returned_for_information', information_request_notes: input.notes });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.returned_for_information',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
    reason: input.notes,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.raised_by,
    type: 'grievance.returned_for_information',
    title: 'Staff need more information on your grievance',
    body: input.notes,
    link: '/grievances',
  });
  return after;
}

export async function respondToInformationRequest(user: AuthUser, id: string, input: z.infer<typeof respondToInformationRequestSchema>) {
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.raised_by !== user.sub) throw new ForbiddenError('You can only respond to your own grievance');
  if (before.status !== 'returned_for_information') throw new ConflictError(`Cannot respond from status '${before.status}'`);

  const after = await repo.updateGrievance(id, {
    status: 'under_review',
    information_request_notes: `${before.information_request_notes}\n\nResident response: ${input.response}`,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.information_provided',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function setInterimAction(user: AuthUser, id: string, input: z.infer<typeof setInterimActionSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can set an interim protective action');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');

  const after = await repo.updateGrievance(id, { interim_action_notes: input.notes });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.interim_action_set',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function setReferral(user: AuthUser, id: string, input: z.infer<typeof setReferralSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can refer a grievance');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');

  const after = await repo.updateGrievance(id, { referred_to: input.referredTo });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.referred',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function issueDecision(user: AuthUser, id: string, input: z.infer<typeof issueDecisionSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can decide a grievance');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.status !== 'under_review') throw new ConflictError(`Cannot decide a grievance in status '${before.status}'`);
  assertNoConflict(user.sub, before);

  const after = await repo.updateGrievance(id, {
    status: 'decision_issued',
    decision_reason: input.decisionReason,
    remedy_notes: input.remedyNotes ?? null,
    decided_by: user.sub,
    decided_at: db.fn.now(),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.decided',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
    reason: input.decisionReason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.raised_by,
    type: 'grievance.decided',
    title: 'A decision was issued on your grievance',
    body: input.decisionReason,
    link: '/grievances',
  });
  return after;
}

export async function submitAppeal(user: AuthUser, id: string, input: z.infer<typeof submitAppealSchema>) {
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.raised_by !== user.sub) throw new ForbiddenError('You can only appeal your own grievance');
  if (before.status !== 'decision_issued') throw new ConflictError(`Cannot appeal a grievance in status '${before.status}'`);

  const after = await repo.updateGrievance(id, {
    status: 'appeal_submitted',
    appeal_reason: input.appealReason,
    appeal_submitted_at: db.fn.now(),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.appealed',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
    reason: input.appealReason,
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'grievance.appealed',
    title: 'A grievance decision was appealed — needs an independent reviewer',
    link: '/grievances',
  });
  return after;
}

/**
 * LAW-34's actual "independent" requirement: the reviewer must differ
 * from BOTH the original subject AND whoever issued the first decision —
 * not just a second opinion from the same reviewer under a new label.
 */
export async function assignIndependentReviewer(user: AuthUser, id: string, input: z.infer<typeof assignIndependentReviewerSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can assign an independent reviewer');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.status !== 'appeal_submitted') throw new ConflictError(`Cannot assign an independent reviewer from status '${before.status}'`);
  assertNoConflict(input.reviewerId, before);
  if (input.reviewerId === before.decided_by) {
    throw new ConflictError('The independent reviewer must be someone other than whoever issued the original decision');
  }

  const after = await repo.updateGrievance(id, { status: 'independent_review', independent_reviewer: input.reviewerId });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.independent_reviewer_assigned',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: input.reviewerId,
    type: 'grievance.independent_review_assigned',
    title: 'You were assigned as independent reviewer on an appealed grievance',
    link: '/grievances',
  });
  return after;
}

export async function issueFinalDecision(user: AuthUser, id: string, input: z.infer<typeof issueFinalDecisionSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can issue a final decision');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.status !== 'independent_review') throw new ConflictError(`Cannot issue a final decision from status '${before.status}'`);
  assertNoConflict(user.sub, before);
  if (user.sub === before.decided_by) {
    throw new ConflictError('The final decision must come from someone other than whoever issued the original decision');
  }

  // The original decision_reason is deliberately left untouched — this
  // only ever ADDS final_decision_reason, never overwrites the record of
  // what was first decided.
  const after = await repo.updateGrievance(id, {
    status: 'final_decision',
    final_decision_reason: input.reason,
    final_decided_by: user.sub,
    final_decided_at: db.fn.now(),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.final_decision_issued',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.raised_by,
    type: 'grievance.final_decision_issued',
    title: 'The independent review of your grievance is complete',
    body: input.reason,
    link: '/grievances',
  });
  return after;
}

export async function resolveGrievance(user: AuthUser, id: string, input: z.infer<typeof resolveGrievanceSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can resolve a grievance');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (!['decision_issued', 'final_decision'].includes(before.status)) {
    throw new ConflictError(`Cannot resolve a grievance in status '${before.status}'`);
  }

  const after = await repo.updateGrievance(id, { status: 'resolved', remediation_notes: input.remediationNotes ?? null });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.resolved',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function closeGrievance(user: AuthUser, id: string, _input: z.infer<typeof closeGrievanceSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can close a grievance');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.status !== 'resolved') throw new ConflictError(`Cannot close a grievance in status '${before.status}'`);

  const after = await repo.updateGrievance(id, { status: 'closed' });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.closed',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function reopenGrievance(user: AuthUser, id: string, input: z.infer<typeof reopenGrievanceSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can reopen a grievance');
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (!['closed', 'resolved'].includes(before.status)) throw new ConflictError(`Cannot reopen a grievance in status '${before.status}'`);

  const after = await repo.updateGrievance(id, { status: 'reopened', reopen_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.reopened',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.raised_by,
    type: 'grievance.reopened',
    title: 'Your grievance was reopened',
    body: input.reason,
    link: '/grievances',
  });
  return after;
}

const WITHDRAWABLE_FROM = new Set(['submitted', 'under_review', 'returned_for_information']);

export async function withdrawGrievance(user: AuthUser, id: string, _input: z.infer<typeof withdrawGrievanceSchema>) {
  const before = await repo.findGrievanceById(id);
  if (!before) throw new NotFoundError('Grievance');
  if (before.raised_by !== user.sub) throw new ForbiddenError('You can only withdraw your own grievance');
  if (!WITHDRAWABLE_FROM.has(before.status)) throw new ConflictError(`Cannot withdraw a grievance in status '${before.status}'`);

  const after = await repo.updateGrievance(id, { status: 'withdrawn' });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'grievance.withdrawn',
    entityType: 'grievance',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function getGrievance(user: AuthUser, id: string) {
  const row = await repo.findGrievanceById(id);
  if (!row) throw new NotFoundError('Grievance');
  if (row.raised_by !== user.sub && row.subject_user_id !== user.sub && !(await canManage(user))) {
    throw new ForbiddenError('You do not have access to this grievance');
  }
  return row;
}

export async function listGrievances(user: AuthUser, filters: { status?: string }) {
  const raisedBy = (await canManage(user)) ? undefined : user.sub;
  return repo.listGrievances({ status: filters.status, raisedBy });
}

// ============================================================================
// D17.21 item 81 — policy version publishing + acknowledgement.
// ============================================================================

export async function publishPolicyVersion(user: AuthUser, input: z.infer<typeof publishPolicyVersionSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can publish a policy version');
  const campusId = resolveCampusId(user);

  const version = await repo.createPolicyVersion({
    org_id: user.org_id,
    campus_id: campusId,
    document_key: input.documentKey,
    version: input.version,
    content_hash: input.contentHash ?? null,
    title: input.title,
    mandatory: input.mandatory,
    published_by: user.sub,
    re_ack_deadline: input.reAckDeadline ?? null,
  });

  // Campaign: every currently checked-in resident gets a pending
  // acknowledgement row immediately, same prefill-on-publish pattern this
  // session's other new modules already use for their own rosters.
  const students = await repo.listCheckedInStudentIds();
  for (const s of students) {
    await repo.createAcknowledgement({
      org_id: user.org_id,
      campus_id: campusId,
      policy_version_id: version.id,
      student_id: s.student_id,
      state: 'pending',
    });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'policy_version.published',
    entityType: 'policy_version',
    entityId: version.id,
    after: { ...version, studentCount: students.length },
  });

  const etaText = input.reAckDeadline ? ` — acknowledge by ${input.reAckDeadline}` : '';
  for (const s of students) {
    await notify({
      orgId: user.org_id,
      campusId,
      userId: s.student_id,
      type: 'policy_version.published',
      title: `A ${input.mandatory ? 'mandatory' : 'new'} policy update needs your acknowledgement: ${input.title}${etaText}`,
      link: '/my-rights',
    });
  }

  return version;
}

export async function listPolicyVersions(documentKey?: string) {
  return repo.listPolicyVersions(documentKey);
}

export async function acknowledgePolicy(user: AuthUser, versionId: string, input: z.infer<typeof acknowledgePolicySchema>) {
  const ack = await repo.findAcknowledgement(versionId, user.sub);
  if (!ack) throw new NotFoundError('Acknowledgement record for this policy version');
  if (ack.state !== 'pending') throw new ConflictError(`This acknowledgement is already '${ack.state}'`);

  const after = await repo.updateAcknowledgement(ack.id, {
    state: 'accepted',
    signature_method: input.signatureMethod,
    acknowledged_at: db.fn.now(),
    viewed_at: ack.viewed_at ?? db.fn.now(),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: ack.campus_id,
    actorUserId: user.sub,
    action: 'policy_acknowledgement.accepted',
    entityType: 'policy_acknowledgement',
    entityId: ack.id,
    before: ack,
    after,
  });
  return after;
}

export async function declinePolicy(user: AuthUser, versionId: string, input: z.infer<typeof declinePolicySchema>) {
  const ack = await repo.findAcknowledgement(versionId, user.sub);
  if (!ack) throw new NotFoundError('Acknowledgement record for this policy version');
  if (ack.state !== 'pending') throw new ConflictError(`This acknowledgement is already '${ack.state}'`);

  const after = await repo.updateAcknowledgement(ack.id, { state: 'declined', decline_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: ack.campus_id,
    actorUserId: user.sub,
    action: 'policy_acknowledgement.declined',
    entityType: 'policy_acknowledgement',
    entityId: ack.id,
    before: ack,
    after,
    reason: input.reason,
  });
  // Non-acknowledgement needs a defined operational owner, not an
  // automatic consequence this system has no authority to invent (see
  // this module's own controller/validators comments) — a staff
  // notification is that owner's entry point.
  await notifyCampusStaff(db, user.org_id, ack.campus_id, {
    type: 'policy_acknowledgement.declined',
    title: 'A resident declined a policy acknowledgement — needs staff follow-up',
    link: '/grievances',
  });
  return after;
}

export async function listAcknowledgementsForVersion(user: AuthUser, versionId: string) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can view an acknowledgement roster');
  return repo.listAcknowledgementsForVersion(versionId);
}

// ============================================================================
// D17.21 item 82 — resident rights view. Pure read-side aggregation, no
// new storage.
// ============================================================================

export async function getMyRights(user: AuthUser) {
  const [versions, myAcks, myGrievances] = await Promise.all([
    repo.listLatestPolicyVersions(),
    repo.listAcknowledgementsForStudent(user.sub),
    repo.listGrievances({ raisedBy: user.sub }),
  ]);

  const ackByVersion = new Map(myAcks.map((a) => [a.policy_version_id, a]));
  const policies = versions.map((v) => ({ version: v, myAcknowledgement: ackByVersion.get(v.id) ?? null }));

  return {
    policies,
    grievances: myGrievances,
    routes: {
      grievance: 'File a grievance about an allocation, transfer, staff conduct, damage assessment, or other Hostel decision from the Grievances page.',
      appeal: 'A decided grievance can be appealed once, within the Grievances page, for an independent review by someone other than the original decision-maker.',
      correctData: 'To correct inaccurate residence data, contact your Warden or raise a grievance under "Other".',
    },
  };
}
