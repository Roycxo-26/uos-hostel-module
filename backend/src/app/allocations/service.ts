import { getPermissions, hasOrgRole, hasPermission, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as closuresRepo from '../closures/repository';
import * as safetyRepo from '../safety/repository';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import type { NoBedReason } from './types';
import type {
  createAllocationSchema,
  createOfferSchema,
  declineOfferSchema,
  deferNoShowSchema,
  noShowExtendSchema,
  noShowReleaseSchema,
  reassignNoShowSchema,
  reserveBedSchema,
  updateWaitlistPrioritySchema,
  withdrawOfferSchema,
} from './validators';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * flow.md §7 UX flow / HST-WF-03: "Warden Locks & Assigns Bed" is one step
 * from the reader's point of view, so this performs propose -> lock ->
 * confirm as a single atomic action rather than three separate warden
 * clicks the source doc never describes. The formal Proposed/BedLocked/
 * Confirmed sub-states from flow.md §6.2 collapse into this one write; only
 * the externally-visible result ('awaiting_check_in') is exposed.
 *
 * Concurrency: the partial unique index on allocations(bed_id) — see the
 * migration — is the real integrity guard (source doc HST-ADR-004:
 * "PostgreSQL uniqueness/transaction is final guard"). Same pattern the
 * bundle's own §7 finding 3 (refresh-token replay) points at: a single
 * atomic constraint, not a check-then-write race.
 */
export async function createAllocation(user: AuthUser, input: z.infer<typeof createAllocationSchema>) {
  const application = await db('hostel_applications').where({ id: input.applicationId }).first();
  if (!application) throw new NotFoundError('Hostel application');
  if (application.status !== 'allocation_ready') {
    throw new ConflictError(`Application is '${application.status}', not allocation-ready`);
  }

  const bed = await db('beds').where({ id: input.bedId }).first();
  if (!bed) throw new NotFoundError('Bed');
  if (bed.status !== 'available') {
    throw new ConflictError(`Bed is '${bed.status}', not available`);
  }
  // D17.25 item 89 — a guest/parent short-stay bed is a genuinely separate
  // pool, never consumable by ordinary resident allocation.
  if (bed.bed_category !== 'resident') {
    throw new ConflictError('This bed is reserved for guest short-stay use, not resident allocation');
  }
  // D17.17 item 67 — a room-level safety block or a hostel-level safety
  // closure prevents new occupancy even on a bed that's otherwise
  // physically clean and free.
  const safetyBlock = await safetyRepo.findBedSafetyBlock(bed.id);
  if (safetyBlock.blocked) throw new ConflictError(safetyBlock.reason ?? 'This bed is under a safety block');
  // D17.25 item 87 — a room/floor/hostel mid-closure blocks new occupancy
  // the same way a safety block does, independent of the bed's own status.
  const closureBlock = await closuresRepo.findClosureBlock(bed.id);
  if (closureBlock.blocked) throw new ConflictError(closureBlock.reason ?? 'This bed is under an active closure');

  const settings = await getSettings(user.org_id);
  const checkInDeadline = new Date(Date.now() + settings.policyDefaults.checkInDeadlineHours * 60 * 60 * 1000);

  try {
    const [allocation] = await db('allocations')
      .insert({
        org_id: user.org_id,
        campus_id: bed.campus_id,
        application_id: application.id,
        student_id: application.student_id,
        bed_id: bed.id,
        status: 'awaiting_check_in',
        check_in_deadline: checkInDeadline,
        approver_user_id: user.sub,
        effective_from: db.fn.now(),
      })
      .returning('*');

    await db('beds').where({ id: bed.id }).update({ status: 'allocated', updated_at: db.fn.now() });
    await db('hostel_applications').where({ id: application.id }).update({ status: 'allocated', updated_at: db.fn.now() });

    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation.created',
      entityType: 'allocation',
      entityId: allocation.id,
      after: allocation,
    });

    await notify({
      orgId: user.org_id,
      campusId: bed.campus_id,
      userId: allocation.student_id,
      type: 'allocation.confirmed',
      title: 'A bed has been allocated to you',
      body: `Check in before ${new Date(checkInDeadline).toLocaleString()}`,
      link: '/allocations',
    });

    return allocation;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('This bed or student already has an active allocation — another request won the race');
    }
    throw err;
  }
}

