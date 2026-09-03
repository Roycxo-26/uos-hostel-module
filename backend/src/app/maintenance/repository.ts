import { db } from '../../db';

// --- Maintenance tickets (item 116) -----------------------------------------

export function createTicket(data: Record<string, unknown>) {
  return db('maintenance_tickets').insert(data).returning('*').then((rows) => rows[0]);
}

export function findTicketById(id: string) {
  return db('maintenance_tickets').where({ id }).first();
}

export function updateTicket(id: string, data: Record<string, unknown>) {
  return db('maintenance_tickets')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listTickets(filters: { status?: string; roomId?: string; raisedBy?: string }) {
  const query = db('maintenance_tickets').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.roomId) query.andWhere({ room_id: filters.roomId });
  if (filters.raisedBy) query.andWhere({ raised_by: filters.raisedBy });
  return query;
}

/** §16.7's "Maintenance Clear or Accepted Non-Critical Defect" gate — an
 * unresolved critical ticket on this room blocks readiness; anything lower
 * priority is an "accepted non-critical defect" per that same rule. */
export async function hasUnresolvedCriticalTicket(roomId: string): Promise<boolean> {
  const row = await db('maintenance_tickets')
    .where({ room_id: roomId, priority: 'critical' })
    .whereNotIn('status', ['resolved', 'closed', 'rejected', 'cancelled'])
    .first('id');
  return Boolean(row);
}

// --- Housekeeping tasks (item 117) ------------------------------------------

export function createHousekeepingTask(data: Record<string, unknown>) {
  return db('housekeeping_tasks').insert(data).returning('*').then((rows) => rows[0]);
}

export function findHousekeepingTaskById(id: string) {
  return db('housekeeping_tasks').where({ id }).first();
}

export function updateHousekeepingTask(id: string, data: Record<string, unknown>) {
  return db('housekeeping_tasks')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listHousekeepingTasks(filters: { status?: string; scopeType?: string; scopeId?: string }) {
  const query = db('housekeeping_tasks').orderBy('scheduled_date', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.scopeType) query.andWhere({ scope_type: filters.scopeType });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  return query;
}

/** §16.7's "Housekeeping Complete" gate — the most recent task scoped to
 * this room (or a floor/hostel scope covering it isn't tracked at
 * room-granularity here, a named simplification: only a room-scoped task
 * counts toward this specific room's own readiness). */
export function findLatestHousekeepingTaskForRoom(roomId: string) {
  return db('housekeeping_tasks').where({ scope_type: 'room', scope_id: roomId }).orderBy('scheduled_date', 'desc').first();
}

// --- Cleanliness inspections (item 118) -------------------------------------

export function createInspection(data: Record<string, unknown>) {
  return db('cleanliness_inspections').insert(data).returning('*').then((rows) => rows[0]);
}

export function findInspectionById(id: string) {
  return db('cleanliness_inspections').where({ id }).first();
}

export function updateInspection(id: string, data: Record<string, unknown>) {
  return db('cleanliness_inspections')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listInspections(filters: { areaType?: string; scopeId?: string }) {
  const query = db('cleanliness_inspections').orderBy('inspected_at', 'desc');
  if (filters.areaType) query.andWhere({ area_type: filters.areaType });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  return query;
}

/** §16.7's "Inspection Passed" gate. */
export function findLatestInspectionForRoom(roomId: string) {
  return db('cleanliness_inspections').where({ area_type: 'room', scope_id: roomId }).orderBy('inspected_at', 'desc').first();
}
