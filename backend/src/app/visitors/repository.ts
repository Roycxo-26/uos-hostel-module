import { db } from '../../db';

export function findById(id: string) {
  return db('visitor_requests').where({ id }).first();
}

export function list(filters: { status?: string; hostUserId?: string }) {
  const query = db('visitor_requests').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.hostUserId) query.andWhere({ host_user_id: filters.hostUserId });
  return query;
}

export function create(data: Record<string, unknown>) {
  return db('visitor_requests')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('visitor_requests')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** D17.06 item 114 — the slot-capacity check's own count query. Buckets by
 * exact requested_visit_start equality within the caller-supplied window,
 * not a generic overlap check — the settings this wires up
 * (visitorSlotDurationMinutes) describe fixed slots a host picks into, not
 * arbitrary free-form time ranges. */
export async function countInSlot(campusId: string, slotStart: Date, slotEnd: Date): Promise<number> {
  const row = await db('visitor_requests')
    .where({ campus_id: campusId })
    .whereIn('status', ['requested', 'approved', 'pass_issued', 'entered'])
    .andWhere('requested_visit_start', '>=', slotStart)
    .andWhere('requested_visit_start', '<', slotEnd)
    .count<{ count: string }[]>('id as count')
    .first();
  return Number(row?.count ?? 0);
}
