import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import { notifyCampusStaff } from '../../utils/notify';
import type { createCheckInSchema } from './validators';

// D17.04 item 60 — these two acknowledgement types mean the resident did
// NOT actually accept the room as handed over; physical move-in didn't
// happen, so the allocation/bed/application must NOT transition the way a
// normal completed check-in does (see the fork in createCheckIn below).
const HANDOVER_REFUSED = new Set(['refuse_handover', 'request_alternate_room']);

/**
 * flow.md §6.3 Check-In state machine, collapsed to one action for the same
 * reasoning as allocations/service.ts createAllocation: Pending ->
 * Verification -> UndertakingPending -> ConditionCheck -> CheckedIn all
 * happen in the single "warden completes check-in with the resident
 * present" moment the source doc's UX flow (§7) draws as one step. This is
 * also where the Bed state machine's Allocated -> Occupied transition
 * happens (flow.md §6.1) — EXCEPT when the resident refuses the handover
 * (item 60 gap-closure, see HANDOVER_REFUSED above): that's now a genuine
 * branch, not something the original single-path insert could represent.
 */
export async function createCheckIn(user: AuthUser, input: z.infer<typeof createCheckInSchema>) {
  const allocation = await db('allocations').where({ id: input.allocationId }).first();
  if (!allocation) throw new NotFoundError('Allocation');
  // D17.03 item 58 gap-closure — 'no_show_warning' is just an earlier,
  // warned point in the same 'awaiting_check_in' window (jobs/
  // expireAllocationOffers.ts's sendNoShowWarningsForOrg), not a different
  // lifecycle; a resident who checks in after being warned must still
  // succeed here exactly as if the warning had never fired.
  if (!['awaiting_check_in', 'no_show_warning'].includes(allocation.status)) {
    throw new ConflictError(`Cannot check in an allocation in status '${allocation.status}'`);
  }

  const existing = await db('checkins').where({ allocation_id: allocation.id }).first();
  if (existing) throw new ConflictError('This allocation has already been checked in');

  // D17.04 item 62 — a safety-critical defect blocks completion outright
  // unless staff explicitly override with a reason, same shape as the
  // Checkout module's own override-with-mandatory-reason pattern
  // (checkouts/service.ts's approveCheckout). Checked before any row is
  // written, so a rejected attempt leaves nothing behind to clean up.
  const safetyCriticalItems = input.items.filter((i) => i.defectSeverity === 'safety_critical');
  if (safetyCriticalItems.length > 0 && !input.overrideSafetyCritical) {
    throw new ConflictError(
      `${safetyCriticalItems.length} item(s) marked safety-critical (${safetyCriticalItems.map((i) => i.itemName).join(', ')}) — set overrideSafetyCritical with a reason to proceed anyway, or resolve the defect first`
    );
  }
  if (input.overrideSafetyCritical && !input.overrideReason) {
    throw new ConflictError('A reason is required when overriding a safety-critical defect');
  }

  const handoverRefused = HANDOVER_REFUSED.has(input.acknowledgementType);

  const [checkin] = await db('checkins')
    .insert({
      org_id: user.org_id,
      campus_id: allocation.campus_id,
      allocation_id: allocation.id,
      undertaking_accepted: input.undertakingAccepted,
      acknowledgement_type: input.acknowledgementType,
      officer_notes: input.officerNotes ?? null,
      resident_notes: input.residentNotes ?? null,
      condition_photos: JSON.stringify(input.conditionPhotos),
      safety_override_reason: safetyCriticalItems.length > 0 ? input.overrideReason : null,
      checked_in_by: user.sub,
    })
    .returning('*');

  if (input.items.length > 0) {
    await db('checkin_inventory_items').insert(
      input.items.map((item) => ({
        org_id: user.org_id,
        campus_id: allocation.campus_id,
        checkin_id: checkin.id,
        item_name: item.itemName,
        item_category: item.itemCategory,
        quantity: item.quantity,
        condition: item.condition,
        defect_severity: item.defectSeverity ?? null,
        photo_url: item.photoUrl ?? null,
        officer_notes: item.officerNotes ?? null,
        resident_response: item.residentResponse,
        resident_notes: item.residentNotes ?? null,
      }))
    );
  }

  if (handoverRefused) {
    // Physical move-in did not happen — the allocation stays exactly where
    // it was (awaiting_check_in/no_show_warning), so a corrected retry can
    // still complete a real check-in later. This attempt is fully recorded
    // for history; it just doesn't advance the bed/application state.
    await recordAudit({
      orgId: user.org_id,
      campusId: allocation.campus_id,
      actorUserId: user.sub,
      action: 'checkin.handover_refused',
      entityType: 'checkin',
      entityId: checkin.id,
      after: { checkin, allocationId: allocation.id },
    });
    await notifyCampusStaff(db, user.org_id, allocation.campus_id, {
      type: 'checkin.handover_refused',
      title: `A resident ${input.acknowledgementType === 'request_alternate_room' ? 'requested an alternate room' : 'refused the room handover'} at check-in`,
      link: '/allocations',
    });
    return checkin;
  }

  await db('allocations').where({ id: allocation.id }).update({ status: 'checked_in_active', updated_at: db.fn.now() });
  await db('beds').where({ id: allocation.bed_id }).update({ status: 'occupied', updated_at: db.fn.now() });

  // Application's purpose is fulfilled once residency is actually active —
  // flow.md §9 status lifecycle ends Draft..Allocated at "Closed".
  if (allocation.application_id) {
    await db('hostel_applications').where({ id: allocation.application_id }).update({ status: 'closed', updated_at: db.fn.now() });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: allocation.campus_id,
    actorUserId: user.sub,
    action: 'checkin.completed',
    entityType: 'checkin',
    entityId: checkin.id,
    after: { checkin, allocationId: allocation.id },
  });

  if (safetyCriticalItems.length > 0) {
    // Completed despite a safety-critical override — worth a distinct,
    // visible notification of its own, not buried in the generic
    // check-in-completed audit entry alone.
    await notifyCampusStaff(db, user.org_id, allocation.campus_id, {
      type: 'checkin.safety_override',
      title: `Check-in completed with a safety-critical defect override: ${safetyCriticalItems.map((i) => i.itemName).join(', ')}`,
      link: '/allocations',
    });
  }

  return checkin;
}

export async function getCheckInByAllocation(allocationId: string) {
  const checkin = await db('checkins').where({ allocation_id: allocationId }).first();
  if (!checkin) return null;
  const items = await db('checkin_inventory_items').where({ checkin_id: checkin.id }).orderBy('item_name');
  return { ...checkin, items };
}
