import { db } from '../../db';

export function createCampaign(data: Record<string, unknown>) {
  return db('feedback_campaigns').insert(data).returning('*').then((rows) => rows[0]);
}

export function findCampaignById(id: string) {
  return db('feedback_campaigns').where({ id }).first();
}

export function updateCampaign(id: string, data: Record<string, unknown>) {
  return db('feedback_campaigns')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listCampaigns(filters: { status?: string }) {
  const query = db('feedback_campaigns').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

export function findResponseByHash(campaignId: string, hash: string) {
  return db('feedback_responses').where({ campaign_id: campaignId, submission_hash: hash }).first();
}

export function findResponseById(id: string) {
  return db('feedback_responses').where({ id }).first();
}

export function createResponse(data: Record<string, unknown>) {
  return db('feedback_responses').insert(data).returning('*').then((rows) => rows[0]);
}

export function listResponsesForCampaign(campaignId: string) {
  return db('feedback_responses').where({ campaign_id: campaignId }).orderBy('created_at', 'desc');
}

export function createCase(data: Record<string, unknown>) {
  return db('feedback_service_recovery_cases').insert(data).returning('*').then((rows) => rows[0]);
}

export function findCaseById(id: string) {
  return db('feedback_service_recovery_cases').where({ id }).first();
}

export function updateCase(id: string, data: Record<string, unknown>) {
  return db('feedback_service_recovery_cases')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listCases(filters: { status?: string; campaignId?: string }) {
  const query = db('feedback_service_recovery_cases').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.campaignId) query.andWhere({ campaign_id: filters.campaignId });
  return query;
}

/**
 * §22.2's own target-scope check, same "raw db() read for a simple
 * eligibility check" pattern as roommate/service.ts's assertEligibleForTerm
 * — a resident's current active allocation, joined up to its room/floor/
 * hostel, so a campaign's target_scope_type/target_scope_id can be
 * checked against whichever level it names.
 */
export function findCurrentScopeForStudent(studentId: string) {
  return db('allocations as a')
    .join('beds as bd', 'bd.id', 'a.bed_id')
    .join('rooms as r', 'r.id', 'bd.room_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .join('blocks as bl', 'bl.id', 'f.block_id')
    .whereIn('a.status', ['confirmed', 'awaiting_check_in', 'checked_in_active'])
    .andWhere('a.student_id', studentId)
    .first('bd.room_id as roomId', 'r.floor_id as floorId', 'bl.hostel_id as hostelId');
}