export async function listAllocations(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canManageAllocations(user)) ? undefined : user.sub;
  return repo.list({ status: filters.status, studentId });
}

export async function getAllocation(id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Allocation');
  return row;
}

export async function listNoShowQueue() {
  return repo.listNoShowCandidates();
}

// Acts on either status: 'no_show_review' (the automatic expiry job has
// already flagged it — jobs/expireNoShowAllocations.ts) or still
// 'awaiting_check_in' with a passed deadline (not swept yet — see
// repository.ts's listNoShowCandidates for why that gap is expected, not a
// bug). Anything else is a real state error.
// D17.03 item 58 — 'no_show_warning' and 'deferred' both need to be
// actionable through the same release/extend/defer paths as
// 'no_show_review'/'awaiting_check_in'; they're earlier or paused points
// in the same lifecycle, not a separate one.
const NO_SHOW_ACTIONABLE_FROM = new Set(['awaiting_check_in', 'no_show_review', 'no_show_warning', 'deferred']);

export async function releaseNoShow(user: AuthUser, allocationId: string, input: z.infer<typeof noShowReleaseSchema>) {
  const before = await repo.findById(allocationId);
  if (!before) throw new NotFoundError('Allocation');
  if (!NO_SHOW_ACTIONABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot release an allocation in status '${before.status}'`);
  }

  const [after] = await db('allocations')
    .where({ id: allocationId })
    .update({ status: 'released', no_show_reason: input.reason, updated_at: db.fn.now() })
    .returning('*');

  await db('beds').where({ id: before.bed_id }).update({ status: 'available', updated_at: db.fn.now() });
  // Student re-enters the allocation-ready queue rather than being silently
  // dropped — releasing a bed is not the same decision as rejecting the
  // underlying application.
  if (before.application_id) {
    await db('hostel_applications').where({ id: before.application_id }).update({ status: 'allocation_ready', updated_at: db.fn.now() });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'allocation.no_show_released',
    entityType: 'allocation',
    entityId: allocationId,
    before,
    after,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'allocation.no_show_released',
    title: 'Your bed reservation was released (no-show)',
    body: input.reason,
    link: '/applications',
  });

  return after;
}

export async function extendNoShow(user: AuthUser, allocationId: string, input: z.infer<typeof noShowExtendSchema>) {
  const before = await repo.findById(allocationId);
  if (!before) throw new NotFoundError('Allocation');
  if (!NO_SHOW_ACTIONABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot extend an allocation in status '${before.status}'`);
  }

  // An extension un-does the auto-expiry too, not just the deadline — an
  // allocation the job already moved to 'no_show_review' must go back to
  // 'awaiting_check_in' with its new deadline, or it would sit in the
  // review queue forever despite having a fresh, unexpired deadline.
  const [after] = await db('allocations')
    .where({ id: allocationId })
    .update({ status: 'awaiting_check_in', check_in_deadline: new Date(input.newDeadline), updated_at: db.fn.now() })
    .returning('*');

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'allocation.deadline_extended',
    entityType: 'allocation',
    entityId: allocationId,
    before,
    after,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'allocation.deadline_extended',
    title: 'Your check-in deadline was extended',
    body: `New deadline: ${new Date(input.newDeadline).toLocaleString()}`,
    link: '/applications',
  });

  return after;
}

// ============================================================================
// D17.03 — Waitlist, offer & bed-hold system (HOSTEL-GAP-ANALYSIS.md's own
// #1 priority, TODO.md Batch 14). The existing createAllocation direct-
// assign flow above is untouched — this is a parallel, opt-in path for
// when staff want the resident to explicitly confirm a bed rather than
// having it assigned outright, not a replacement for the fast path.
// ============================================================================

// --- Waitlist (item 53) ---------------------------------------------------

export async function listWaitlist(filters: { hostelId?: string; status?: string }) {
  return repo.listWaitlist(filters);
}

/** Resident-facing transparency view (item 57) — their own rank plus how
 * many others share the same active pool, or null if they're not
 * currently on any waitlist. */
