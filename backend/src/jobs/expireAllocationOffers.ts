import { withDefaults } from '../app/settings/types';
import { registry } from '../registry';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * HOSTEL-GAP-ANALYSIS.md D17.03 item 55 (TODO.md Batch 14) — "no
 * acceptance deadline, no decline/expiry-releases-the-hold loop." This is
 * that loop's automatic half: a pending allocation offer whose deadline
 * passed without the resident accepting or declining. Same idempotent-by-
 * construction, per-tenant-isolated-failure, RLS-bound-transaction pattern
 * as every other sweep job in this codebase (see expireNoShowAllocations.ts
 * for the fullest explanation of why).
 */
export async function expireAllocationOffersForOrg(orgId: string): Promise<{ expired: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const due = await trx('allocation_offers')
      .where('status', 'pending')
      .where('accept_deadline', '<', trx.fn.now())
      .select('id', 'student_id', 'campus_id', 'bed_id', 'bed_hold_id', 'application_id');

    if (due.length === 0) return { expired: 0 };

    for (const row of due) {
      await trx('allocation_offers').where({ id: row.id }).update({ status: 'expired', decided_at: trx.fn.now(), updated_at: trx.fn.now() });
      if (row.bed_hold_id) {
        await trx('bed_holds').where({ id: row.bed_hold_id }).update({ released_at: trx.fn.now(), updated_at: trx.fn.now() });
      }
      await trx('beds').where({ id: row.bed_id }).update({ status: 'available', updated_at: trx.fn.now() });
      // Same reasoning as declineOffer/withdrawOffer in service.ts — expiry
      // doesn't drop the applicant off the waitlist, it just means this
      // particular bed offer is gone.
      await trx('waitlist_entries')
        .where({ application_id: row.application_id, status: 'offered' })
        .update({ status: 'active', updated_at: trx.fn.now() });

      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'allocation_offer.expired',
        title: 'Your bed offer expired without a response',
        link: '/applications',
      });
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'allocation_offer.expired',
        title: 'A bed offer expired unanswered — the bed is available again',
        link: '/allocations',
      });
    }

    return { expired: due.length };
  });
}

export async function expireAllocationOffersAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { expired } = await expireAllocationOffersForOrg(orgId);
      if (expired > 0) {
        console.log(`[hostel] offer expiry: org ${orgId} expired ${expired} allocation offer(s)`);
      }
    } catch (err) {
      console.error(`[hostel] offer expiry failed for org ${orgId}:`, err);
    }
  }
}

/**
 * D17.03 item 58's 'no_show_warning' state — the earlier, softer sibling
 * of expireNoShowAllocations.ts's sweep, same relationship
 * sendMovementReturnRemindersForOrg has to flagOverdueMovementsForOrg: a
 * one-time nudge before the deadline, not just a flag after it's passed.
 */
export async function sendNoShowWarningsForOrg(orgId: string): Promise<{ warned: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const settingsRow = await trx('tenant_settings').first();
    const { noShowWarningHoursBeforeDeadline } = withDefaults(orgId, settingsRow).policyDefaults;

    const due = await trx('allocations')
      .where('status', 'awaiting_check_in')
      .whereNull('no_show_warned_at')
      .where('check_in_deadline', '>', trx.fn.now())
      .whereRaw(`check_in_deadline <= now() + (? * interval '1 hour')`, [noShowWarningHoursBeforeDeadline])
      .select('id', 'student_id', 'campus_id', 'check_in_deadline');

    if (due.length === 0) return { warned: 0 };

    await trx('allocations')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ status: 'no_show_warning', no_show_warned_at: trx.fn.now(), updated_at: trx.fn.now() });

    for (const row of due) {
      const dueBy = new Date(row.check_in_deadline).toLocaleString();
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'allocation.no_show_warning',
        title: `Your check-in deadline is coming up (${dueBy})`,
        link: '/applications',
      });
    }

    return { warned: due.length };
  });
}

export async function sendNoShowWarningsAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { warned } = await sendNoShowWarningsForOrg(orgId);
      if (warned > 0) {
        console.log(`[hostel] no-show warning: org ${orgId} warned ${warned} allocation(s)`);
      }
    } catch (err) {
      console.error(`[hostel] no-show warning failed for org ${orgId}:`, err);
    }
  }
}
