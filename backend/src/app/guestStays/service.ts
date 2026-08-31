import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import * as repo from './repository';
import type { cancelGuestStaySchema, checkInGuestStaySchema, checkOutGuestStaySchema, createGuestStaySchema } from './validators';

/**
 * D17.25 item 89 — guest/parent short-stay as a genuinely separate pool,
 * not a resident bed. This module never touches `allocations` at all (a
 * guest isn't a system user with a student_id to allocate against) — the
 * bed itself, tagged bed_category='guest_short_stay' at Structure level, IS
 * the occupancy record's anchor. Reusing the same 'available'/'reserved'/
 * 'occupied' bed-status axis residents' beds already use, just on a bed a
 * resident allocation can never touch (allocations/service.ts rejects a
 * non-'resident'-category bed outright).
 *
 * Deliberate scope cut, named rather than silently assumed: no separate
 * housekeeping/turnover-inspection step between checkout and the bed going
 * back to 'available' — checkOutGuestStay frees the bed immediately, the
 * same "one action, not a parallel state machine" simplification this
 * session has applied elsewhere (e.g. Batch 15's key handover). A guest
 * isn't a platform user either, so there's no resident-style self-service
 * "acknowledge policy" action — a staff member records it on their behalf
 * at check-in time instead.
 */
export async function createGuestStay(user: AuthUser, input: z.infer<typeof createGuestStaySchema>) {
  const bed = await repo.findBed(input.bedId);
  if (!bed) throw new NotFoundError('Bed');
  if (bed.bed_category !== 'guest_short_stay') {
    throw new ConflictError('This bed is not tagged as a guest short-stay bed — change its category in Structure first');
  }
  if (bed.status !== 'available') throw new ConflictError(`Bed is '${bed.status}', not available`);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: bed.campus_id,
    bed_id: bed.id,
    guest_name: input.guestName,
    guest_type: input.guestType,
    host_reference: input.hostReference ?? null,
    purpose: input.purpose ?? null,
    arrival_date: input.arrivalDate,
    departure_date: input.departureDate ?? null,
    fee_reference: input.feeReference ?? null,
    meal_entitlement: input.mealEntitlement ?? null,
    created_by: user.sub,
  });
  await repo.updateBedStatus(bed.id, 'reserved');

  await recordAudit({
    orgId: user.org_id,
    campusId: bed.campus_id,
    actorUserId: user.sub,
    action: 'guest_stay.reserved',
    entityType: 'guest_stay',
    entityId: row.id,
    after: row,
  });
  return row;
}

export async function checkInGuestStay(user: AuthUser, id: string, input: z.infer<typeof checkInGuestStaySchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Guest stay');
  if (before.status !== 'reserved') throw new ConflictError(`Cannot check in a guest stay in status '${before.status}'`);

  const after = await repo.update(id, {
    status: 'checked_in',
    identity_verified: input.identityVerified,
    key_reference: input.keyReference ?? null,
  });
  await repo.updateBedStatus(before.bed_id, 'occupied');

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'guest_stay.checked_in',
    entityType: 'guest_stay',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function checkOutGuestStay(user: AuthUser, id: string, input: z.infer<typeof checkOutGuestStaySchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Guest stay');
  if (before.status !== 'checked_in') throw new ConflictError(`Cannot check out a guest stay in status '${before.status}'`);

  const after = await repo.update(id, {
    status: 'checked_out',
    checkout_notes: input.notes ?? null,
    departure_date: before.departure_date ?? db.raw('CURRENT_DATE'),
  });
  await repo.updateBedStatus(before.bed_id, 'available');

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'guest_stay.checked_out',
    entityType: 'guest_stay',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function cancelGuestStay(user: AuthUser, id: string, input: z.infer<typeof cancelGuestStaySchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Guest stay');
  if (before.status !== 'reserved') throw new ConflictError(`Cannot cancel a guest stay in status '${before.status}'`);

  const after = await repo.update(id, { status: 'cancelled', checkout_notes: input.reason });
  await repo.updateBedStatus(before.bed_id, 'available');

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'guest_stay.cancelled',
    entityType: 'guest_stay',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function getGuestStay(id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Guest stay');
  return row;
}

export async function listGuestStays(filters: { status?: string; bedId?: string }) {
  return repo.list(filters);
}