export async function getMyWaitlistPosition(user: AuthUser) {
  const ranked = await repo.findMyWaitlistRank(user.sub);
  if (!ranked) return null;
  const total = await db('waitlist_entries')
    .where({ status: 'active', hostel_id: ranked.hostel_id })
    .count<{ count: string }[]>('id as count')
    .first();
  return { ...ranked, totalActive: Number(total?.count ?? 0) };
}

export async function updateWaitlistPriority(user: AuthUser, entryId: string, input: z.infer<typeof updateWaitlistPrioritySchema>) {
  const before = await repo.findWaitlistEntry(entryId);
  if (!before) throw new NotFoundError('Waitlist entry');

  const after = await repo.updateWaitlistEntry(entryId, {
    priority_score: input.priorityScore,
    ...(input.notes !== undefined && { notes: input.notes }),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'waitlist.priority_updated',
    entityType: 'waitlist_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}

export async function withdrawFromWaitlist(user: AuthUser, entryId: string) {
  const before = await repo.findWaitlistEntry(entryId);
  if (!before) throw new NotFoundError('Waitlist entry');
  if (before.student_id !== user.sub && !(await canManageAllocations(user))) {
    throw new ForbiddenError('You can only withdraw your own waitlist entry');
  }
  if (!['active', 'offered'].includes(before.status)) {
    throw new ConflictError(`Cannot withdraw a waitlist entry in status '${before.status}'`);
  }

  const after = await repo.updateWaitlistEntry(entryId, { status: 'withdrawn' });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'waitlist.withdrawn',
    entityType: 'waitlist_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}

// --- Direct bed reservation — the one bed_hold type (item 54) a staff
// action creates outright, rather than through the offer flow below. ------

export async function reserveBed(user: AuthUser, input: z.infer<typeof reserveBedSchema>) {
  const bed = await db('beds').where({ id: input.bedId }).first();
  if (!bed) throw new NotFoundError('Bed');
  if (bed.status !== 'available') throw new ConflictError(`Bed is '${bed.status}', not available`);
  if (await repo.findActiveBedHold(bed.id)) throw new ConflictError('Bed already has an active hold');

  const hold = await repo.createBedHold({
    org_id: user.org_id,
    campus_id: bed.campus_id,
    bed_id: bed.id,
    hold_type: 'policy_reservation',
    held_by: user.sub,
    reason: input.reason,
    expires_at: input.expiresAt ?? null,
  });
  await db('beds').where({ id: bed.id }).update({ status: 'reserved', updated_at: db.fn.now() });
  await recordAudit({
    orgId: user.org_id,
    campusId: bed.campus_id,
    actorUserId: user.sub,
    action: 'bed_hold.created',
    entityType: 'bed_hold',
    entityId: hold.id,
    after: hold,
    reason: input.reason,
  });
  return hold;
}

export async function releaseBedHold(user: AuthUser, holdId: string) {
  const before = await repo.findBedHold(holdId);
  if (!before) throw new NotFoundError('Bed hold');
  if (before.released_at) throw new ConflictError('This hold is already released');

  const after = await repo.releaseBedHold(holdId);
  // Only a policy_reservation hold releases straight back to 'available'
  // here — 'offer'/'accepted_offer' holds are released as part of
  // accept/decline/expiry below, which set the bed's next status
  // themselves (allocated, or back to available); calling this directly
  // on one of those would be a staff error, not something to silently
  // paper over with a bed-status write that might contradict what the
  // offer flow just did.
  if (before.hold_type === 'policy_reservation') {
    await db('beds').where({ id: before.bed_id }).update({ status: 'available', updated_at: db.fn.now() });
  }
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'bed_hold.released',
    entityType: 'bed_hold',
    entityId: holdId,
    before,
    after,
  });
  return after;
}

// --- No-bed reason classifier (item 56) — a pure read-side diagnostic,
// nothing persisted. -------------------------------------------------------

export async function getNoBedReason(applicationId: string): Promise<{ reason: NoBedReason; message: string }> {
  const application = await db('hostel_applications').where({ id: applicationId }).first();
  if (!application) throw new NotFoundError('Hostel application');

  const hostelId = (application.preferences as Record<string, unknown> | null)?.hostelId as string | undefined;
  const roomType = (application.preferences as Record<string, unknown> | null)?.roomType as string | undefined;

  if (!hostelId) {
    return { reason: 'POLICY_RESTRICTION', message: 'The applicant has not named a hostel preference to check availability against.' };
  }

  const physical = await repo.countPhysicalBedsForHostel(hostelId);
  if (physical === 0) {
    return { reason: 'NO_PHYSICAL_BED', message: 'This hostel has no beds configured at all.' };
  }

  const compatible = await repo.countCompatibleBedsForHostel(hostelId, roomType);
  if (compatible === 0) {
    return {
      reason: 'NO_COMPATIBLE_BED',
      message: roomType
        ? `No active room of type '${roomType}' exists in this hostel.`
        : 'No active room exists in this hostel.',
    };
  }

  const available = await repo.countAvailableBedsForHostel(hostelId, roomType);
  if (available === 0) {
    return { reason: 'ALL_BEDS_HELD_OR_OCCUPIED', message: 'Compatible beds exist, but every one is currently occupied, allocated, held or blocked.' };
  }

  return { reason: 'ALL_BEDS_HELD_OR_OCCUPIED', message: `${available} compatible bed(s) are actually available — check the bed picker's filters.` };
}

// --- Allocation offer (item 55) --------------------------------------------

/**
 * The missing intermediate step the gap ledger names directly: propose a
 * bed, let the resident accept or decline within a deadline, instead of
 * createAllocation's outright assignment. Reuses createAllocation's own
 * validation shape (application must be allocation-ready, bed must be
 * available) — the divergence starts after that: this locks the bed with a
 * real, typed hold instead of allocating it immediately.
 */
export async function createOffer(user: AuthUser, input: z.infer<typeof createOfferSchema>) {
  const application = await db('hostel_applications').where({ id: input.applicationId }).first();
  if (!application) throw new NotFoundError('Hostel application');
  if (application.status !== 'allocation_ready') {
    throw new ConflictError(`Application is '${application.status}', not allocation-ready`);
  }

  const bed = await db('beds').where({ id: input.bedId }).first();
  if (!bed) throw new NotFoundError('Bed');
  if (bed.status !== 'available') throw new ConflictError(`Bed is '${bed.status}', not available`);
  if (bed.bed_category !== 'resident') {
    throw new ConflictError('This bed is reserved for guest short-stay use, not resident allocation');
  }
  if (await repo.findActiveBedHold(bed.id)) throw new ConflictError('Bed already has an active hold');
  // D17.17 item 67 / D17.25 item 87 — same safety and closure guards as
  // createAllocation's direct path.
  const safetyBlock = await safetyRepo.findBedSafetyBlock(bed.id);
  if (safetyBlock.blocked) throw new ConflictError(safetyBlock.reason ?? 'This bed is under a safety block');
  const closureBlock = await closuresRepo.findClosureBlock(bed.id);
  if (closureBlock.blocked) throw new ConflictError(closureBlock.reason ?? 'This bed is under an active closure');

  const settings = await getSettings(user.org_id);
  const deadlineHours = input.acceptDeadlineHours ?? settings.policyDefaults.offerAcceptDeadlineHours;
  const acceptDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);

  try {
    const offer = await repo.createAllocationOffer({
      org_id: user.org_id,
      campus_id: bed.campus_id,
      application_id: application.id,
      student_id: application.student_id,
      bed_id: bed.id,
      offered_by: user.sub,
      status: 'pending',
      accept_deadline: acceptDeadline,
    });

    const hold = await repo.createBedHold({
      org_id: user.org_id,
      campus_id: bed.campus_id,
      bed_id: bed.id,
      hold_type: 'offer',
      reference_type: 'allocation_offer',
      reference_id: offer.id,
      held_by: user.sub,
      reason: `Offer pending — accept by ${acceptDeadline.toLocaleString()}`,
      expires_at: acceptDeadline,
    });
    const finalOffer = await repo.updateOffer(offer.id, { bed_hold_id: hold.id });

    await db('beds').where({ id: bed.id }).update({ status: 'reserved', updated_at: db.fn.now() });

    // If this application has an active waitlist entry, mark it 'offered'
    // — still visible on the waitlist (declining/expiring reverts it to
    // 'active', see below), just not double-counted as available capacity
    // while this offer is pending.
    const waitlistEntry = await repo.findActiveWaitlistEntryByApplication(application.id);
    if (waitlistEntry) await repo.updateWaitlistEntry(waitlistEntry.id, { status: 'offered' });

    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation_offer.created',
      entityType: 'allocation_offer',
      entityId: offer.id,
      after: finalOffer,
    });

    await notify({
      orgId: user.org_id,
      campusId: bed.campus_id,
      userId: application.student_id,
      type: 'allocation_offer.created',
      title: 'A bed has been offered to you',
      body: `Accept or decline before ${acceptDeadline.toLocaleString()}`,
      link: '/applications',
    });

    return finalOffer;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('This bed or application already has a pending offer — another request won the race');
    }
    throw err;
  }
}

