import { db } from '../../db';

// --- Closure cases ---------------------------------------------------------

export function createCase(data: Record<string, unknown>) {
  return db('closure_cases').insert(data).returning('*').then((rows) => rows[0]);
}

export function findCaseById(id: string) {
  return db('closure_cases').where({ id }).first();
}

export function updateCase(id: string, data: Record<string, unknown>) {
  return db('closure_cases')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listCases(filters: { hostelId?: string; status?: string }) {
  const query = db('closure_cases').orderBy('created_at', 'desc');
  if (filters.hostelId) query.andWhere({ hostel_id: filters.hostelId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

// --- Per-resident impacts ---------------------------------------------------

export function createImpact(data: Record<string, unknown>) {
  return db('closure_case_impacts').insert(data).returning('*').then((rows) => rows[0]);
}

export function findImpactById(id: string) {
  return db('closure_case_impacts').where({ id }).first();
}

export function listImpacts(closureCaseId: string) {
  return db('closure_case_impacts').where({ closure_case_id: closureCaseId }).orderBy('created_at');
}

export function updateImpact(id: string, data: Record<string, unknown>) {
  return db('closure_case_impacts')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export async function countPendingImpacts(closureCaseId: string): Promise<number> {
  const row = await db('closure_case_impacts')
    .where({ closure_case_id: closureCaseId, outcome: 'pending' })
    .count<{ count: string }[]>('id as count')
    .first();
  return Number(row?.count ?? 0);
}

// --- Item 88 — the reopening-readiness/occupancy-blocking hooks -----------
//
// Both live here (repository-to-repository reuse), not as closures/
// service.ts exports — same reasoning as safety/repository.ts's
// findBedSafetyBlock: pure, side-effect-free reads that another module's
// service.ts consumes directly, keeping this codebase's "no service imports
// another module's service" rule intact.

/** structure/service.ts's updateHostel guard — item 88's actual gate: a
 * hostel with an open closure case at hostel scope can't be flipped back to
 * 'active' by a direct status edit; it has to go through this module's own
 * completeReopening/completeClosureCase action instead. */
export function findOpenCaseForHostel(hostelId: string) {
  return db('closure_cases')
    .where({ hostel_id: hostelId, scope_type: 'hostel', scope_id: hostelId })
    .whereIn('status', ['approved', 'active_closure', 'reopening_planned'])
    .first();
}

/** allocations/service.ts's createAllocation/createOffer guard — a bed
 * inside a room/floor/hostel currently mid-closure is not occupiable, even
 * if the bed's own status still happens to read 'available'. */
export async function findClosureBlock(bedId: string): Promise<{ blocked: boolean; reason?: string }> {
  const row = await db('beds')
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .where('beds.id', bedId)
    .select('rooms.id as room_id', 'floors.id as floor_id', 'blocks.hostel_id as hostel_id')
    .first();
  if (!row) return { blocked: false };

  const activeCase = await db('closure_cases')
    .where({ status: 'active_closure' })
    .andWhere((qb) => {
      qb.where({ scope_type: 'room', scope_id: row.room_id })
        .orWhere({ scope_type: 'floor', scope_id: row.floor_id })
        .orWhere({ scope_type: 'hostel', scope_id: row.hostel_id });
    })
    .first();
  if (!activeCase) return { blocked: false };

  return {
    blocked: true,
    reason: `${activeCase.scope_type === 'hostel' ? 'This hostel' : activeCase.scope_type === 'floor' ? 'This floor' : 'This room'} is under an active ${
      activeCase.case_type === 'shutdown' ? 'shutdown' : 'mass relocation'
    } case — new occupancy is blocked until it's resolved`,
  };
}
