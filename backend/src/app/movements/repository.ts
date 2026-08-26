import { db } from '../../db';

export function findById(id: string) {
  return db('movement_requests').where({ id }).first();
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('movement_requests').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

export function findActiveForStudent(studentId: string) {
  return db('movement_requests').where({ student_id: studentId }).whereIn('status', ['requested', 'approved', 'out', 'overdue']).first();
}

export function create(data: Record<string, unknown>) {
  return db('movement_requests')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('movement_requests')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** BR §8's own reconciliation input, and Headcount's "approved_out" hint —
 * a resident currently physically out on an approved, unreturned movement. */
export function findCurrentlyOut(studentId: string) {
  return db('movement_requests').where({ student_id: studentId }).whereIn('status', ['out', 'overdue']).first();
}