async function releaseOfferHold(offerId: string, bedHoldId: string | null) {
  if (bedHoldId) await repo.releaseBedHold(bedHoldId);
}

/**
 * Accepting closes the offer AND creates the real allocation — genuinely
 * cascading through 'proposed' -> 'bed_locked' -> 'confirmed' ->
 * 'awaiting_check_in' as distinct, audited transitions, closing item 54's
 * actual complaint ("the schema anticipated the offer flow; the logic
 * never arrived"). All in one request (no separate human click needed
 * between bed_locked and confirmed — nothing in the BRD describes one),
 * but each transition is its own row-state and its own audit entry, not
 * collapsed into a single opaque write the way createAllocation's direct
 * path still legitimately is.
 */
export async function acceptOffer(user: AuthUser, offerId: string) {
  const offer = await repo.findOfferById(offerId);
  if (!offer) throw new NotFoundError('Allocation offer');
  if (offer.student_id !== user.sub) throw new ForbiddenError('You can only accept your own offer');
  if (offer.status !== 'pending') throw new ConflictError(`Cannot accept an offer in status '${offer.status}'`);
  if (new Date(offer.accept_deadline) < new Date()) throw new ConflictError('This offer has expired');

  const bed = await db('beds').where({ id: offer.bed_id }).first();
  if (!bed) throw new NotFoundError('Bed');

  await releaseOfferHold(offer.id, offer.bed_hold_id);

  try {
    let allocation = await db('allocations')
      .insert({
        org_id: user.org_id,
        campus_id: bed.campus_id,
        application_id: offer.application_id,
        student_id: offer.student_id,
        bed_id: bed.id,
        status: 'proposed',
        approver_user_id: offer.offered_by,
        bed_hold_id: offer.bed_hold_id,
      })
      .returning('*')
      .then((rows) => rows[0]);
    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation.proposed',
      entityType: 'allocation',
      entityId: allocation.id,
      after: allocation,
    });

    let before = allocation;
    allocation = await db('allocations').where({ id: allocation.id }).update({ status: 'bed_locked', updated_at: db.fn.now() }).returning('*').then((rows) => rows[0]);
    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation.bed_locked',
      entityType: 'allocation',
      entityId: allocation.id,
      before,
      after: allocation,
    });

    before = allocation;
    allocation = await db('allocations').where({ id: allocation.id }).update({ status: 'confirmed', updated_at: db.fn.now() }).returning('*').then((rows) => rows[0]);
    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation.confirmed',
      entityType: 'allocation',
      entityId: allocation.id,
      before,
      after: allocation,
    });

    const settings = await getSettings(user.org_id);
    const checkInDeadline = new Date(Date.now() + settings.policyDefaults.checkInDeadlineHours * 60 * 60 * 1000);
    before = allocation;
    allocation = await db('allocations')
      .where({ id: allocation.id })
      .update({ status: 'awaiting_check_in', check_in_deadline: checkInDeadline, updated_at: db.fn.now() })
      .returning('*')
      .then((rows) => rows[0]);
    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation.awaiting_check_in',
      entityType: 'allocation',
      entityId: allocation.id,
      before,
      after: allocation,
    });

    await db('beds').where({ id: bed.id }).update({ status: 'allocated', updated_at: db.fn.now() });
    await db('hostel_applications').where({ id: offer.application_id }).update({ status: 'allocated', updated_at: db.fn.now() });

    const waitlistEntry = await repo.findActiveWaitlistEntryByApplication(offer.application_id);
    if (waitlistEntry) await repo.updateWaitlistEntry(waitlistEntry.id, { status: 'fulfilled' });

    const finalOffer = await repo.updateOffer(offer.id, { status: 'accepted', decided_at: db.fn.now() });
    await recordAudit({
      orgId: user.org_id,
      campusId: bed.campus_id,
      actorUserId: user.sub,
      action: 'allocation_offer.accepted',
      entityType: 'allocation_offer',
      entityId: offer.id,
      before: offer,
      after: finalOffer,
    });

    await notify({
      orgId: user.org_id,
      campusId: bed.campus_id,
      userId: offer.student_id,
      type: 'allocation_offer.accepted',
      title: 'You accepted your bed offer — check in before the deadline',
      body: `Check in before ${checkInDeadline.toLocaleString()}`,
      link: '/allocations',
    });

    return { offer: finalOffer, allocation };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('This bed or student already has an active allocation — another request won the race');
    }
    throw err;
  }
}

