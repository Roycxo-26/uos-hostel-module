import { createHash } from 'crypto';
import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notifyCampusStaff } from '../../utils/notify';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import { computeTopicAggregates, type FeedbackCampaign, type FeedbackResponse, type TopicAggregate } from './types';
import type {
  cancelCampaignSchema,
  createCampaignSchema,
  createServiceRecoveryCaseSchema,
  submitResponseSchema,
  updateServiceRecoveryCaseSchema,
} from './validators';

async function canManageFeedback(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'feedback:manage');
}

async function canRevealIdentity(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'feedback:reveal_identity');
}

function assertManager(allowed: boolean, message = 'Only staff can manage feedback campaigns'): void {
  if (!allowed) throw new ForbiddenError(message);
}

/** §22.2's own target-scope check — a resident may only respond to a
 * campaign whose target scope (hostel/floor/room) they're currently
 * actually living in. */
async function isStudentInScope(studentId: string, scopeType: 'hostel' | 'floor' | 'room', scopeId: string): Promise<boolean> {
  const scope = await repo.findCurrentScopeForStudent(studentId);
  if (!scope) return false;
  if (scopeType === 'room') return scope.roomId === scopeId;
  if (scopeType === 'floor') return scope.floorId === scopeId;
  return scope.hostelId === scopeId;
}

/** §22.4's own duplicate-submission guard, deliberately identical
 * regardless of anonymity mode: campaign+student, one-way hashed, never
 * the plaintext student id. This is a simplification of "server salt" —
 * a real deployment would mix in a secret pepper kept outside the
 * database so a reader with both table and roster access couldn't
 * recompute it; that pepper doesn't exist in this codebase yet (no
 * secrets-manager integration), so this hash's un-guessability rests on
 * the campaign+student pair alone, not on true cryptographic secrecy. */
function computeSubmissionHash(campaignId: string, studentId: string): string {
  return createHash('sha256').update(`${campaignId}:${studentId}`).digest('hex');
}

export async function createCampaign(user: AuthUser, input: z.infer<typeof createCampaignSchema>): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  const campusId = resolveCampusId(user);
  const settings = await getSettings(user.org_id);

  const row = await repo.createCampaign({
    org_id: user.org_id,
    campus_id: campusId,
    name: input.name,
    purpose: input.purpose ?? null,
    target_scope_type: input.targetScopeType,
    target_scope_id: input.targetScopeId,
    topics: JSON.stringify(input.topics),
    question_set: JSON.stringify(input.questionSet),
    anonymity_mode: input.anonymityMode,
    open_at: input.openAt,
    close_at: input.closeAt,
    recurrence: input.recurrence ?? null,
    minimum_response_threshold: input.minimumResponseThreshold ?? settings.policyDefaults.feedbackMinimumResponseThreshold,
    language: input.language ?? 'en',
    service_recovery_trigger_score: input.serviceRecoveryTriggerScore ?? null,
    created_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'feedback_campaign.created', entityType: 'feedback_campaign', entityId: row.id, after: row });
  return row;
}

async function getCampaignOr404(id: string): Promise<FeedbackCampaign> {
  const row = await repo.findCampaignById(id);
  if (!row) throw new NotFoundError('Feedback campaign');
  return row;
}

/** VALIDATION folds into this transition (migration's own comment) — the
 * one real gate is "at least one topic and one question," already
 * enforced by createCampaignSchema, so opening is just a status flip. */
export async function openCampaign(user: AuthUser, id: string): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  const before = await getCampaignOr404(id);
  if (before.status !== 'draft') throw new ConflictError(`Cannot open a campaign in status '${before.status}'`);
  const after = await repo.updateCampaign(id, { status: 'open' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'feedback_campaign.opened', entityType: 'feedback_campaign', entityId: id, before, after });
  return after;
}

export async function closeCampaign(user: AuthUser, id: string): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  const before = await getCampaignOr404(id);
  if (before.status !== 'open') throw new ConflictError(`Cannot close a campaign in status '${before.status}'`);
  const after = await repo.updateCampaign(id, { status: 'closed' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'feedback_campaign.closed', entityType: 'feedback_campaign', entityId: id, before, after });
  return after;
}

