import { registry } from '../registry';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * D17.13 (TODO.md Batch 30) §21.2 "periodic occupancy confirmation." Same
 * shape as every other sweep this codebase runs: an explicit trx via
 * registry.appDb, not the request-scoped `db` proxy. Idempotent by
 * construction — once flagged `periodic_confirmation_due`, a placement
 * only leaves that status through confirmOccupancy/requestExit
 * (offCampus/service.ts), so this sweep never re-flags the same row twice
 * on its own.
 */
export async function flagOffCampusConfirmationDueForOrg(orgId: string): Promise<{ flagged: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const due = await trx('off_campus_placements')
      .where('status', 'active')
      .whereNotNull('next_occupancy_confirmation_due')
      .whereRaw('next_occupancy_confirmation_due <= current_date')
      .select('id', 'campus_id', 'student_id');

    if (due.length === 0) return { flagged: 0 };

    await trx('off_campus_placements')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ status: 'periodic_confirmation_due', updated_at: trx.fn.now() });

    for (const row of due) {
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'off_campus_placement.confirmation_due',
        title: 'Please confirm you are still living at your off-campus placement',
        link: '/off-campus',
      });
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'off_campus_placement.confirmation_due',
        title: 'An off-campus placement is overdue for its periodic occupancy confirmation',
        link: '/off-campus',
      });
    }

    return { flagged: due.length };
  });
}

export async function flagOffCampusConfirmationDueAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { flagged } = await flagOffCampusConfirmationDueForOrg(orgId);
      if (flagged > 0) console.log(`[hostel] off-campus-confirmation sweep: org ${orgId} flagged ${flagged} placement(s)`);
    } catch (err) {
      console.error(`[hostel] off-campus-confirmation sweep failed for org ${orgId}:`, err);
    }
  }
}