export async function declineOffer(user: AuthUser, offerId: string, input: z.infer<typeof declineOfferSchema>) {
  const offer = await repo.findOfferById(offerId);
  if (!offer) throw new NotFoundError('Allocation offer');
  if (offer.student_id !== user.sub) throw new ForbiddenError('You can only decline your own offer');
  if (offer.status !== 'pending') throw new ConflictError(`Cannot decline an offer in status '${offer.status}'`);

  await releaseOfferHold(offer.id, offer.bed_hold_id);
  await db('beds').where({ id: offer.bed_id }).update({ status: 'available', updated_at: db.fn.now() });

  // Declining doesn't drop them off the waitlist — same reasoning as a
  // no-show release re-opening the application: turning down THIS bed
  // isn't the same decision as leaving the queue entirely.
  const waitlistEntry = await repo.findActiveWaitlistEntryByApplication(offer.application_id);
  if (waitlistEntry) await repo.updateWaitlistEntry(waitlistEntry.id, { status: 'active' });

  const after = await repo.updateOffer(offer.id, { status: 'declined', decided_at: db.fn.now(), decline_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: offer.campus_id,
    actorUserId: user.sub,
    action: 'allocation_offer.declined',
    entityType: 'allocation_offer',
    entityId: offerId,
    before: offer,
    after,
    reason: input.reason,
  });
  await notifyCampusStaff(db, user.org_id, offer.campus_id, {
    type: 'allocation_offer.declined',
    title: 'A resident declined their bed offer',
    link: '/allocations',
  });
  return after;
}

