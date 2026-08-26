import { db } from '../../db';

// --- Common areas (item 75) -------------------------------------------

export function createCommonArea(data: Record<string, unknown>) {
  return db('common_areas').insert(data).returning('*').then((rows) => rows[0]);
}

export function findCommonAreaById(id: string) {
  return db('common_areas').where({ id }).first();
}

export function updateCommonArea(id: string, data: Record<string, unknown>) {
  return db('common_areas')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listCommonAreas(filters: { hostelId?: string; areaType?: string }) {
  const query = db('common_areas').orderBy('name');
  if (filters.hostelId) query.andWhere({ hostel_id: filters.hostelId });
  if (filters.areaType) query.andWhere({ area_type: filters.areaType });
  return query;
}

// --- Sanitation inspections (item 76) -----------------------------------

export function createInspection(data: Record<string, unknown>) {
  return db('sanitation_inspections').insert(data).returning('*').then((rows) => rows[0]);
}

export function listInspections(commonAreaId: string) {
  return db('sanitation_inspections').where({ common_area_id: commonAreaId }).orderBy('inspected_at', 'desc');
}

export function listFailedInspectionsNeedingReinspection() {
  return db('sanitation_inspections').where({ status: 'needs_reinspection' }).orderBy('inspected_at');
}

// --- Utility outages (item 77) -------------------------------------------

export function createOutage(data: Record<string, unknown>) {
  return db('utility_outages').insert(data).returning('*').then((rows) => rows[0]);
}

export function findOutageById(id: string) {
  return db('utility_outages').where({ id }).first();
}

export function updateOutage(id: string, data: Record<string, unknown>) {
  return db('utility_outages')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listOutages(filters: { hostelId?: string; status?: string }) {
  const query = db('utility_outages').orderBy('reported_at', 'desc');
  if (filters.hostelId) query.andWhere({ hostel_id: filters.hostelId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

export function createOutageUpdate(data: Record<string, unknown>) {
  return db('utility_outage_updates').insert(data).returning('*').then((rows) => rows[0]);
}

export function listOutageUpdates(outageId: string) {
  return db('utility_outage_updates').where({ outage_id: outageId }).orderBy('created_at');
}

/** The affected-population calc BRD asks for (item 77) — derived from
 * live occupancy, not a manually typed recipient list. Same join shape
 * headcount/occupancyVerification already use for the same three scope
 * types. Returns the actual student ids (not just a count) so callers can
 * both size the "affected population" figure AND loop-notify each one —
 * the same "loop and notify per resident" pattern safety/service.ts's
 * drill entries and headcount/service.ts's session prefill already use. */
export function listOccupantsInScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  const base = db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where('allocations.status', 'checked_in_active');
  if (scopeType === 'room') {
    return base.andWhere('beds.room_id', scopeId).select('allocations.student_id');
  }
  if (scopeType === 'floor') {
    return base.join('rooms', 'rooms.id', 'beds.room_id').andWhere('rooms.floor_id', scopeId).select('allocations.student_id');
  }
  return base
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .andWhere('blocks.hostel_id', scopeId)
    .select('allocations.student_id');
}

// --- Pest control (item 78) -----------------------------------------------

export function createPestTreatment(data: Record<string, unknown>) {
  return db('pest_control_treatments').insert(data).returning('*').then((rows) => rows[0]);
}

export function findPestTreatmentById(id: string) {
  return db('pest_control_treatments').where({ id }).first();
}

export function updatePestTreatment(id: string, data: Record<string, unknown>) {
  return db('pest_control_treatments')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listPestTreatments(filters: { status?: string; scopeId?: string }) {
  const query = db('pest_control_treatments').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  return query;
}

/** How many prior treatments touched this exact scope — the raw signal a
 * human uses to spot a recurring infestation, same reasoning as
 * roomAccess/repository.ts's countIssuesInWindow for master-key audits:
 * a count, not a fabricated automatic verdict. */
export async function countPriorTreatmentsForScope(scopeId: string): Promise<number> {
  const row = await db('pest_control_treatments').where({ scope_id: scopeId }).count<{ count: string }[]>('id as count').first();
  return Number(row?.count ?? 0);
}
