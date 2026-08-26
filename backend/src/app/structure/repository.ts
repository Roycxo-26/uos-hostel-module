import { db } from '../../db';

// No org_id/campus_id filters in any read below — RLS (database/migrations
// 20260101000004) restricts every query to the current request's org+campus
// (or every campus in the org, when campus_scope=ALL) automatically.

export function listHostels() {
  return db('hostels').orderBy('name');
}

export function findHostel(id: string) {
  return db('hostels').where({ id }).first();
}

export function createHostel(data: Record<string, unknown>) {
  return db('hostels').insert(data).returning('*').then((rows) => rows[0]);
}

export function updateHostel(id: string, data: Record<string, unknown>) {
  return db('hostels')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function findBlock(id: string) {
  return db('blocks').where({ id }).first();
}

export function createBlock(data: Record<string, unknown>) {
  return db('blocks').insert(data).returning('*').then((rows) => rows[0]);
}

export function updateBlock(id: string, data: Record<string, unknown>) {
  return db('blocks')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function findFloor(id: string) {
  return db('floors').where({ id }).first();
}

export function createFloor(data: Record<string, unknown>) {
  return db('floors').insert(data).returning('*').then((rows) => rows[0]);
}

export function updateFloor(id: string, data: Record<string, unknown>) {
  return db('floors')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function findRoom(id: string) {
  return db('rooms').where({ id }).first();
}

export function createRoom(data: Record<string, unknown>) {
  return db('rooms').insert(data).returning('*').then((rows) => rows[0]);
}

export function updateRoom(id: string, data: Record<string, unknown>) {
  return db('rooms')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

// A room can only be deactivated if every bed in it is free of active
// occupancy — flow.md §15 "Cannot deactivate with unresolved active
// occupancy" / §18 DoD "no silent delete of occupied structure".
export async function roomHasActiveOccupancy(roomId: string): Promise<boolean> {
  const row = await db('beds').where({ room_id: roomId }).whereIn('status', ['reserved', 'allocated', 'occupied']).first();
  return Boolean(row);
}

export function updateRoomStatus(id: string, status: string, reason: string | null, reviewDate: string | null, reasonCategory: string | null) {
  return db('rooms')
    .where({ id })
    .update({ status, status_reason: reason, status_review_date: reviewDate, status_reason_category: reasonCategory })
    .returning('*')
    .then((rows) => rows[0]);
}

// D17.01 item 48 — every physical bed row counts toward capacity, whatever
// its operational status: a 'blocked'/'maintenance' bed is still a bed
// occupying the room, just temporarily unusable. Only a genuinely deleted
// row (which this schema never does — flow.md §18 "no silent delete of
// occupied structure") would not count.
export async function countBeds(roomId: string): Promise<number> {
  const row = await db('beds').where({ room_id: roomId }).count<{ count: string }[]>('id as count').first();
  return Number(row?.count ?? 0);
}

export function findBed(id: string) {
  return db('beds').where({ id }).first();
}

export function createBed(data: Record<string, unknown>) {
  return db('beds').insert(data).returning('*').then((rows) => rows[0]);
}

export function updateBed(id: string, data: Record<string, unknown>) {
  return db('beds')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateBedStatus(id: string, status: string, reason: string | null, reviewDate: string | null) {
  return db('beds')
    .where({ id })
    .update({ status, status_reason: reason, status_review_date: reviewDate, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

// D17.01 item 44 — one alias row per rename, never overwritten, so a
// code's full rename history stays resolvable, not just its immediately
// previous value.
export function createEntityCodeAlias(data: { org_id: string; campus_id: string; entity_type: string; entity_id: string; old_code: string }) {
  return db('entity_code_aliases').insert(data).returning('*').then((rows) => rows[0]);
}

export function findEntityByAlias(entityType: string, oldCode: string) {
  return db('entity_code_aliases')
    .where({ entity_type: entityType, old_code: oldCode })
    .orderBy('superseded_at', 'desc')
    .first();
}

/** Full nested tree for one hostel — what the Hostel Structure screen
 * renders. Four queries instead of one giant join: simpler to read at
 * Phase-1 scale; revisit with a joined query if a tenant's structure grows
 * large enough to matter for the p95 budget. */
export async function getHostelTree(hostelId: string) {
  const hostel = await findHostel(hostelId);
  if (!hostel) return null;

  const blocks = await db('blocks').where({ hostel_id: hostelId }).orderBy('code');
  const floors = blocks.length
    ? await db('floors')
        .whereIn(
          'block_id',
          blocks.map((b) => b.id)
        )
        .orderBy('number')
    : [];
  const rooms = floors.length
    ? await db('rooms')
        .whereIn(
          'floor_id',
          floors.map((f) => f.id)
        )
        .orderBy('code')
    : [];
  const beds = rooms.length
    ? await db('beds')
        .whereIn(
          'room_id',
          rooms.map((r) => r.id)
        )
        .orderBy('code')
    : [];

  return {
    ...hostel,
    blocks: blocks.map((block) => ({
      ...block,
      floors: floors
        .filter((f) => f.block_id === block.id)
        .map((floor) => ({
          ...floor,
          rooms: rooms
            .filter((r) => r.floor_id === floor.id)
            .map((room) => ({
              ...room,
              beds: beds.filter((b) => b.room_id === room.id),
            })),
        })),
    })),
  };
}