export async function withdrawOffer(user: AuthUser, offerId: string, input: z.infer<typeof withdrawOfferSchema>) {
  const offer = await repo.findOfferById(offerId);
  if (!offer) throw new NotFoundError('Allocation offer');
  if (offer.status !== 'pending') throw new ConflictError(`Cannot withdraw an offer in status '${offer.status}'`);

  await releaseOfferHold(offer.id, offer.bed_hold_id);
  await db('beds').where({ id: offer.bed_id }).update({ status: 'available', updated_at: db.fn.now() });

  const waitlistEntry = await repo.findActiveWaitlistEntryByApplication(offer.application_id);
  if (waitlistEntry) await repo.updateWaitlistEntry(waitlistEntry.id, { status: 'active' });

  const after = await repo.updateOffer(offer.id, { status: 'withdrawn', decided_at: db.fn.now(), decline_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: offer.campus_id,
    actorUserId: user.sub,
    action: 'allocation_offer.withdrawn',
    entityType: 'allocation_offer',
    entityId: offerId,
    before: offer,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: offer.campus_id,
    userId: offer.student_id,
    type: 'allocation_offer.withdrawn',
    title: 'A bed offer made to you was withdrawn by staff',
    body: input.reason,
    link: '/applications',
  });
  return after;
}

export async function listOffers(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canManageAllocations(user)) ? undefined : user.sub;
  return repo.listOffers({ status: filters.status, studentId });
}

// --- Remaining no-show states (item 58) ------------------------------------