export async function cancelCampaign(user: AuthUser, id: string, input: z.infer<typeof cancelCampaignSchema>): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  const before = await getCampaignOr404(id);
  if (!['draft', 'open'].includes(before.status)) throw new ConflictError(`Cannot cancel a campaign in status '${before.status}'`);
  const after = await repo.updateCampaign(id, { status: 'cancelled', cancelled_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'feedback_campaign.cancelled', entityType: 'feedback_campaign', entityId: id, before, after, reason: input.reason });
  return after;
}

/** A campaign becomes ready for staff to read once explicitly marked so
 * — a deliberate manual step, not automatic on close, since "closed" only
 * means the window ended, not that anyone has reviewed the responses yet. */
export async function markAnalysisReady(user: AuthUser, id: string): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  const before = await getCampaignOr404(id);
  if (before.status !== 'closed') throw new ConflictError(`Cannot mark analysis-ready from status '${before.status}'`);
  const after = await repo.updateCampaign(id, { status: 'analysis_ready' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'feedback_campaign.analysis_ready', entityType: 'feedback_campaign', entityId: id, before, after });
  return after;
}

export async function archiveCampaign(user: AuthUser, id: string): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  const before = await getCampaignOr404(id);
  if (!['closed', 'analysis_ready'].includes(before.status)) throw new ConflictError(`Cannot archive a campaign in status '${before.status}'`);
  const after = await repo.updateCampaign(id, { status: 'archived' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'feedback_campaign.archived', entityType: 'feedback_campaign', entityId: id, before, after });
  return after;
}

/** Staff oversight — every campaign, any status. */
export async function listCampaigns(user: AuthUser, filters: { status?: string }): Promise<FeedbackCampaign[]> {
  assertManager(await canManageFeedback(user));
  return repo.listCampaigns(filters);
}

export async function getCampaign(user: AuthUser, id: string): Promise<FeedbackCampaign> {
  assertManager(await canManageFeedback(user));
  return getCampaignOr404(id);
}

/** Resident-facing: only campaigns currently open, within their window,
 * and targeted at a scope this resident is actually in right now. */
export async function listOpenCampaignsForMe(user: AuthUser): Promise<FeedbackCampaign[]> {
  const open = await repo.listCampaigns({ status: 'open' });
  const scope = await repo.findCurrentScopeForStudent(user.sub);
  if (!scope) return [];
  const now = new Date();
  return open.filter((c) => {
    if (new Date(c.open_at) > now || new Date(c.close_at) < now) return false;
    if (c.target_scope_type === 'room') return c.target_scope_id === scope.roomId;
    if (c.target_scope_type === 'floor') return c.target_scope_id === scope.floorId;
    return c.target_scope_id === scope.hostelId;
  });
}

/**
 * §22.4's core privacy mechanics, implemented for real:
 *  - identified/confidential: respondent_user_id is set.
 *  - anonymous/aggregated_only: respondent_user_id stays null.
 *  - every mode still stores submission_hash, so a resident can't submit
 *    twice under any mode without that being detected.
 *  - a rating at/below the campaign's own service_recovery_trigger_score
 *    auto-flags the response and opens a service-recovery case — the
 *    case's own response_id can point at an anonymous response without
 *    that being a privacy leak, since the response row itself never
 *    named who submitted it.
 */
