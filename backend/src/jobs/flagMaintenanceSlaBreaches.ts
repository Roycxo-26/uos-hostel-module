import { registry } from '../registry';
import { withDefaults } from '../app/settings/types';
import { notifyCampusStaff } from '../utils/notify';

/**
 * D17.08 (TODO.md Batch 29) §16.3/§16.4 — "Verification SLA breached? ->
 * Escalate to Warden / Head Warden." Same shape as
 * jobs/flagOverdueMovements.ts: an explicit trx via registry.appDb, not the
 * request-scoped `db` proxy. `sla_escalated_at` makes this idempotent — a
 * ticket is only ever escalated once, same as every other one-time-flag
 * sweep this codebase already runs.
 */
export async function flagMaintenanceSlaBreachesForOrg(orgId: string): Promise<{ escalated: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const settingsRow = await trx('tenant_settings').first();
    const { maintenanceVerificationSlaHours: slaHours } = withDefaults(orgId, settingsRow).policyDefaults;

    const breached = await trx('maintenance_tickets')
      .where('status', 'pending_verification')
      .whereNull('sla_escalated_at')
      .whereRaw(`created_at <= now() - interval '${slaHours} hours'`)
      .select('id', 'campus_id', 'category', 'raised_by');

    if (breached.length === 0) return { escalated: 0 };

    await trx('maintenance_tickets')
      .whereIn(
        'id',
        breached.map((r) => r.id)
      )
      .update({ sla_escalated_at: trx.fn.now(), updated_at: trx.fn.now() });

    for (const row of breached) {
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'maintenance_ticket.sla_breached',
        title: `Floor Warden verification SLA breached for a ${row.category.replace(/_/g, ' ')} ticket — escalated`,
        link: '/maintenance',
      });
    }

    return { escalated: breached.length };
  });
}

export async function flagMaintenanceSlaBreachesAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { escalated } = await flagMaintenanceSlaBreachesForOrg(orgId);
      if (escalated > 0) console.log(`[hostel] maintenance-SLA-breach sweep: org ${orgId} escalated ${escalated} ticket(s)`);
    } catch (err) {
      console.error(`[hostel] maintenance-SLA-breach sweep failed for org ${orgId}:`, err);
    }
  }
}
