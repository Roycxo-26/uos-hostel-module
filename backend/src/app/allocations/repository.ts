import { db } from '../../db';

export function findById(id: string) {
  return db('allocations').where({ id }).first();
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('allocations').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

/** The No-Show Review queue (flow.md §6.2B, §10): allocations the automatic
 * expiry job (jobs/expireNoShowAllocations.ts) has already moved to
 * `no_show_review`, PLUS anything still `awaiting_check_in` whose deadline
 * has already passed but hasn't been swept yet (the job runs on a 5-minute
 * interval — this second clause is what keeps the queue accurate in that
 * gap, and what keeps it accurate at all if the job were ever down, per BR
 * §11 rule 11's "support controlled recovery after failure"). */
export function listNoShowCandidates() {
  return db('allocations')
    .where({ status: 'no_show_review' })
    .orWhere({ status: 'deferred' })
    .orWhere((qb) => qb.whereIn('status', ['awaiting_check_in', 'no_show_warning']).andWhere('check_in_deadline', '<', db.fn.now()))
    .orderBy('check_in_deadline');
}

// D17.03 item 58 — 'awaiting_check_in' rows whose deadline is within the
// warning window but hasn't been warned yet. Idempotent the same way the
// no-show job already is: `no_show_warned_at IS NULL` is the guard, exactly
// like movement's `return_reminder_sent_at`.
export function listDueForNoShowWarning(warningHours: number) {
  return db('allocations')
    .where({ status: 'awaiting_check_in' })
    .whereNull('no_show_warned_at')
    .andWhere('check_in_deadline', '<', db.raw(`now() + interval '${warningHours} hours'`))
    .andWhere('check_in_deadline', '>', db.fn.now());
}

// --- D17.03 item 53 — Waitlist -----------------------------------------

export function createWaitlistEntry(data: Record<string, unknown>) {
  return db('waitlist_entries').insert(data).returning('*').then((rows) => rows[0]);
}

export function findWaitlistEntry(id: string) {
  return db('waitlist_entries').where({ id }).first();
}

export function findActiveWaitlistEntryByApplication(applicationId: string) {
  return db('waitlist_entries').where({ application_id: applicationId }).whereIn('status', ['active', 'offered']).first();
}

export function updateWaitlistEntry(id: string, data: Record<string, unknown>) {
  return db('waitlist_entries')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** Rank computed at read time — ROW_NUMBER() over the same ordering the
 * gap ledger asks for (priority score, FIFO tie-break) — see the
 * migration's own comment on why this is never a stored column. */
export function listWaitlist(filters: { hostelId?: string; status?: string }) {
  const query = db('waitlist_entries')
    .select('*')
    .select(db.raw('row_number() over (order by priority_score desc, created_at asc) as rank'));
  if (filters.hostelId) query.andWhere({ hostel_id: filters.hostelId });
  query.andWhere({ status: filters.status ?? 'active' });
  return query.orderBy('priority_score', 'desc').orderBy('created_at', 'asc');
}

/** Same computed-rank shape as listWaitlist, scoped to one student — the
 * resident-facing "my position" view (D17.03 item 57). Rank is computed
 * over the SAME pool (`active`, same hostel scope) so the number genuinely
 * matches what a staff member sees on the full list. */
export async function findMyWaitlistRank(studentId: string) {
  const entry = await db('waitlist_entries').where({ student_id: studentId, status: 'active' }).first();
  if (!entry) return undefined;
  // Deliberately NOT `.andWhere({ id: entry.id })` — a WHERE clause on the
  // row itself would filter the window down to one row before ROW_NUMBER()
  // ever runs, making rank always compute as 1. The window has to see the
  // whole scoped pool; the one row this call cares about is picked out of
  // the results afterwards instead.
  const ranked = await db('waitlist_entries')
    .select('*')
    .select(db.raw('row_number() over (order by priority_score desc, created_at asc) as rank'))
    .where({ status: 'active', hostel_id: entry.hostel_id });
  return ranked.find((r: { id: string }) => r.id === entry.id);
}

// --- D17.03 item 54 — Bed holds -----------------------------------------

export function createBedHold(data: Record<string, unknown>) {
  return db('bed_holds').insert(data).returning('*').then((rows) => rows[0]);
}

export function findActiveBedHold(bedId: string) {
  return db('bed_holds').where({ bed_id: bedId }).whereNull('released_at').first();
}

export function findBedHold(id: string) {
  return db('bed_holds').where({ id }).first();
}

export function releaseBedHold(id: string) {
  return db('bed_holds')
    .where({ id })
    .update({ released_at: db.fn.now(), updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listActiveBedHolds() {
  return db('bed_holds').whereNull('released_at').orderBy('created_at', 'desc');
}

// --- D17.03 item 55 — Allocation offers ----------------------------------

export function createAllocationOffer(data: Record<string, unknown>) {
  return db('allocation_offers').insert(data).returning('*').then((rows) => rows[0]);
}

export function findOfferById(id: string) {
  return db('allocation_offers').where({ id }).first();
}

export function listOffers(filters: { status?: string; studentId?: string }) {
  const query = db('allocation_offers').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

export function updateOffer(id: string, data: Record<string, unknown>) {
  return db('allocation_offers')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** Pending offers whose deadline has passed — the sweep job's queue. */
export function listExpiredPendingOffers() {
  return db('allocation_offers').where({ status: 'pending' }).andWhere('accept_deadline', '<', db.fn.now());
}

// --- D17.03 item 56 — No-bed reason classifier ---------------------------

/** All the physical beds a hostel has, regardless of current status — the
 * baseline the classifier compares against. */
export function countPhysicalBedsForHostel(hostelId: string): Promise<number> {
  return db('beds')
    .join('rooms', 'beds.room_id', 'rooms.id')
    .join('floors', 'rooms.floor_id', 'floors.id')
    .join('blocks', 'floors.block_id', 'blocks.id')
    .where('blocks.hostel_id', hostelId)
    .count<{ count: string }[]>('beds.id as count')
    .first()
    .then((r) => Number(r?.count ?? 0));
}

/** Beds compatible with a room-type preference (when one was given) —
 * status-agnostic, same reasoning as the count above. */
export function countCompatibleBedsForHostel(hostelId: string, roomType?: string): Promise<number> {
  const query = db('beds')
    .join('rooms', 'beds.room_id', 'rooms.id')
    .join('floors', 'rooms.floor_id', 'floors.id')
    .join('blocks', 'floors.block_id', 'blocks.id')
    .where('blocks.hostel_id', hostelId)
    .andWhere('rooms.status', 'active');
  if (roomType) query.andWhere('rooms.room_type', roomType);
  return query
    .count<{ count: string }[]>('beds.id as count')
    .first()
    .then((r) => Number(r?.count ?? 0));
}

/** Beds that are physically fine and compatible but currently unavailable
 * (occupied/allocated/held/blocked) — what's left once the two counts
 * above rule out "no such bed exists at all". */
export function countAvailableBedsForHostel(hostelId: string, roomType?: string): Promise<number> {
  const query = db('beds')
    .join('rooms', 'beds.room_id', 'rooms.id')
    .join('floors', 'rooms.floor_id', 'floors.id')
    .join('blocks', 'floors.block_id', 'blocks.id')
    .where('blocks.hostel_id', hostelId)
    .andWhere('rooms.status', 'active')
    .andWhere('beds.status', 'available');
  if (roomType) query.andWhere('rooms.room_type', roomType);
  return query
    .count<{ count: string }[]>('beds.id as count')
    .first()
    .then((r) => Number(r?.count ?? 0));
}