export async function submitResponse(user: AuthUser, campaignId: string, input: z.infer<typeof submitResponseSchema>): Promise<FeedbackResponse> {
  const campaign = await getCampaignOr404(campaignId);
  if (campaign.status !== 'open') throw new ConflictError(`Cannot submit — campaign is in status '${campaign.status}', not open`);
  const now = new Date();
  if (now < new Date(campaign.open_at) || now > new Date(campaign.close_at)) throw new ConflictError('This campaign is not currently accepting responses');
  if (!campaign.topics.includes(input.topic)) throw new ValidationError(`Topic '${input.topic}' is not part of this campaign`);
  if (!(await isStudentInScope(user.sub, campaign.target_scope_type, campaign.target_scope_id))) {
    throw new ForbiddenError('You are not currently in the scope this campaign targets');
  }

  const hash = computeSubmissionHash(campaignId, user.sub);
  const existing = await repo.findResponseByHash(campaignId, hash);
  if (existing) throw new ConflictError('You have already submitted feedback for this campaign');

  const identityKept = campaign.anonymity_mode === 'identified' || campaign.anonymity_mode === 'confidential';
  const triggerScore = campaign.service_recovery_trigger_score !== null ? Number(campaign.service_recovery_trigger_score) : null;
  const flagged = triggerScore !== null && input.overallRating !== undefined && input.overallRating <= triggerScore;

  const row = await repo.createResponse({
    org_id: user.org_id,
    campus_id: campaign.campus_id,
    campaign_id: campaignId,
    respondent_user_id: identityKept ? user.sub : null,
    submission_hash: hash,
    topic: input.topic,
    answers: JSON.stringify(input.answers ?? {}),
    overall_rating: input.overallRating ?? null,
    comment: input.comment ?? null,
    flagged_for_review: flagged,
  });

  // Audited without identifying the respondent in the log entry itself
  // when the campaign isn't identified/confidential — actorUserId still
  // records who acted (same as every other audited action), but nothing
  // beyond that ties this specific response back to them anywhere else.
  await recordAudit({ orgId: user.org_id, campusId: campaign.campus_id, actorUserId: user.sub, action: 'feedback_response.submitted', entityType: 'feedback_response', entityId: row.id, after: { campaign_id: campaignId, topic: row.topic, flagged_for_review: row.flagged_for_review } });

  if (flagged) {
    const recoveryCase = await repo.createCase({
      org_id: user.org_id,
      campus_id: campaign.campus_id,
      campaign_id: campaignId,
      response_id: row.id,
      trigger_reason: `Automatic: overall rating ${input.overallRating} at/below this campaign's service-recovery trigger (${triggerScore})`,
      created_by: user.sub,
    });
    await recordAudit({ orgId: user.org_id, campusId: campaign.campus_id, actorUserId: user.sub, action: 'feedback_service_recovery_case.auto_created', entityType: 'feedback_service_recovery_case', entityId: recoveryCase.id, after: recoveryCase });
    // No per-response identity is included here even for identified/
    // confidential campaigns — staff open the case list to see detail;
    // this is just "something needs your attention."
    await notifyCampusStaff(db, user.org_id, campaign.campus_id, {
      type: 'feedback.service_recovery_case_opened',
      title: 'A low rating opened a service-recovery case',
      body: campaign.name,
      link: '/feedback',
    });
  }

  return row;
}

/**
 * Staff-only. aggregated_only never returns individual responses to
 * anyone — that's the entire meaning of the mode (§22.4). For every other
 * mode, respondent_user_id is redacted here regardless — identified
 * responses are visible with identity through getCampaign's own
 * question-set context plus this list carrying the id, but confidential
 * responses are deliberately NOT distinguishable from anonymous ones in
 * this general listing; only revealIdentity() (permission-gated, audited)
 * exposes a confidential response's respondent.
 */
export async function listResponses(user: AuthUser, campaignId: string): Promise<Array<Omit<FeedbackResponse, 'respondent_user_id'> & { respondent_user_id: string | null }>> {
  assertManager(await canManageFeedback(user));
  const campaign = await getCampaignOr404(campaignId);
  if (campaign.anonymity_mode === 'aggregated_only') {
    throw new ForbiddenError('This campaign is aggregated-only — individual responses are never shown, only the topic averages');
  }
  const rows: FeedbackResponse[] = await repo.listResponsesForCampaign(campaignId);
  return rows.map((r) => ({
    ...r,
    respondent_user_id: campaign.anonymity_mode === 'identified' ? r.respondent_user_id : null,
  }));
}

