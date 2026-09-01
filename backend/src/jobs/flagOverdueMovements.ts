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

    // D17.10 item 93 — an approved extension moves `effective_return`
    // forward; COALESCE so this sweep (and the return-reminder/staged-
    // escalation sweeps below) always key off whichever deadline is
    // actually current, not the original request's own value.
    const due = await trx('movement_requests')
      .where('status', 'out')
      .whereRaw('COALESCE(effective_return, requested_return) <= now()')
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
      .whereRaw('COALESCE(effective_return, requested_return) > now()')
      .whereRaw(`COALESCE(effective_return, requested_return) <= now() + (? * interval '1 minute')`, [movementReturnReminderMinutes])
      .select('id', 'student_id', 'campus_id', 'requested_return', 'effective_return');

    if (due.length === 0) return { reminded: 0 };

    await trx('movement_requests')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ return_reminder_sent_at: trx.fn.now() });

    for (const row of due) {
      const dueBy = new Date(row.effective_return ?? row.requested_return).toLocaleString();
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

/**
 * D17.10 item 92 — the staged overdue-escalation ladder the manager's own
 * policy reply specified, replacing the single flat "notify everyone"
 * step above with three time-staged tiers. All three share one shape
 * (idempotent flag column, `effective_return` as the real deadline so an
 * approved extension correctly pushes these back — see movements/
 * service.ts's decideExtension) — one parameterised sweep rather than
 * three near-identical functions.
 *
 * The 12h tier's "restricted Welfare/Safeguarding triage case" is written
 * directly via `trx('cases')`, not through cases/service.ts or even cases/
 * repository.ts — those go through the request-scoped `db` proxy (getTrx()
 * via AsyncLocalStorage), which only resolves inside a live HTTP request;
 * a background job has no such context, the same reason every other job in
 * this codebase already writes its own tables directly (see this file's
 * own header comment, and jobs/restoreTemporaryRelocations.ts). A real,
 * dedicated Safeguarding case type is Batch 24 (D17.09 depth)'s job, which
 * doesn't exist yet — an `incident`, confidential, critical-severity case
 * is the closest honest equivalent available today, not a placeholder.
 */
async function escalateOverdueTier(
  orgId: string,
  tier: '30m' | '3h' | '12h',
  thresholdMinutes: number
): Promise<{ escalated: number }> {
  const db = registry.appDb(orgId);
  const column = tier === '30m' ? 'escalated_30m_at' : tier === '3h' ? 'escalated_3h_at' : 'escalated_12h_at';

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const due = await trx('movement_requests')
      .whereIn('status', ['out', 'overdue'])
      .whereNull(column)
      .whereRaw(`COALESCE(effective_return, requested_return) <= now() - (? * interval '1 minute')`, [thresholdMinutes])
      .select('id', 'student_id', 'campus_id', 'org_id');

    if (due.length === 0) return { escalated: 0 };

    await trx('movement_requests')
      .whereIn(
        'id',
        due.map((r) => r.id)
      )
      .update({ [column]: trx.fn.now(), updated_at: trx.fn.now() });

    for (const row of due) {
      if (tier === '30m') {
        await notifyWithTrx(trx, {
          orgId,
          campusId: row.campus_id,
          userId: row.student_id,
          type: 'movement.overdue_30m',
          title: 'You are 30+ minutes overdue from your approved return time — return immediately or contact your Warden',
          link: '/movement',
        });
        await notifyCampusStaff(trx, orgId, row.campus_id, {
          type: 'movement.overdue_30m',
          title: 'A resident is 30+ minutes overdue — guardian follow-up recommended',
          link: '/movement',
        });
      } else if (tier === '3h') {
        await notifyCampusStaff(trx, orgId, row.campus_id, {
          type: 'movement.overdue_3h',
          title: 'ESCALATION — a resident is 3+ hours overdue. Warden, Head Warden and Security should coordinate now',
          link: '/movement',
        });
      } else {
        // D17.09 items 95/98 (TODO.md Batch 24) — a real 'safeguarding_concern'
        // case now that the type exists (was 'incident' when this sweep was
        // first built in Batch 23, ahead of Batch 24). Pre-seeded with both
        // missing-resident checklist items unchecked (roommate check,
        // medical-reference check — item 98's own named steps), so whoever
        // picks this case up sees the checklist waiting rather than an empty
        // jsonb column.
        //
        // Deliberately NOT notifyCampusStaff here — that would broadcast a
        // restricted-tier case to every Warden, exactly what D17.09's access
        // model exists to prevent. Standing safeguarding role holders only,
        // queried directly (this job has no access to the request-scoped
        // `db` proxy cases/service.ts's own notifyWelfareCaseTeam depends
        // on — same reasoning every other job-side direct-trx write in this
        // file already documents). No case_access_grants exist yet for a
        // case this fresh, so there's nobody else to reach at creation time.
        const standingHolders = await trx('responsibility_assignments')
          .where({ status: 'active' })
          .whereIn('privilege_type', ['safeguarding_lead', 'safeguarding_deputy', 'welfare_officer', 'counsellor'])
          .andWhere('effective_from', '<=', trx.fn.now())
          .andWhere((qb) => qb.whereNull('effective_to').orWhere('effective_to', '>=', trx.fn.now()))
          .distinct('assignee_user_id');
        for (const holder of standingHolders) {
          await notifyWithTrx(trx, {
            orgId,
            campusId: row.campus_id,
            userId: holder.assignee_user_id,
            type: 'movement.overdue_12h',
            title: 'CRITICAL — a resident is 12+ hours overdue and unreachable. A restricted safeguarding case needs your attention',
            link: '/cases',
          });
        }
        await trx('cases').insert({
          org_id: row.org_id,
          campus_id: row.campus_id,
          reporter_user_id: row.student_id,
          subject_user_id: row.student_id,
          case_type: 'safeguarding_concern',
          category: 'missing_resident_escalation',
          description: `Automatically opened: resident has been overdue from an approved movement for 12+ hours with no contact. Movement request ${row.id}.`,
          severity: 'critical',
          confidential: true,
          missing_resident_checklist: JSON.stringify({
            roommate_check: { completed: false },
            medical_reference_check: { completed: false },
          }),
        });
      }
    }

    return { escalated: due.length };
  });
}

export async function escalateOverdue30mAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { escalated } = await escalateOverdueTier(orgId, '30m', 30);
      if (escalated > 0) console.log(`[hostel] 30m overdue-escalation sweep: org ${orgId} escalated ${escalated} movement request(s)`);
    } catch (err) {
      console.error(`[hostel] 30m overdue-escalation sweep failed for org ${orgId}:`, err);
    }
  }
}

export async function escalateOverdue3hAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { escalated } = await escalateOverdueTier(orgId, '3h', 180);
      if (escalated > 0) console.log(`[hostel] 3h overdue-escalation sweep: org ${orgId} escalated ${escalated} movement request(s)`);
    } catch (err) {
      console.error(`[hostel] 3h overdue-escalation sweep failed for org ${orgId}:`, err);
    }
  }
}

export async function escalateOverdue12hAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { escalated } = await escalateOverdueTier(orgId, '12h', 720);
      if (escalated > 0) console.log(`[hostel] 12h overdue-escalation sweep: org ${orgId} escalated ${escalated} movement request(s)`);
    } catch (err) {
      console.error(`[hostel] 12h overdue-escalation sweep failed for org ${orgId}:`, err);
    }
  }
}
