import { registry } from '../registry';

/**
 * D17.14 (TODO.md Batch 30, item 121). Two independent, idempotent sweeps
 * over `feedback_campaigns`:
 *
 *  - auto-close: an 'open' campaign whose close_at has passed moves to
 *    'closed'. Matches every other "deadline passed -> status flip"
 *    sweep this session runs (see e.g. flagLaundrySlaBreaches.ts).
 *
 *  - reminder: an 'open' campaign past the halfway point of its own
 *    window gets reminder_sent flipped once (REMINDER_ACTIVE folded into
 *    'open' — see the migration's own comment). Deliberately NOT a
 *    per-resident nudge: for anonymous/aggregated_only campaigns, telling
 *    only the residents who *haven't* responded yet would itself leak who
 *    *has* — the same privacy reasoning the migration and service.ts
 *    already apply elsewhere. Staff still see reminder_sent on the
 *    campaign itself if they want to chase response counts manually.
 */
export async function flagFeedbackCampaignsForOrg(orgId: string): Promise<{ closed: number; reminded: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const toClose = await trx('feedback_campaigns').where('status', 'open').whereRaw('close_at <= now()').select('id');
    if (toClose.length > 0) {
      await trx('feedback_campaigns')
        .whereIn(
          'id',
          toClose.map((r) => r.id)
        )
        .update({ status: 'closed', updated_at: trx.fn.now() });
    }

    const toRemind = await trx('feedback_campaigns')
      .where('status', 'open')
      .andWhere('reminder_sent', false)
      .whereRaw("open_at + (close_at - open_at) / 2 <= now()")
      .select('id');
    if (toRemind.length > 0) {
      await trx('feedback_campaigns')
        .whereIn(
          'id',
          toRemind.map((r) => r.id)
        )
        .update({ reminder_sent: true, updated_at: trx.fn.now() });
    }

    return { closed: toClose.length, reminded: toRemind.length };
  });
}

export async function flagFeedbackCampaignsAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { closed, reminded } = await flagFeedbackCampaignsForOrg(orgId);
      if (closed > 0 || reminded > 0) console.log(`[hostel] feedback-campaign sweep: org ${orgId} closed ${closed}, reminded ${reminded}`);
    } catch (err) {
      console.error(`[hostel] feedback-campaign sweep failed for org ${orgId}:`, err);
    }
  }
}
