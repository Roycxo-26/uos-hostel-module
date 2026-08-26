import { registry } from '../registry';
import { notifyCampusStaff, notifyWithTrx } from '../utils/notify';

/**
 * UOS HOSTEL BR.md §7 "temporary destination + retrospective review
 * deadline" — closes the gap UAT.md flagged during Batch 10 drafting:
 * transfer_type='emergency' moved a resident to a new bed but never moved
 * them back. This job is the return half of that round trip: once a
 * completed, `is_temporary` transfer's `retrospective_review_deadline`
 * (doing double duty as the return-due date) passes, restore the resident
 * to their original bed automatically — or, if that bed is no longer free,
 * flag it once for staff instead of silently doing nothing.
 *
 * Same RLS-binding technique as jobs/expireNoShowAllocations.ts and
 * jobs/flagOverdueMovements.ts (this job also runs outside any HTTP
 * request, so there's no scopedRequest to bind app.current_org_id /
 * app.campus_scope — this calls the same set_config() pair directly,
 * inside the same transaction as the query, so RLS still applies).
 */
export async function restoreTemporaryRelocationsForOrg(orgId: string): Promise<{ restored: number; blocked: number }> {
  const db = registry.appDb(orgId);

  return db.transaction(async (trx) => {
    await trx.raw('SELECT set_config(?, ?, true)', ['app.current_org_id', orgId]);
    await trx.raw('SELECT set_config(?, ?, true)', ['app.campus_scope', 'ALL']);

    const due = await trx('transfer_requests')
      .where({ status: 'completed', is_temporary: true })
      .whereNull('restored_at')
      .whereNull('restoration_blocked_at')
      .whereNotNull('retrospective_review_deadline')
      .where('retrospective_review_deadline', '<=', trx.fn.now())
      .select('*');

    let restored = 0;
    let blocked = 0;

    for (const row of due) {
      // The resident may have moved on again since this transfer completed
      // (a later transfer, or a checkout) — only restore if they're still
      // actually occupying the temporary bed this record put them on.
      // Idempotent by construction, the same recovery property
      // expireNoShowAllocations.ts relies on: once restored_at is set this
      // row no longer matches the WHERE clause above.
      const stillOnTempBed = await trx('allocations')
        .where({ id: row.new_allocation_id, status: 'checked_in_active', bed_id: row.new_bed_id })
        .first('id');
      if (!stillOnTempBed) {
        await trx('transfer_requests').where({ id: row.id }).update({ restored_at: trx.fn.now(), updated_at: trx.fn.now() });
        continue;
      }

      const originalBed = await trx('beds').where({ id: row.old_bed_id }).first();
      if (!originalBed || originalBed.status !== 'available') {
        // Original bed isn't free (reassigned, blocked, etc.) — flag once
        // for staff to resolve manually rather than retrying every 5-minute
        // sweep, or silently leaving the resident on the temp bed forever.
        await trx('transfer_requests').where({ id: row.id }).update({ restoration_blocked_at: trx.fn.now(), updated_at: trx.fn.now() });
        // Real gap, found live via SELF-TEST-GUIDE.md C11 — this only ever
        // notified staff. The resident stuck on the temp bed, whose return
        // just silently failed to happen, had no way to know anything
        // changed at all — they'd just keep expecting to move back with no
        // signal that it isn't happening automatically.
        await notifyWithTrx(trx, {
          orgId,
          campusId: row.campus_id,
          userId: row.student_id,
          type: 'transfer.restoration_blocked',
          title: 'Your return to your original room is delayed — the bed is not currently available',
          link: '/allocations',
        });
        await notifyCampusStaff(trx, orgId, row.campus_id, {
          type: 'transfer.restoration_blocked',
          title: 'Temporary relocation return-due, but the original bed is no longer available',
          link: '/allocations',
        });
        blocked += 1;
        continue;
      }

      // Mirrors transfers/service.ts's executeTransfer core (new allocation
      // on the target bed, end the current one, flip both beds' status) —
      // done inline rather than via that function since this is a
      // system-initiated action with no acting user and no request/approve
      // stages to run through, the same reasoning the no-show/overdue jobs
      // already apply to their own direct table writes.
      //
      // Real bug, found live: order matters here in a way it doesn't in
      // executeTransfer. There, the allocation being vacated sits in
      // 'transfer_pending' right up until execute time — a status the
      // partial unique index (uq_one_active_allocation_per_student, WHERE
      // status IN ('bed_locked','confirmed','awaiting_check_in',
      // 'checked_in_active')) doesn't cover, so inserting the new
      // allocation before ending the old one is harmless there. Here, the
      // allocation being vacated is the temp-bed one, sitting in plain
      // 'checked_in_active' — which the index DOES cover — so inserting
      // the restored allocation before ending it collided with the
      // resident's own still-active row on every single run. Ending the
      // old allocation (and freeing its bed) FIRST avoids that entirely.
      await trx('allocations').where({ id: row.new_allocation_id }).update({ status: 'ended', updated_at: trx.fn.now() });
      await trx('beds').where({ id: row.new_bed_id }).update({ status: 'available', updated_at: trx.fn.now() });

      const [restoredAllocation] = await trx('allocations')
        .insert({
          org_id: orgId,
          campus_id: row.campus_id,
          application_id: null,
          student_id: row.student_id,
          bed_id: row.old_bed_id,
          status: 'checked_in_active',
          approver_user_id: null,
          effective_from: trx.fn.now(),
        })
        .returning('*');

      await trx('beds').where({ id: row.old_bed_id }).update({ status: 'occupied', updated_at: trx.fn.now() });

      // A real, linked transfer_requests row for this restoration — so the
      // round trip shows up in the same history/audit surface as every
      // other transfer, not as an invisible side effect of a background job.
      const [restoreTransfer] = await trx('transfer_requests')
        .insert({
          org_id: orgId,
          campus_id: row.campus_id,
          student_id: row.student_id,
          current_allocation_id: row.new_allocation_id,
          old_bed_id: row.new_bed_id,
          new_bed_id: row.old_bed_id,
          new_allocation_id: restoredAllocation.id,
          reason: 'Automatic restoration to original bed — temporary relocation return-due deadline reached',
          transfer_type: 'emergency',
          status: 'completed',
          decision_reason: 'System-initiated automatic restoration',
          decided_at: trx.fn.now(),
          executed_at: trx.fn.now(),
          old_bed_outcome: 'available',
        })
        .returning('*');

      await trx('transfer_requests').where({ id: row.id }).update({
        restored_at: trx.fn.now(),
        restore_transfer_id: restoreTransfer.id,
        updated_at: trx.fn.now(),
      });

      await notifyWithTrx(trx, {
        orgId,
        campusId: row.campus_id,
        userId: row.student_id,
        type: 'transfer.restored',
        title: 'You have been moved back to your original room',
        link: '/allocations',
      });
      await notifyCampusStaff(trx, orgId, row.campus_id, {
        type: 'transfer.restored',
        title: 'A temporary relocation was automatically restored to the original bed',
        link: '/allocations',
      });

      restored += 1;
    }

    return { restored, blocked };
  });
}

/** Sweeps every known tenant. One tenant's failure must never block the
 * others in the same run — same reasoning as the no-show/overdue sweeps. */
export async function restoreTemporaryRelocationsAllTenants(): Promise<void> {
  for (const orgId of registry.knownOrgIds()) {
    try {
      const { restored, blocked } = await restoreTemporaryRelocationsForOrg(orgId);
      if (restored > 0 || blocked > 0) {
        console.log(`[hostel] temporary-relocation restoration: org ${orgId} restored ${restored}, blocked ${blocked}`);
      }
    } catch (err) {
      console.error(`[hostel] temporary-relocation restoration failed for org ${orgId}:`, err);
    }
  }
}
