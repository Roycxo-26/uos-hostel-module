import { registry } from '../registry';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * D17.23 (TODO.md Batch 30, item 124) §24G.4/24G.5 — "Laundry service
 * outage creates resident communication and alternative arrangement."
 * SLA_BREACH is a timestamp flag here, not a status (see the migration's
 * own comment on why), so this sweep sets it once and moves on — same
 * idempotent-flag shape as jobs/flagMaintenanceSlaBreaches.ts.
 */
export async function flagLaundrySlaBreachesForOrg(orgId: string): Promise<{ flagged: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const breached = await trx('laundry_orders')
      .whereIn('status', ['accepted', 'picked_up', 'in_process'])
      .whereNull('sla_breached_at')
      .whereNotNull('requested_pickup_at')
      .whereRaw("requested_pickup_at + (sla_hours || ' hours')::interval <= now()")
      .select('id', 'campus_id', 'student_id');

    if (breached.length === 0) return { flagged: 0 };

    await trx('laundry_orders')
      .whereIn(
        'id',
        breached.map((r) => r.id)
      )
      .update({ sla_breached_at: trx.fn.now(), updated_at: trx.fn.now() });

    for (const row of breached) {
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'laundry_order.sla_breached',
        title: 'A laundry order has missed its service SLA',
        link: '/laundry',
      });
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'laundry_order.sla_breached',
        title: 'Your laundry order is taking longer than expected — staff have been notified',
        link: '/laundry',
      });
    }

    return { flagged: breached.length };
  });
}

export async function flagLaundrySlaBreachesAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { flagged } = await flagLaundrySlaBreachesForOrg(orgId);
      if (flagged > 0) console.log(`[hostel] laundry-SLA-breach sweep: org ${orgId} flagged ${flagged} order(s)`);
    } catch (err) {
      console.error(`[hostel] laundry-SLA-breach sweep failed for org ${orgId}:`, err);
    }
  }
}
