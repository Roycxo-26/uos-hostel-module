import { registry } from '../registry';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * UOS HOSTEL BR.md §11 rule 11: "Automatic expiry/escalation processing
 * must use the institutional timezone, avoid duplicate action and support
 * controlled recovery after failure." Previously the no-show queue
 * (allocations/repository.ts's listNoShowCandidates) only ever COMPUTED
 * "overdue" live at query time — nothing ever moved the stored `status`
 * column off `awaiting_check_in`, even though `no_show_review` has been a
 * valid value in the CHECK constraint since the very first migration. This
 * job is what actually uses it, closing a real gap between the documented
 * state machine (flow.md §6.2B) and what the code did.
 *
 * Timezone note: check_in_deadline is stored as an absolute timestamptz set
 * at allocation time (now + N hours — see allocations/service.ts), so a
 * plain `<= now()` comparison is correct in any timezone without
 * conversion; "institutional timezone" matters for wall-clock cutoffs
 * (e.g. a future Headcount session's daily window), not a relative
 * countdown deadline like this one. Noted here so the absence of a
 * timezone conversion isn't mistaken for an oversight.
 *
 * This runs outside any HTTP request, so there's no scopedRequest to bind
 * the RLS session variables — this calls the exact same set_config() calls
 * scopedRequest itself uses (confirmed against @uos/auth's own source
 * rather than guessed), inside the same transaction as the query, so RLS
 * still applies. campus_scope is forced to 'ALL': this job must see every
 * campus in the org, not one request's single campus.
 */
export async function expireNoShowAllocationsForOrg(orgId: string): Promise<{ expired: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    // D17.03 item 58 gap-closure — 'no_show_warning' (jobs/expireAllocationOffers.ts's
    // sendNoShowWarningsForOrg) is a warned-but-not-yet-overdue allocation
    // that started life as 'awaiting_check_in'; it must still reach
    // no_show_review once its deadline actually passes, not get stranded
    // in the warned state forever just because it changed status once.
    const due = await trx('allocations')
      .whereIn('status', ['awaiting_check_in', 'no_show_warning'])
      .whereNotNull('check_in_deadline')
      .where('check_in_deadline', '<=', trx.fn.now())
      .select('id', 'student_id', 'campus_id');

    if (due.length === 0) return { expired: 0 };

    // Idempotent by construction, not by a separate "already processed"
    // flag: once a row's status moves off 'awaiting_check_in' it no longer
    // matches the WHERE clause above, so re-running this job after a crash
    // mid-loop only picks up what's still actually due — the "controlled
    // recovery after failure" the BR rule asks for, without extra state.
    await trx('allocations')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ status: 'no_show_review', updated_at: trx.fn.now() });

    // BR §14 "Missing/late resident | Warden/Head Warden; Security if
    // policy | Critical multi-channel | Immediate" — the closest existing
    // trigger to "an unattended exception just appeared," so the same
    // notify-the-campus-staff pattern applies here.
    for (const row of due) {
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'allocation.no_show',
        title: 'Your bed reservation deadline passed',
        link: '/applications',
      });
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'allocation.no_show',
        title: 'A reservation deadline passed — no-show review needed',
        link: '/allocations',
      });
    }

    return { expired: due.length };
  });
}

/** Sweeps every known tenant. One tenant's failure must never block the
 * others in the same run (BR §11 rule 11, same "controlled recovery" rule
 * applied at the multi-tenant level). */
export async function expireNoShowAllocationsAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { expired } = await expireNoShowAllocationsForOrg(orgId);
      if (expired > 0) {
        console.log(`[hostel] no-show expiry: org ${orgId} moved ${expired} allocation(s) to no_show_review`);
      }
    } catch (err) {
      console.error(`[hostel] no-show expiry failed for org ${orgId}:`, err);
    }
  }
}
