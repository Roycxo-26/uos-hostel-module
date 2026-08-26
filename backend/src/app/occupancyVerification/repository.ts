import { db } from '../../db';

export function createSession(data: Record<string, unknown>) {
  return db('occupancy_verification_sessions').insert(data).returning('*').then((rows) => rows[0]);
}

export function findSessionById(id: string) {
  return db('occupancy_verification_sessions').where({ id }).first();
}

export function updateSession(id: string, data: Record<string, unknown>) {
  return db('occupancy_verification_sessions')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listSessions(filters: { status?: string; scopeType?: string; scopeId?: string }) {
  const query = db('occupancy_verification_sessions').orderBy('session_date', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.scopeType) query.andWhere({ scope_type: filters.scopeType });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  return query;
}

export function createEntry(data: Record<string, unknown>) {
  return db('occupancy_verification_entries').insert(data).returning('*').then((rows) => rows[0]);
}

export function findEntryById(id: string) {
  return db('occupancy_verification_entries').where({ id }).first();
}

export function updateEntry(id: string, data: Record<string, unknown>) {
  return db('occupancy_verification_entries')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listEntries(sessionId: string) {
  return db('occupancy_verification_entries').where({ session_id: sessionId }).orderBy('created_at');
}

/** Every checked-in allocation for a scope, joined through to its bed —
 * the frozen expected-occupancy snapshot a session needs at open time.
 * Same join shape as headcount/repository.ts's residentsInScope, but this
 * module also needs the bed id itself (headcount only needs student_id),
 * so it isn't reused as-is. */
export function expectedOccupantsInScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  const base = db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where('allocations.status', 'checked_in_active');

  if (scopeType === 'room') {
    return base.andWhere('beds.room_id', scopeId).select('allocations.student_id', 'beds.id as bed_id');
  }
  if (scopeType === 'floor') {
    return base
      .join('rooms', 'rooms.id', 'beds.room_id')
      .andWhere('rooms.floor_id', scopeId)
      .select('allocations.student_id', 'beds.id as bed_id');
  }
  return base
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .andWhere('blocks.hostel_id', scopeId)
    .select('allocations.student_id', 'beds.id as bed_id');
}

/** D17.18 item 70's auto-check: does an approved, currently-active record
 * already explain why this student wouldn't be where expected? Checked
 * against the same three sources the BRD names — transfer, leave/outpass,
 * temporary relocation — all via direct table reads (repo-to-repo/table
 * reuse, not a service-to-service call; see this module's service.ts for
 * the full reasoning, same convention safety/repository.ts's
 * findBedSafetyBlock already established). */
export async function findExplainingRecord(studentId: string): Promise<string | null> {
  const activeTransfer = await db('transfer_requests')
    .where({ student_id: studentId })
    .whereIn('status', ['requested', 'approved'])
    .first();
  if (activeTransfer) return `An active transfer request (${activeTransfer.id}) already covers this resident`;

  const activeMovement = await db('movement_requests').where({ student_id: studentId }).where({ status: 'out' }).first();
  if (activeMovement) return `An active outpass/leave (out since approval) already explains this resident's absence`;

  // Temporary relocation is a flag on transfer_requests itself
  // (is_temporary), already covered by the activeTransfer check above for
  // an in-progress one — but a temporary relocation can also be
  // *completed* (executed) while still within its return window, which
  // the status-based check above wouldn't catch.
  const activeTempRelocation = await db('transfer_requests')
    .where({ student_id: studentId, is_temporary: true, status: 'completed' })
    .whereNull('restored_at')
    .first();
  if (activeTempRelocation) return `An active temporary relocation (${activeTempRelocation.id}) already explains this resident's bed`;

  return null;
}
