import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { notify, notifyOccupantsInScope } from '../../utils/notify';
import * as repo from './repository';
import { computeEntryTotal, rankEntries, type ScoringDimensionConfig } from './types';
import type {
  appealEntrySchema,
  cancelCompetitionSchema,
  createCompetitionSchema,
  decideEntryAppealSchema,
  issueRecognitionSchema,
  optOutEntrySchema,
  recordScoreSchema,
  setAliasSchema,
  toggleHostelGamificationSchema,
} from './validators';

async function canManageGamification(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'gamification:manage');
}

/** §23.1: "Head Warden/Hostel Administrator decides whether it is enabled
 * for each Hostel." Stronger than day-to-day gamification:manage — same
 * "one permission, Head Warden only" shape as structure:configure and
 * finance_event:confirm. */
async function canConfigureGamification(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'gamification:configure');
}

export async function toggleHostelGamification(user: AuthUser, hostelId: string, input: z.infer<typeof toggleHostelGamificationSchema>) {
  if (!(await canConfigureGamification(user))) throw new ForbiddenError('Only Head Warden can enable or disable gamification for a hostel');
  const hostel = await repo.findHostel(hostelId);
  if (!hostel) throw new NotFoundError('Hostel');

  const after = await repo.setHostelGamificationEnabled(hostelId, input.enabled);
  await recordAudit({
    orgId: user.org_id,
    campusId: hostel.campus_id,
    actorUserId: user.sub,
    action: input.enabled ? 'gamification.hostel_enabled' : 'gamification.hostel_disabled',
    entityType: 'hostel',
    entityId: hostelId,
    before: hostel,
    after,
  });
  return after;
}

// ============================================================================
// Competitions
// ============================================================================

export async function createCompetition(user: AuthUser, input: z.infer<typeof createCompetitionSchema>) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can create a gamification competition');
  const hostel = await repo.findHostel(input.hostelId);
  if (!hostel) throw new NotFoundError('Hostel');
  if (!hostel.gamification_enabled) throw new ConflictError('Gamification is not enabled for this hostel — a Head Warden must enable it first');

  const dimensionKeys = new Set(input.scoringDimensions.map((d) => d.key));
  if (dimensionKeys.size !== input.scoringDimensions.length) throw new ValidationError('Scoring dimension keys must be unique');

  const row = await repo.createCompetition({
    org_id: user.org_id,
    campus_id: hostel.campus_id,
    hostel_id: input.hostelId,
    competition_type: input.competitionType,
    name: input.name,
    description: input.description ?? null,
    scoring_dimensions: JSON.stringify(input.scoringDimensions),
    eligible_scope_type: input.eligibleScopeType,
    start_date: input.startDate,
    end_date: input.endDate,
    appeal_window_days: input.appealWindowDays,
    tie_breaker_rule: input.tieBreakerRule ?? null,
    created_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId: hostel.campus_id, actorUserId: user.sub, action: 'gamification.competition_created', entityType: 'gamification_competition', entityId: row.id, after: row });
  return row;
}

export async function listCompetitions(filters: { hostelId?: string; status?: string }) {
  return repo.listCompetitions(filters);
}

export async function getCompetition(id: string) {
  const row = await repo.findCompetitionById(id);
  if (!row) throw new NotFoundError('Gamification competition');
  const entries = await repo.listEntriesForCompetition(id);
  return { ...row, entries };
}

/** Bulk-enrols every room/floor under the competition's hostel that
 * matches eligible_scope_type — only while still 'draft', so the entrant
 * list is locked in alongside the published rules before anyone can see
 * who's competing against whom, same "rules published before start"
 * reasoning §23.5 states for the scoring dimensions themselves. */
