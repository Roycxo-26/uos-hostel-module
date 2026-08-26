import { db } from '../../db';

export function findSessionById(id: string) {
  return db('headcount_sessions').where({ id }).first();
}

export function findSessionForScopeAndDate(scopeType: string, scopeId: string, sessionDate: string) {
  return db('headcount_sessions').where({ scope_type: scopeType, scope_id: scopeId, session_date: sessionDate }).first();
}

export function listSessions(filters: { scopeType?: string; scopeId?: string; status?: string }) {
  const query = db('headcount_sessions').orderBy('session_date', 'desc');
  if (filters.scopeType) query.andWhere({ scope_type: filters.scopeType });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

export function createSession(data: Record<string, unknown>) {
  return db('headcount_sessions')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateSession(id: string, data: Record<string, unknown>) {
  return db('headcount_sessions')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listEntries(sessionId: string) {
  return db('headcount_entries').where({ session_id: sessionId }).orderBy('created_at');
}

export function createEntry(data: Record<string, unknown>) {
  return db('headcount_entries')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateEntry(sessionId: string, studentId: string, data: Record<string, unknown>) {
  return db('headcount_entries')
    .where({ session_id: sessionId, student_id: studentId })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** BR §8 "reconcile... Close or open incident" — the actual reconciliation
 * queue: unresolved entries from sessions that already closed. */
export function listOpenIssues() {
  return db('headcount_entries')
    .join('headcount_sessions', 'headcount_sessions.id', 'headcount_entries.session_id')
    .where('headcount_sessions.status', 'closed')
    .whereIn('headcount_entries.status', ['missing', 'unknown'])
    .select(
      'headcount_entries.id',
      'headcount_entries.student_id',
      'headcount_entries.status',
      'headcount_entries.note',
      'headcount_sessions.id as session_id',
      'headcount_sessions.scope_type',
      'headcount_sessions.scope_id',
      'headcount_sessions.session_date'
    )
    .orderBy('headcount_sessions.session_date', 'desc');
}

/** The resident roster for a scope at session-open time — joins through
 * beds/rooms/floors/blocks as needed, restricted to currently active
 * (checked-in) occupancy. */
export function residentsInScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  const base = db('allocations').join('beds', 'beds.id', 'allocations.bed_id').where('allocations.status', 'checked_in_active');

  if (scopeType === 'room') {
    return base.andWhere('beds.room_id', scopeId).select('allocations.id as allocation_id', 'allocations.student_id');
  }
  if (scopeType === 'floor') {
    return base
      .join('rooms', 'rooms.id', 'beds.room_id')
      .andWhere('rooms.floor_id', scopeId)
      .select('allocations.id as allocation_id', 'allocations.student_id');
  }
  return base
    .join('rooms', 'rooms.id', 'beds.room_id')
    .join('floors', 'floors.id', 'rooms.floor_id')
    .join('blocks', 'blocks.id', 'floors.block_id')
    .andWhere('blocks.hostel_id', scopeId)
    .select('allocations.id as allocation_id', 'allocations.student_id');
}
