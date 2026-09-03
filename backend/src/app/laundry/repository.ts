import { db } from '../../db';

export function create(data: Record<string, unknown>) {
  return db('laundry_orders').insert(data).returning('*').then((rows) => rows[0]);
}

export function findById(id: string) {
  return db('laundry_orders').where({ id }).first();
}

export function update(id: string, data: Record<string, unknown>) {
  return db('laundry_orders')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('laundry_orders').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}
