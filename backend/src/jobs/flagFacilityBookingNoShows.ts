import { registry } from '../registry';
import { notifyCampusStaff } from '../utils/notify';

/**
 * D17.24 (TODO.md Batch 30, item 125) §24H.5's NO_SHOW state — an
 * approved booking whose window has already ended without ever being
 * checked in. Same shape as every other sweep this session runs: an
 * explicit trx via registry.appDb, idempotent because it only ever
 * touches rows still in 'approved' status.
 */
export async function flagFacilityBookingNoShowsForOrg(orgId: string): Promise<{ flagged: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const overdue = await trx('facility_bookings')
      .where('status', 'approved')
      .whereRaw('end_at <= now()')
      .select('id', 'campus_id');

    if (overdue.length === 0) return { flagged: 0 };

    await trx('facility_bookings')
      .whereIn(
        'id',
        overdue.map((r) => r.id)
      )
      .update({ status: 'no_show', no_show_at: trx.fn.now(), updated_at: trx.fn.now() });

    for (const row of overdue) {
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'facility_booking.no_show',
        title: 'An approved facility booking passed its end time without check-in',
        link: '/residence-life',
      });
    }

    return { flagged: overdue.length };
  });
}

export async function flagFacilityBookingNoShowsAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { flagged } = await flagFacilityBookingNoShowsForOrg(orgId);
      if (flagged > 0) console.log(`[hostel] facility-booking-no-show sweep: org ${orgId} flagged ${flagged} booking(s)`);
    } catch (err) {
      console.error(`[hostel] facility-booking-no-show sweep failed for org ${orgId}:`, err);
    }
  }
}
