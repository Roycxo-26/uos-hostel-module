import { registry } from '../registry';
import { withDefaults } from '../app/settings/types';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * UOS HOSTEL BR.md §8 / §11 rule 11 — "Mark overdue, escalate by severity/
 * time" for a resident who hasn't returned by their approved window.
 * Identical shape to jobs/expireNoShowAllocations.ts (same RLS-binding
 * technique, same idempotent-by-construction recovery property) —
 * deliberately not abstracted into one shared "sweep X where deadline
 * passed" helper yet: two call sites isn't enough to justify the
 * indirection, and the two jobs' target tables/columns differ enough
 * (allocations.check_in_deadline vs movement_requests.requested_return)
 * that a premature abstraction would likely need to be undone anyway once
 * a third sweep (if any) reveals what's actually common between them.
 */
export async function flagOverdueMovementsForOrg(orgId: string): Promise<{ flagged: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const due = await trx('movement_requests')
      .where('status', 'out')
      .where('requested_return', '<=', trx.fn.now())
      .select('id', 'student_id', 'campus_id');

    if (due.length === 0) return { flagged: 0 };

    await trx('movement_requests')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ status: 'overdue', updated_at: trx.fn.now() });

    // BR §14: "Missing/late resident | Warden/Head Warden; Security if
    // policy | Critical multi-channel | Immediate" — the highest-urgency
    // trigger in this codebase's notification set (a resident overdue from
    // approved leave is a genuine safety-adjacent exception), so both the
    // resident and every campus Warden/Head Warden are notified, not just
    // one side.
    for (const row of due) {
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'movement.overdue',
        title: 'You have not returned by your approved time',
        link: '/movement',
      });
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'movement.overdue',
        title: 'A resident has not returned by their approved time',
        link: '/movement',
      });
    }

    return { flagged: due.length };
  });
}

/**
 * Real gap, found live via SELF-TEST-GUIDE.md C7 — the sweep above only
 * ever notifies once a movement is ALREADY overdue. This is the earlier,
 * softer half: once per request, at most `movementReturnReminderMinutes`
 * (tenant-configurable, settings/types.ts) before `requested_return`, nudge
 * both the resident and campus staff that a return is coming up — while
 * it's still on time, not after. Idempotent via return_reminder_sent_at,
 * same one-time-flag shape as transfer_requests.restoration_blocked_at.
 */
export async function sendMovementReturnRemindersForOrg(orgId: string): Promise<{ reminded: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const settingsRow = await trx('tenant_settings').first();
    const { movementReturnReminderMinutes } = withDefaults(orgId, settingsRow).policyDefaults;

    const due = await trx('movement_requests')
      .where('status', 'out')
      .whereNull('return_reminder_sent_at')
      .where('requested_return', '>', trx.fn.now())
      .whereRaw(`requested_return <= now() + (? * interval '1 minute')`, [movementReturnReminderMinutes])
      .select('id', 'student_id', 'campus_id', 'requested_return');

    if (due.length === 0) return { reminded: 0 };

    await trx('movement_requests')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ return_reminder_sent_at: trx.fn.now() });

    for (const row of due) {
      const dueBy = new Date(row.requested_return).toLocaleString();
      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'movement.return_reminder',
        title: `Your approved return time is coming up (${dueBy})`,
        link: '/movement',
      });
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'movement.return_reminder',
        title: `A resident's approved return is due soon (${dueBy}) — check they've returned`,
        link: '/movement',
      });
    }

    return { reminded: due.length };
  });
}

export async function sendMovementReturnRemindersAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { reminded } = await sendMovementReturnRemindersForOrg(orgId);
      if (reminded > 0) {
        console.log(`[hostel] return-reminder sweep: org ${orgId} reminded ${reminded} movement request(s)`);
      }
    } catch (err) {
      console.error(`[hostel] return-reminder sweep failed for org ${orgId}:`, err);
    }
  }
}

export async function flagOverdueMovementsAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { flagged } = await flagOverdueMovementsForOrg(orgId);
      if (flagged > 0) {
        console.log(`[hostel] overdue-movement sweep: org ${orgId} flagged ${flagged} movement request(s) as overdue`);
      }
    } catch (err) {
      console.error(`[hostel] overdue-movement sweep failed for org ${orgId}:`, err);
    }
  }
}
