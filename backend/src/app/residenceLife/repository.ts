import { db } from '../../db';

// --- Facility bookings -------------------------------------------------------

export function createBooking(data: Record<string, unknown>) {
  return db('facility_bookings').insert(data).returning('*').then((rows) => rows[0]);
}

export function findBookingById(id: string) {
  return db('facility_bookings').where({ id }).first();
}

export function updateBooking(id: string, data: Record<string, unknown>) {
  return db('facility_bookings')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listBookings(filters: { status?: string; commonAreaId?: string }) {
  const query = db('facility_bookings').orderBy('start_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.commonAreaId) query.andWhere({ common_area_id: filters.commonAreaId });
  return query;
}

/** §24H.4 "conflict detection" — any other non-terminal booking on the
 * same facility whose window overlaps the requested one. */
export async function findOverlappingBooking(commonAreaId: string, startAt: Date, endAt: Date, excludeId?: string) {
  const query = db('facility_bookings')
    .where({ common_area_id: commonAreaId })
    .whereIn('status', ['requested', 'approved', 'checked_in'])
    .andWhere('start_at', '<', endAt)
    .andWhere('end_at', '>', startAt);
  if (excludeId) query.andWhereNot('id', excludeId);
  return query.first();
}

// --- Residence-life programmes -------------------------------------------------

export function createProgramme(data: Record<string, unknown>) {
  return db('residence_programmes').insert(data).returning('*').then((rows) => rows[0]);
}

export function findProgrammeById(id: string) {
  return db('residence_programmes').where({ id }).first();
}

export function updateProgramme(id: string, data: Record<string, unknown>) {
  return db('residence_programmes')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listProgrammes(filters: { status?: string; targetScopeType?: string; targetScopeId?: string }) {
  const query = db('residence_programmes').orderBy('scheduled_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.targetScopeType) query.andWhere({ target_scope_type: filters.targetScopeType });
  if (filters.targetScopeId) query.andWhere({ target_scope_id: filters.targetScopeId });
  return query;
}

export function createParticipant(data: Record<string, unknown>) {
  return db('residence_programme_participants').insert(data).returning('*').then((rows) => rows[0]);
}

export function findParticipant(programmeId: string, studentId: string) {
  return db('residence_programme_participants').where({ programme_id: programmeId, student_id: studentId }).first();
}

export function updateParticipant(id: string, data: Record<string, unknown>) {
  return db('residence_programme_participants')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listParticipants(programmeId: string) {
  return db('residence_programme_participants').where({ programme_id: programmeId }).orderBy('registered_at', 'asc');
}