export async function generateEntries(user: AuthUser, competitionId: string) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can generate competition entries');
  const competition = await repo.findCompetitionById(competitionId);
  if (!competition) throw new NotFoundError('Gamification competition');
  if (competition.status !== 'draft') throw new ConflictError(`Cannot generate entries for a competition in status '${competition.status}'`);

  const scopeRows: { id: string }[] =
    competition.eligible_scope_type === 'room'
      ? await db('rooms').join('floors', 'floors.id', 'rooms.floor_id').join('blocks', 'blocks.id', 'floors.block_id').where('blocks.hostel_id', competition.hostel_id).select('rooms.id')
      : await db('floors').join('blocks', 'blocks.id', 'floors.block_id').where('blocks.hostel_id', competition.hostel_id).select('floors.id');

  const created = [];
  for (const scope of scopeRows) {
    const existing = await repo.findEntryForScope(competitionId, competition.eligible_scope_type, scope.id);
    if (existing) continue;
    created.push(
      await repo.createEntry({
        org_id: user.org_id,
        campus_id: competition.campus_id,
        competition_id: competitionId,
        scope_type: competition.eligible_scope_type,
        scope_id: scope.id,
      })
    );
  }
  await recordAudit({
    orgId: user.org_id,
    campusId: competition.campus_id,
    actorUserId: user.sub,
    action: 'gamification.entries_generated',
    entityType: 'gamification_competition',
    entityId: competitionId,
    after: { generated: created.length },
  });
  return created;
}

