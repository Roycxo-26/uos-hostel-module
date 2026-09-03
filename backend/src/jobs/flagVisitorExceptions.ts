import { registry } from '../registry';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * D17.06 (TODO.md Batch 28) — the two time-driven exceptions §14.5's state
 * machine names: OVERSTAY (a visitor still inside past their credential's
 * valid-until) and EXPIRED (a pass issued but never used before it lapsed).
 * Same shape as jobs/flagOverdueMovements.ts — an explicit trx via
 * registry.appDb, not the request-scoped `db` proxy, since a background job
 * has no live HTTP request to bind RLS context to.
 */
export async function flagVisitorOverstaysForOrg(orgId: string): Promise<{ flagged: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const overdue = await trx('visitor_requests')
      .where('status', 'entered')
      .whereNotNull('credential_valid_until')
      .whereRaw('credential_valid_until <= now()')
      .select('id', 'host_user_id', 'campus_id', 'visitor_name');

    if (overdue.length === 0) return { flagged: 0 };

    await trx('visitor_requests')
      .whereIn(
        'id',
        overdue.map((r) => r.id)
      )
      .update({ status: 'overstay', updated_at: trx.fn.now() });

    for (const row of overdue) {
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'visitor.overstay',
        title: `${row.visitor_name} has not exited by their credential's valid-until time`,
        link: '/visitors',
      });
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.host_user_id,
        type: 'visitor.overstay',
        title: `Your visitor ${row.visitor_name} has overstayed their approved window`,
        link: '/visitors',
      });
    }

    return { flagged: overdue.length };
  });
}

export async function flagVisitorOverstaysAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { flagged } = await flagVisitorOverstaysForOrg(orgId);
      if (flagged > 0) console.log(`[hostel] visitor-overstay sweep: org ${orgId} flagged ${flagged} visitor request(s)`);
    } catch (err) {
      console.error(`[hostel] visitor-overstay sweep failed for org ${orgId}:`, err);
    }
  }
}

/** A pass issued but never used before its own valid-until lapsed — the
 * visitor equivalent of Batch 14's no-show sweep. */
export async function expireVisitorPassesForOrg(orgId: string): Promise<{ expired: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const lapsed = await trx('visitor_requests')
      .where('status', 'pass_issued')
      .whereNotNull('credential_valid_until')
      .whereRaw('credential_valid_until <= now()')
      .select('id', 'host_user_id', 'campus_id', 'visitor_name');

    if (lapsed.length === 0) return { expired: 0 };

    await trx('visitor_requests')
      .whereIn(
        'id',
        lapsed.map((r) => r.id)
      )
      .update({ status: 'expired', updated_at: trx.fn.now() });

    for (const row of lapsed) {
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.host_user_id,
        type: 'visitor.expired',
        title: `Your visitor pass for ${row.visitor_name} expired before they arrived`,
        link: '/visitors',
      });
    }

    return { expired: lapsed.length };
  });
}

export async function expireVisitorPassesAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { expired } = await expireVisitorPassesForOrg(orgId);
      if (expired > 0) console.log(`[hostel] visitor-pass-expiry sweep: org ${orgId} expired ${expired} visitor request(s)`);
    } catch (err) {
      console.error(`[hostel] visitor-pass-expiry sweep failed for org ${orgId}:`, err);
    }
  }
}
