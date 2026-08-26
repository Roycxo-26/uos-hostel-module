import { db } from '../../db';

export function findById(id: string) {
  return db('transfer_requests').where({ id }).first();
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('transfer_requests').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

/** BR §11 rule 2 duplicate-prevention lives at the DB constraint level
 * (uq_one_active_transfer_per_allocation) — this is only the friendly
 * pre-check so the caller gets a clear ConflictError instead of a raw
 * unique_violation. */
export function findActiveForAllocation(allocationId: string) {
  return db('transfer_requests').where({ current_allocation_id: allocationId }).whereIn('status', ['requested', 'approved']).first();
}

export function create(data: Record<string, unknown>) {
  return db('transfer_requests')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('transfer_requests')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