export async function openCompetition(user: AuthUser, id: string) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can open a competition');
  const before = await repo.findCompetitionById(id);
  if (!before) throw new NotFoundError('Gamification competition');
  if (before.status !== 'draft') throw new ConflictError(`Cannot open a competition in status '${before.status}'`);
  const entries = await repo.listEntriesForCompetition(id);
  if (entries.length === 0) throw new ConflictError('Generate entries before opening this competition');

  const after = await repo.updateCompetition(id, { status: 'open' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.competition_opened', entityType: 'gamification_competition', entityId: id, before, after });

  // Tell every entrant's occupants a competition they're in has started.
  for (const entry of entries) {
    await notifyOccupantsInScope(db, user.org_id, before.campus_id, entry.scope_type, entry.scope_id, {
      type: 'gamification.competition_opened',
      title: `"${before.name}" has started — see your room/floor's entry`,
      link: '/gamification',
    });
  }
  return after;
}

export async function lockScoring(user: AuthUser, id: string) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can lock scoring');
  const before = await repo.findCompetitionById(id);
  if (!before) throw new NotFoundError('Gamification competition');
  if (before.status !== 'open') throw new ConflictError(`Cannot lock scoring for a competition in status '${before.status}'`);

  const after = await repo.updateCompetition(id, { status: 'scoring_locked' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.scoring_locked', entityType: 'gamification_competition', entityId: id, before, after });
  return after;
}

/** §23.4's PROVISIONAL_RESULT — aggregates each entry's current scores per
 * the published weights (computeEntryTotal/rankEntries, types.ts's own
 * pure functions), writes total_score/rank/is_winner, and opens the
 * appeal window in the same step (this build doesn't model a distinct
 * gap between "results computed" and "appeals open"). */
export async function computeProvisionalResult(user: AuthUser, id: string) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can compute results');
  const before = await repo.findCompetitionById(id);
  if (!before) throw new NotFoundError('Gamification competition');
  if (before.status !== 'scoring_locked') throw new ConflictError(`Cannot compute results for a competition in status '${before.status}'`);

  const dimensions = before.scoring_dimensions as ScoringDimensionConfig[];
  const entries = await repo.listEntriesForCompetition(id);

  const totals = await Promise.all(
    entries.map(async (entry) => {
      const current = await repo.findCurrentScoresForEntry(entry.id);
      return { id: entry.id, totalScore: computeEntryTotal(dimensions, current), optedOut: entry.opted_out };
    })
  );
  const ranks = rankEntries(totals);

  for (const t of totals) {
    await repo.updateEntry(t.id, { total_score: t.totalScore, rank: ranks.get(t.id) ?? null, is_winner: ranks.get(t.id) === 1 });
  }

  const after = await repo.updateCompetition(id, { status: 'appeal_window' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.provisional_result', entityType: 'gamification_competition', entityId: id, before, after });
  return after;
}

export async function finalizeResult(user: AuthUser, id: string) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can finalize results');
  const before = await repo.findCompetitionById(id);
  if (!before) throw new NotFoundError('Gamification competition');
  if (before.status !== 'appeal_window') throw new ConflictError(`Cannot finalize a competition in status '${before.status}'`);

  const after = await repo.updateCompetition(id, { status: 'final_result' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.final_result', entityType: 'gamification_competition', entityId: id, before, after });

  const entries = await repo.listEntriesForCompetition(id);
  for (const entry of entries.filter((e) => e.is_winner)) {
    await notifyOccupantsInScope(db, user.org_id, before.campus_id, entry.scope_type, entry.scope_id, {
      type: 'gamification.result_final',
      title: `Congratulations — your ${entry.scope_type} won "${before.name}"!`,
      link: '/gamification',
    });
  }
  return after;
}

export async function closeCompetition(user: AuthUser, id: string) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can close a competition');
  const before = await repo.findCompetitionById(id);
  if (!before) throw new NotFoundError('Gamification competition');
  if (before.status !== 'final_result') throw new ConflictError(`Cannot close a competition in status '${before.status}'`);

  const after = await repo.updateCompetition(id, { status: 'closed' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.competition_closed', entityType: 'gamification_competition', entityId: id, before, after });
  return after;
}

export async function cancelCompetition(user: AuthUser, id: string, input: z.infer<typeof cancelCompetitionSchema>) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can cancel a competition');
  const before = await repo.findCompetitionById(id);
  if (!before) throw new NotFoundError('Gamification competition');
  if (['closed', 'cancelled'].includes(before.status)) throw new ConflictError(`Cannot cancel a competition in status '${before.status}'`);

  const after = await repo.updateCompetition(id, { status: 'cancelled', cancelled_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.competition_cancelled', entityType: 'gamification_competition', entityId: id, before, after, reason: input.reason });
  return after;
}

// ============================================================================
// Entries & scoring
// ============================================================================

export async function recordScore(user: AuthUser, entryId: string, input: z.infer<typeof recordScoreSchema>) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can record a score');
  const entry = await repo.findEntryById(entryId);
  if (!entry) throw new NotFoundError('Gamification entry');
  const competition = await repo.findCompetitionById(entry.competition_id);
  if (!competition) throw new NotFoundError('Gamification competition');
  if (competition.status !== 'open') throw new ConflictError(`Cannot record a score while the competition is in status '${competition.status}'`);

  const dimensions = competition.scoring_dimensions as ScoringDimensionConfig[];
  const dimension = dimensions.find((d) => d.key === input.dimensionKey);
  if (!dimension) throw new ValidationError(`'${input.dimensionKey}' is not a configured scoring dimension for this competition`);
  if (dimension.evidenceRequired && !input.evidenceReference) throw new ValidationError(`Dimension '${input.dimensionKey}' requires an evidence reference`);
  if (input.score < dimension.scoreMin || input.score > dimension.scoreMax) {
    throw new ValidationError(`Score must be between ${dimension.scoreMin} and ${dimension.scoreMax} for dimension '${input.dimensionKey}'`);
  }

  const current = await repo.listScoresForEntry(entryId);
  const currentForDimension = current.filter((s) => s.dimension_key === input.dimensionKey);
  const superseded = new Set(currentForDimension.map((s) => s.supersedes_score_id).filter(Boolean));
  const activePrior = currentForDimension.find((s) => !superseded.has(s.id));
  if (activePrior && !input.editReason) {
    throw new ValidationError('A score already exists for this dimension — provide editReason to correct it');
  }

  const row = await repo.createScore({
    org_id: user.org_id,
    campus_id: entry.campus_id,
    entry_id: entryId,
    dimension_key: input.dimensionKey,
    score: input.score,
    scored_by: user.sub,
    evidence_reference: input.evidenceReference ?? null,
    supersedes_score_id: activePrior?.id ?? null,
    edit_reason: input.editReason ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: entry.campus_id,
    actorUserId: user.sub,
    action: activePrior ? 'gamification.score_corrected' : 'gamification.score_recorded',
    entityType: 'gamification_score',
    entityId: row.id,
    after: row,
    reason: input.editReason,
  });
  return row;
}

export async function listEntryScores(entryId: string) {
  const entry = await repo.findEntryById(entryId);
  if (!entry) throw new NotFoundError('Gamification entry');
  return repo.listScoresForEntry(entryId);
}

/** §23.7 "Resident participation may be opt-out where policy requires." A
 * room's current occupant only — the same ownership check maintenance/
 * service.ts's addResidentComment uses for its own room-scoped action. */
export async function optOutEntry(user: AuthUser, entryId: string, _input: z.infer<typeof optOutEntrySchema>) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Gamification entry');
  if (before.scope_type !== 'room') throw new ConflictError('Only a room entry can be individually opted out');
  const occupant = await db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where({ 'beds.room_id': before.scope_id, 'allocations.status': 'checked_in_active' }).first('allocations.student_id');
  if (occupant?.student_id !== user.sub) throw new ForbiddenError("Only this room's current occupant can opt out");

  const after = await repo.updateEntry(entryId, { opted_out: true });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.entry_opted_out', entityType: 'gamification_entry', entityId: entryId, before, after });
  return after;
}

export async function setAlias(user: AuthUser, entryId: string, input: z.infer<typeof setAliasSchema>) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can set a leaderboard alias');
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Gamification entry');

  const after = await repo.updateEntry(entryId, { alias: input.alias });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.alias_set', entityType: 'gamification_entry', entityId: entryId, before, after });
  return after;
}

/** §23.6 rewards — never touches Finance; reward_description is always
 * free text, matching §23.6/23.7's own boundary ("D17 does not create
 * wallet value directly"). */
export async function issueRecognition(user: AuthUser, entryId: string, input: z.infer<typeof issueRecognitionSchema>) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can issue recognition');
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Gamification entry');
  const competition = await repo.findCompetitionById(before.competition_id);
  if (!competition || competition.status !== 'final_result') throw new ConflictError('Recognition can only be issued once results are final');

  const after = await repo.updateEntry(entryId, { recognition_status: 'issued', reward_description: input.rewardDescription ?? null });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.recognition_issued', entityType: 'gamification_entry', entityId: entryId, before, after });
  await notifyOccupantsInScope(db, user.org_id, before.campus_id, before.scope_type, before.scope_id, {
    type: 'gamification.recognition_issued',
    title: `Recognition issued for "${competition.name}"`,
    body: input.rewardDescription,
    link: '/gamification',
  });
  return after;
}

export async function appealEntry(user: AuthUser, entryId: string, input: z.infer<typeof appealEntrySchema>) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Gamification entry');
  const competition = await repo.findCompetitionById(before.competition_id);
  if (!competition || competition.status !== 'appeal_window') throw new ConflictError('Appeals are only accepted while the appeal window is open');
  if (before.appeal_status !== 'none') throw new ConflictError('This entry has already been appealed');
  if (before.scope_type === 'room') {
    const occupant = await db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where({ 'beds.room_id': before.scope_id, 'allocations.status': 'checked_in_active' }).first('allocations.student_id');
    if (occupant?.student_id !== user.sub && !(await canManageGamification(user))) throw new ForbiddenError("Only this room's current occupant, or staff, can appeal this entry");
  } else if (!(await canManageGamification(user))) {
    throw new ForbiddenError('Only staff can appeal a floor-scoped entry');
  }

  const after = await repo.updateEntry(entryId, { appeal_status: 'appealed', appeal_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'gamification.entry_appealed', entityType: 'gamification_entry', entityId: entryId, before, after, reason: input.reason });
  return after;
}

export async function decideEntryAppeal(user: AuthUser, entryId: string, input: z.infer<typeof decideEntryAppealSchema>) {
  if (!(await canManageGamification(user))) throw new ForbiddenError('Only staff can decide an appeal');
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Gamification entry');
  if (before.appeal_status !== 'appealed') throw new ConflictError(`Cannot decide an appeal in status '${before.appeal_status}'`);

  const after = await repo.updateEntry(entryId, {
    appeal_status: input.outcome,
    appeal_decided_by: user.sub,
    appeal_decided_at: db.fn.now(),
    appeal_decision_reason: input.reason,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'gamification.appeal_decided',
    entityType: 'gamification_entry',
    entityId: entryId,
    before,
    after,
    reason: input.reason,
  });
  if (before.scope_type === 'room') {
    const occupant = await db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where({ 'beds.room_id': before.scope_id, 'allocations.status': 'checked_in_active' }).first('allocations.student_id');
    if (occupant) {
      await notify({ orgId: user.org_id, campusId: before.campus_id, userId: occupant.student_id, type: 'gamification.appeal_decided', title: `Your gamification score appeal was ${input.outcome}`, body: input.reason, link: '/gamification' });
    }
  }
  return after;
}