/** Distinct from a staff-initiated no-show release: the resident themself
 * gives up a still-pending bed before their deadline, rather than staff
 * discovering the no-show after the fact. Same downstream effect on the
 * bed as `released`, different meaning/audit trail. */
export async function cancelAllocation(user: AuthUser, allocationId: string) {
  const before = await repo.findById(allocationId);
  if (!before) throw new NotFoundError('Allocation');
  if (before.student_id !== user.sub) throw new ForbiddenError('You can only cancel your own allocation');
  if (before.status !== 'awaiting_check_in') {
    throw new ConflictError(`Cannot cancel an allocation in status '${before.status}'`);
  }

  const after = await db('allocations')
    .where({ id: allocationId })
    .update({ status: 'cancelled_by_resident', updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
  await db('beds').where({ id: before.bed_id }).update({ status: 'available', updated_at: db.fn.now() });
  if (before.application_id) {
    await db('hostel_applications').where({ id: before.application_id }).update({ status: 'allocation_ready', updated_at: db.fn.now() });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'allocation.cancelled_by_resident',
    entityType: 'allocation',
    entityId: allocationId,
    before,
    after,
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'allocation.cancelled_by_resident',
    title: 'A resident cancelled their own bed reservation before check-in',
    link: '/allocations',
  });
  return after;
}

/** A "snooze" on a no-show review entry — distinct from extendNoShow
 * (which sets a fresh deadline and expects a check-in to still happen) and
 * from releaseNoShow (which gives up the bed outright): deferred just
 * means "flagged for a later manual look," removed from the automatic
 * sweep's action list until a human decides one way or the other. */
export async function deferNoShow(user: AuthUser, allocationId: string, input: z.infer<typeof deferNoShowSchema>) {
  const before = await repo.findById(allocationId);
  if (!before) throw new NotFoundError('Allocation');
  if (!NO_SHOW_ACTIONABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot defer an allocation in status '${before.status}'`);
  }

  const after = await db('allocations')
    .where({ id: allocationId })
    .update({ status: 'deferred', no_show_reason: input.reason, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'allocation.deferred',
    entityType: 'allocation',
    entityId: allocationId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

/**
 * The no-show's bed goes to a DIFFERENT candidate, not back to the pool —
 * a distinct outcome from a plain release. Ends the current allocation as
 * 'reassigned' (not 'released', so the audit trail shows what actually
 * happened to the bed) and immediately opens a real offer (not a direct
 * assignment) to the new application, so the new candidate gets the same
 * accept/decline choice everyone else offered a bed gets. Same
 * actionable-from set as release/extend/defer above — reassign is a
 * fourth option alongside them, not a separate lifecycle.
 */
export async function reassignNoShow(user: AuthUser, allocationId: string, input: z.infer<typeof reassignNoShowSchema>) {
  const before = await repo.findById(allocationId);
  if (!before) throw new NotFoundError('Allocation');
  if (!NO_SHOW_ACTIONABLE_FROM.has(before.status)) {
    throw new ConflictError(`Cannot reassign an allocation in status '${before.status}'`);
  }

  const newApplication = await db('hostel_applications').where({ id: input.newApplicationId }).first();
  if (!newApplication) throw new NotFoundError('New hostel application');
  if (newApplication.status !== 'allocation_ready') {
    throw new ConflictError(`New application is '${newApplication.status}', not allocation-ready`);
  }

  const after = await db('allocations')
    .where({ id: allocationId })
    .update({ status: 'reassigned', no_show_reason: `Reassigned to a different candidate`, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
  await db('beds').where({ id: before.bed_id }).update({ status: 'available', updated_at: db.fn.now() });
  if (before.application_id) {
    await db('hostel_applications').where({ id: before.application_id }).update({ status: 'allocation_ready', updated_at: db.fn.now() });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'allocation.reassigned',
    entityType: 'allocation',
    entityId: allocationId,
    before,
    after,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'allocation.reassigned',
    title: 'Your bed reservation was reassigned to another applicant',
    link: '/applications',
  });

  return createOffer(user, { applicationId: newApplication.id, bedId: before.bed_id });
}

/** Same "reuse the actual route permission as the read-visibility signal"
 * reasoning as applications/service.ts's canViewAllApplications. */
async function canManageAllocations(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'allocation:create');
}
