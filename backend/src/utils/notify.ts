import type { Knex } from 'knex';
import { db } from '../db';

interface NotifyEntry {
  orgId: string;
  campusId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * UOS HOSTEL BR.md §13/§14 — in-app notification tray, no live delivery
 * channel (see the migration's own comment). Same "atomic with the request
 * it's part of" reasoning as utils/audit.ts: `db` resolves to the current
 * request's RLS-scoped transaction, so this insert commits or rolls back
 * with whatever business change triggered it.
 */
export async function notify(entry: NotifyEntry): Promise<void> {
  await db('notifications').insert({
    org_id: entry.orgId,
    campus_id: entry.campusId,
    user_id: entry.userId,
    type: entry.type,
    title: entry.title,
    body: entry.body ?? null,
    link: entry.link ?? null,
  });
}

/** Same as notify(), but for callers that already hold an explicit
 * transaction instead of going through the request-scoped `db` proxy — the
 * two background jobs (jobs/expireNoShowAllocations.ts,
 * jobs/flagOverdueMovements.ts) run outside any HTTP request and open
 * their own transaction via registry.appDb(orgId).transaction(...). */
export async function notifyWithTrx(trx: Knex, entry: NotifyEntry): Promise<void> {
  await trx('notifications').insert({
    org_id: entry.orgId,
    campus_id: entry.campusId,
    user_id: entry.userId,
    type: entry.type,
    title: entry.title,
    body: entry.body ?? null,
    link: entry.link ?? null,
  });
}

/** Notify every active Warden/Head Warden at a campus — for
 * system-triggered exceptions (no-show, overdue movement) where there's no
 * single named recipient, matching flow.md §12's escalation chains
 * ("Warden -> Head Warden", not one fixed person). Takes either the
 * request-scoped `db` proxy (src/db.ts) or a job's own explicit
 * transaction — both implement the same Knex call interface, so despite
 * the parameter being typed/named for the transaction case, callers
 * inside a live request pass `db` here just as correctly. */
export async function notifyCampusStaff(
  trx: Knex,
  orgId: string,
  campusId: string,
  entry: Omit<NotifyEntry, 'orgId' | 'campusId' | 'userId'>
): Promise<void> {
  const staff: Array<{ user_id: string }> = await trx('user_roles')
    .where({ campus_id: campusId, is_active: true })
    .whereIn('role', ['warden', 'head_warden'])
    .select('user_id');
  for (const row of staff) {
    await notifyWithTrx(trx, { ...entry, orgId, campusId, userId: row.user_id });
  }
}

/**
 * HOSTEL-GAP-ANALYSIS.md D17.22 item 85 — notify() only ever targeted one
 * named user; notifyCampusStaff() only ever targeted a role. Neither
 * could reach "every resident on this floor" or "everyone affected by
 * this outage" — the population-targeted gap the gap ledger names
 * directly. Same room/floor/hostel occupant join this session's other
 * new modules (commonAreas, occupancyVerification, safety) each already
 * duplicate locally for their own purposes; this is the shared version
 * for the one purpose that's actually cross-cutting — notification —
 * so every future caller has one real place to reach for it instead of
 * hand-rolling the join a fifth time.
 */
export async function notifyOccupantsInScope(
  trx: Knex,
  orgId: string,
  campusId: string,
  scopeType: 'room' | 'floor' | 'hostel',
  scopeId: string,
  entry: Omit<NotifyEntry, 'orgId' | 'campusId' | 'userId'>
): Promise<number> {
  const base = trx('allocations').join('beds', 'beds.id', 'allocations.bed_id').where('allocations.status', 'checked_in_active');
  let query = base;
  if (scopeType === 'room') {
    query = base.andWhere('beds.room_id', scopeId);
  } else if (scopeType === 'floor') {
    query = base.join('rooms', 'rooms.id', 'beds.room_id').andWhere('rooms.floor_id', scopeId);
  } else {
    query = base
      .join('rooms', 'rooms.id', 'beds.room_id')
      .join('floors', 'floors.id', 'rooms.floor_id')
      .join('blocks', 'blocks.id', 'floors.block_id')
      .andWhere('blocks.hostel_id', scopeId);
  }
  const occupants: Array<{ student_id: string }> = await query.select('allocations.student_id');
  for (const occupant of occupants) {
    await notifyWithTrx(trx, { ...entry, orgId, campusId, userId: occupant.student_id });
  }
  return occupants.length;
}
