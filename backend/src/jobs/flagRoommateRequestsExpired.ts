import { registry } from '../registry';
import { notifyWithTrx } from '../utils/notify';

/**
 * D17.26 (TODO.md Batch 30, item 126) §24J.3: "No -> Request expires/
 * declines; no adverse effect." Same shape as every other sweep this
 * session runs — an explicit trx via registry.appDb, idempotent because
 * it only ever touches rows still 'pending'.
 */
export async function flagRoommateRequestsExpiredForOrg(orgId: string): Promise<{ expired: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const overdue = await trx('roommate_requests')
      .where('status', 'pending')
      .whereRaw('expires_at <= now()')
      .select('id', 'campus_id', 'requesting_student_id');

    if (overdue.length === 0) return { expired: 0 };

    await trx('roommate_requests')
      .whereIn(
        'id',
        overdue.map((r) => r.id)
      )
      .update({ status: 'expired', updated_at: trx.fn.now() });

    for (const row of overdue) {
      // §24J.3: "no adverse effect" — a quiet, factual notice, not an
      // escalation to staff the way an overdue movement or ticket is.
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.requesting_student_id,
        type: 'roommate_request.expired',
        title: 'Your roommate request expired without a response',
        link: '/roommate',
      });
    }

    return { expired: overdue.length };
  });
}

export async function flagRoommateRequestsExpiredAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { expired } = await flagRoommateRequestsExpiredForOrg(orgId);
      if (expired > 0) console.log(`[hostel] roommate-request-expiry sweep: org ${orgId} expired ${expired} request(s)`);
    } catch (err) {
      console.error(`[hostel] roommate-request-expiry sweep failed for org ${orgId}:`, err);
    }
  }
}
