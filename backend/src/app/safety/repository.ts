import { db } from '../../db';

// --- Hostel safety status (D17.17 items 63/64) ---------------------------

export function findHostel(hostelId: string) {
  return db('hostels').where({ id: hostelId }).first();
}

export function updateHostelSafety(hostelId: string, data: Record<string, unknown>) {
  return db('hostels')
    .where({ id: hostelId })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

// --- Evacuation drills / emergency muster (D17.17 items 65/66) -----------

export function createDrill(data: Record<string, unknown>) {
  return db('evacuation_drills').insert(data).returning('*').then((rows) => rows[0]);
}

export function findDrillById(id: string) {
  return db('evacuation_drills').where({ id }).first();
}

export function updateDrill(id: string, data: Record<string, unknown>) {
  return db('evacuation_drills')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listDrills(filters: { hostelId?: string; status?: string }) {
  const query = db('evacuation_drills').orderBy('created_at', 'desc');
  if (filters.hostelId) query.andWhere({ hostel_id: filters.hostelId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

export function createDrillEntry(data: Record<string, unknown>) {
  return db('evacuation_drill_entries').insert(data).returning('*').then((rows) => rows[0]);
}

export function listDrillEntries(drillId: string) {
  return db('evacuation_drill_entries').where({ drill_id: drillId }).orderBy('created_at');
}

export function updateDrillEntry(drillId: string, studentId: string, data: Record<string, unknown>) {
  return db('evacuation_drill_entries')
    .where({ drill_id: drillId, student_id: studentId })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export async function countUnresolvedEntries(drillId: string): Promise<number> {
  const row = await db('evacuation_drill_entries')
    .where({ drill_id: drillId, status: 'unresolved' })
    .count<{ count: string }[]>('id as count')
    .first();
  return Number(row?.count ?? 0);
}

// --- D17.17 item 67 — the allocation/check-in-blocking hook ---------------
//
// Lives here (repository-to-repository reuse) rather than as a
// safety/service.ts export, matching this codebase's existing convention:
// no module's service.ts ever imports another module's service.ts
// (headcount/service.ts importing responsibilities/repository.ts and
// movements/repository.ts is the precedent) — service-to-service calls
// would re-run another module's own audit/notify side effects redundantly
// and blur ownership of who's actually deciding what. This is a pure,
// side-effect-free read, so it belongs at the repository layer; the
// calling service (allocations/service.ts) is the one that turns a
// blocked result into a thrown ConflictError, same as it does with every
// other pre-write guard it already runs.

export async function findBedSafetyBlock(bedId: string): Promise<{ blocked: boolean; reason?: string }> {
  const row = await db('beds')
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .where('beds.id', bedId)
    .select(
      'rooms.status as room_status',
      'rooms.status_reason as room_status_reason',
      'rooms.status_reason_category as room_status_reason_category',
      'blocks.hostel_id as hostel_id'
    )
    .first();
  if (!row) return { blocked: false };

  if (row.room_status === 'suspended' && row.room_status_reason_category === 'safety') {
    return { blocked: true, reason: `Room is under a safety block: ${row.room_status_reason ?? 'no reason given'}` };
  }

  const hostel = await findHostel(row.hostel_id);
  if (hostel && ['SAFETY_RESTRICTION_ACTIVE', 'CLOSED_FOR_SAFETY'].includes(hostel.safety_status)) {
    return { blocked: true, reason: `Hostel safety status is ${String(hostel.safety_status).replace(/_/g, ' ')} — new occupancy is blocked` };
  }

  return { blocked: false };
}