/** Head-Warden-only (feedback:reveal_identity), and only meaningful for a
 * confidential response — identified responses already show identity in
 * listResponses, and anonymous/aggregated_only never stored one to reveal. */
export async function revealIdentity(user: AuthUser, responseId: string): Promise<{ respondentUserId: string }> {
  if (!(await canRevealIdentity(user))) throw new ForbiddenError('Only Head Warden can reveal a confidential response\'s identity');
  const response = await repo.findResponseById(responseId);
  if (!response) throw new NotFoundError('Feedback response');
  const campaign = await getCampaignOr404(response.campaign_id);
  if (campaign.anonymity_mode !== 'confidential') throw new ConflictError(`Cannot reveal identity for a '${campaign.anonymity_mode}' campaign`);
  if (!response.respondent_user_id) throw new ConflictError('This response has no stored respondent to reveal');

  await recordAudit({ orgId: user.org_id, campusId: response.campus_id, actorUserId: user.sub, action: 'feedback_response.identity_revealed', entityType: 'feedback_response', entityId: responseId });
  return { respondentUserId: response.respondent_user_id };
}

/** §22.4's suppression rule, applied for real via computeTopicAggregates. */
export async function getAnalytics(user: AuthUser, campaignId: string): Promise<{ totalResponses: number; topics: TopicAggregate[] }> {
  assertManager(await canManageFeedback(user));
  const campaign = await getCampaignOr404(campaignId);
  const responses: FeedbackResponse[] = await repo.listResponsesForCampaign(campaignId);
  return { totalResponses: responses.length, topics: computeTopicAggregates(responses, campaign.minimum_response_threshold) };
}

export async function createServiceRecoveryCase(user: AuthUser, input: z.infer<typeof createServiceRecoveryCaseSchema>) {
  assertManager(await canManageFeedback(user));
  const campaign = await getCampaignOr404(input.campaignId);
  if (input.responseId) {
    const response = await repo.findResponseById(input.responseId);
    if (!response || response.campaign_id !== input.campaignId) throw new NotFoundError('Feedback response');
  }
  const row = await repo.createCase({
    org_id: user.org_id,
    campus_id: campaign.campus_id,
    campaign_id: input.campaignId,
    response_id: input.responseId ?? null,
    trigger_reason: input.triggerReason,
    created_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId: campaign.campus_id, actorUserId: user.sub, action: 'feedback_service_recovery_case.created', entityType: 'feedback_service_recovery_case', entityId: row.id, after: row });
  return row;
}

export async function listServiceRecoveryCases(user: AuthUser, filters: { status?: string; campaignId?: string }) {
  assertManager(await canManageFeedback(user));
  return repo.listCases(filters);
}

export async function getServiceRecoveryCase(user: AuthUser, id: string) {
  assertManager(await canManageFeedback(user));
  const row = await repo.findCaseById(id);
  if (!row) throw new NotFoundError('Feedback service-recovery case');
  return row;
}

export async function updateServiceRecoveryCase(user: AuthUser, id: string, input: z.infer<typeof updateServiceRecoveryCaseSchema>) {
  assertManager(await canManageFeedback(user));
  const before = await repo.findCaseById(id);
  if (!before) throw new NotFoundError('Feedback service-recovery case');
  if (before.status === 'closed') throw new ConflictError('This case is already closed');

  const after = await repo.updateCase(id, {
    ...(input.status && { status: input.status }),
    ...(input.linkedReferenceType !== undefined && { linked_reference_type: input.linkedReferenceType }),
    ...(input.linkedReferenceId !== undefined && { linked_reference_id: input.linkedReferenceId }),
    ...(input.assignedTo !== undefined && { assigned_to: input.assignedTo }),
    ...(input.resolutionNotes !== undefined && { resolution_notes: input.resolutionNotes }),
    ...(input.status === 'closed' && { closed_at: db.fn.now() }),
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'feedback_service_recovery_case.updated', entityType: 'feedback_service_recovery_case', entityId: id, before, after });
  return after;
}
