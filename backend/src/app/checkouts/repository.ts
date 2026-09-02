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

// --- D17.12 item 106 — abandonment contact attempts -------------------------

export function createContactAttempt(data: Record<string, unknown>) {
  return db('checkout_contact_attempts').insert(data).returning('*').then((rows) => rows[0]);
}

export function listContactAttempts(checkoutId: string) {
  return db('checkout_contact_attempts').where({ checkout_id: checkoutId }).orderBy('attempted_at', 'desc');
}

export async function countContactAttempts(checkoutId: string): Promise<number> {
  const row = await db('checkout_contact_attempts').where({ checkout_id: checkoutId }).count<{ count: string }[]>('id as count').first();
  return Number(row?.count ?? 0);
}

// --- D17.12 item 107 — itemized checkout inventory --------------------------

export function createInventoryItem(data: Record<string, unknown>) {
  return db('checkout_inventory_items').insert(data).returning('*').then((rows) => rows[0]);
}

export function listInventoryItems(checkoutId: string) {
  return db('checkout_inventory_items').where({ checkout_id: checkoutId }).orderBy('created_at');
}

/** The check-in side of the before/after comparison item 107 asks for —
 * every item recorded when this resident originally moved in, so the
 * checkout screen can show "here's what it looked like then" alongside
 * what's being recorded now. */
export function listCheckinItemsForAllocation(allocationId: string) {
  return db('checkin_inventory_items').join('checkins', 'checkins.id', 'checkin_inventory_items.checkin_id').where('checkins.allocation_id', allocationId).select('checkin_inventory_items.*');
}
