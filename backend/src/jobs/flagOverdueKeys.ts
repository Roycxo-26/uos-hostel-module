import { registry } from '../registry';
import { notifyCampusStaff } from '../utils/notify';

/**
 * HOSTEL-GAP-ANALYSIS.md D17.20 item 72 (TODO.md Batch 18) — "overdue/lost
 * escalation" for a master key. Same idempotent-by-construction,
 * tenant-isolated sweep pattern as every other overdue job in this
 * codebase (see expireNoShowAllocations.ts for the fullest explanation).
 */
export async function flagOverdueKeysForOrg(orgId: string): Promise<{ flagged: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const due = await trx('master_key_log')
      .where('status', 'issued')
      .where('expected_return_at', '<=', trx.fn.now())
      .select('id', 'campus_id', 'key_identifier', 'issued_to');

    if (due.length === 0) return { flagged: 0 };

    await trx('master_key_log')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ status: 'overdue', updated_at: trx.fn.now() });

    for (const row of due) {
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'master_key.overdue',
        title: `Master key '${row.key_identifier}' is overdue for return`,
        link: '/structure',
      });
    }

    return { flagged: due.length };
  });
}

export async function flagOverdueKeysAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { flagged } = await flagOverdueKeysForOrg(orgId);
      if (flagged > 0) {
        console.log(`[hostel] overdue-key sweep: org ${orgId} flagged ${flagged} key(s)`);
      }
    } catch (err) {
      console.error(`[hostel] overdue-key sweep failed for org ${orgId}:`, err);
    }
  }
}
