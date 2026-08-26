import { db } from '../../db';

export function findById(id: string) {
  return db('checkouts').where({ id }).first();
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('checkouts').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

export function findActiveForAllocation(allocationId: string) {
  return db('checkouts').where({ allocation_id: allocationId }).whereIn('status', ['requested', 'inspected']).first();
}

export function create(data: Record<string, unknown>) {
  return db('checkouts')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('checkouts')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
