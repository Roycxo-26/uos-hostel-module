import { db } from '../../db';

export function findById(id: string) {
  return db('financial_events').where({ id }).first();
}

export function list(filters: { studentId?: string; status?: string; eventType?: string }) {
  const query = db('financial_events').orderBy('raised_at', 'desc');
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.eventType) query.andWhere({ event_type: filters.eventType });
  return query;
}

/** Every event for a resident, oldest first — what getResidentFinancialSummary
 * sums over. Kept separate from list() above (which defaults newest-first
 * for a staff review queue) since a summary reads more naturally in
 * chronological order. */
export function listForStudent(studentId: string) {
  return db('financial_events').where({ student_id: studentId }).orderBy('raised_at', 'asc');
}

export function create(data: Record<string, unknown>) {
  return db('financial_events')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('financial_events')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
