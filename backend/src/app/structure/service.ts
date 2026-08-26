import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import * as repo from './repository';
import type {
  createBedSchema,
  createBlockSchema,
  createFloorSchema,
  createHostelSchema,
  createRoomSchema,
  updateBedSchema,
  updateBedStatusSchema,
  updateBlockSchema,
  updateFloorSchema,
  updateHostelSchema,
  updateRoomSchema,
  updateRoomStatusSchema,
} from './validators';

// Postgres unique_violation. flow.md §18 DoD: "Cannot create duplicate
// room/bed codes in defined scope" — enforced by the DB unique indexes in
// the migration; this turns that low-level error into the app's
// ConflictError shape instead of leaking a raw pg error to the client.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function listHostels() {
  return repo.listHostels();
}

export async function getHostelTree(hostelId: string) {
  const tree = await repo.getHostelTree(hostelId);
  if (!tree) throw new NotFoundError('Hostel');
  return tree;
}

// D17.01 item 44 — records a code rename as an alias, never overwriting the
// previous one, so old codes stay resolvable in historical documents. A
// no-op when the code isn't actually changing (undefined, or equal to the
// current value) — an alias for a code pointing at itself would be noise,
// not history.
async function recordCodeAliasIfRenamed(
  user: AuthUser,
  campusId: string,
  entityType: 'hostel' | 'block' | 'floor' | 'room' | 'bed',
  entityId: string,
  oldCode: string,
  newCode: string | undefined
) {
  if (newCode === undefined || newCode === oldCode) return;
  await repo.createEntityCodeAlias({
    org_id: user.org_id,
    campus_id: campusId,
    entity_type: entityType,
    entity_id: entityId,
    old_code: oldCode,
  });
}

// D17.01 item 44 — resolve an old code to its current entity, for the rare
// case a historical document (a printed allocation letter, an old report
// export) references a code that's since been renamed.
export async function resolveCodeAlias(entityType: string, code: string) {
  const alias = await repo.findEntityByAlias(entityType, code);
  if (!alias) throw new NotFoundError('No entity found for that code (current or aliased)');
  return alias;
}

export async function createHostel(user: AuthUser, input: z.infer<typeof createHostelSchema>) {
  const campusId = resolveCampusId(user, input.campusId);
  try {
    const row = await repo.createHostel({
      org_id: user.org_id,
      campus_id: campusId,
      code: input.code,
      name: input.name,
      gender_policy: input.genderPolicy,
      capacity: input.capacity,
      effective_from: input.effectiveFrom ?? null,
      effective_to: input.effectiveTo ?? null,
      category_policy: input.categoryPolicy ? JSON.stringify(input.categoryPolicy) : null,
      accessibility_policy: input.accessibilityPolicy ?? null,
    });
    await recordAudit({
      orgId: user.org_id,
      campusId,
      actorUserId: user.sub,
      action: 'hostel.created',
      entityType: 'hostel',
      entityId: row.id,
      after: row,
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Hostel code '${input.code}' already exists`);
    throw err;
  }
}

export async function updateHostel(user: AuthUser, hostelId: string, input: z.infer<typeof updateHostelSchema>) {
  const before = await repo.findHostel(hostelId);
  if (!before) throw new NotFoundError('Hostel');
  await recordCodeAliasIfRenamed(user, before.campus_id, 'hostel', hostelId, before.code, input.code);

  try {
    const after = await repo.updateHostel(hostelId, {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.genderPolicy !== undefined && { gender_policy: input.genderPolicy }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.effectiveFrom !== undefined && { effective_from: input.effectiveFrom }),
      ...(input.effectiveTo !== undefined && { effective_to: input.effectiveTo }),
      ...(input.categoryPolicy !== undefined && { category_policy: JSON.stringify(input.categoryPolicy) }),
      ...(input.accessibilityPolicy !== undefined && { accessibility_policy: input.accessibilityPolicy }),
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: before.campus_id,
      actorUserId: user.sub,
      action: 'hostel.updated',
      entityType: 'hostel',
      entityId: hostelId,
      before,
      after,
    });
    return after;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Hostel code '${input.code}' already exists`);
    throw err;
  }
}

export async function createBlock(user: AuthUser, hostelId: string, input: z.infer<typeof createBlockSchema>) {
  const hostel = await repo.findHostel(hostelId);
  if (!hostel) throw new NotFoundError('Hostel');

  try {
    const row = await repo.createBlock({
      org_id: user.org_id,
      campus_id: hostel.campus_id,
      hostel_id: hostelId,
      code: input.code,
      name: input.name,
      warden_user_id: input.wardenUserId ?? null,
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: hostel.campus_id,
      actorUserId: user.sub,
      action: 'block.created',
      entityType: 'block',
      entityId: row.id,
      after: row,
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Block code '${input.code}' already exists in this hostel`);
    throw err;
  }
}

export async function updateBlock(user: AuthUser, blockId: string, input: z.infer<typeof updateBlockSchema>) {
  const before = await repo.findBlock(blockId);
  if (!before) throw new NotFoundError('Block');
  await recordCodeAliasIfRenamed(user, before.campus_id, 'block', blockId, before.code, input.code);

  try {
    const after = await repo.updateBlock(blockId, {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.wardenUserId !== undefined && { warden_user_id: input.wardenUserId }),
      ...(input.status !== undefined && { status: input.status }),
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: before.campus_id,
      actorUserId: user.sub,
      action: 'block.updated',
      entityType: 'block',
      entityId: blockId,
      before,
      after,
    });
    return after;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Block code '${input.code}' already exists in this hostel`);
    throw err;
  }
}

export async function createFloor(user: AuthUser, blockId: string, input: z.infer<typeof createFloorSchema>) {
  const block = await repo.findBlock(blockId);
  if (!block) throw new NotFoundError('Block');

  try {
    const row = await repo.createFloor({
      org_id: user.org_id,
      campus_id: block.campus_id,
      block_id: blockId,
      number: input.number,
      name: input.name ?? null,
      floor_incharge_user_id: input.floorInchargeUserId ?? null,
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: block.campus_id,
      actorUserId: user.sub,
      action: 'floor.created',
      entityType: 'floor',
      entityId: row.id,
      after: row,
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Floor '${input.number}' already exists in this block`);
    throw err;
  }
}

export async function updateFloor(user: AuthUser, floorId: string, input: z.infer<typeof updateFloorSchema>) {
  const before = await repo.findFloor(floorId);
  if (!before) throw new NotFoundError('Floor');
  // Floor's identifying label is `number`, not `code` — same alias concept,
  // different column.
  await recordCodeAliasIfRenamed(user, before.campus_id, 'floor', floorId, before.number, input.number);

  try {
    const after = await repo.updateFloor(floorId, {
      ...(input.number !== undefined && { number: input.number }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.floorInchargeUserId !== undefined && { floor_incharge_user_id: input.floorInchargeUserId }),
      ...(input.status !== undefined && { status: input.status }),
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: before.campus_id,
      actorUserId: user.sub,
      action: 'floor.updated',
      entityType: 'floor',
      entityId: floorId,
      before,
      after,
    });
    return after;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Floor '${input.number}' already exists in this block`);
    throw err;
  }
}

export async function createRoom(user: AuthUser, floorId: string, input: z.infer<typeof createRoomSchema>) {
  const floor = await repo.findFloor(floorId);
  if (!floor) throw new NotFoundError('Floor');

  try {
    const row = await repo.createRoom({
      org_id: user.org_id,
      campus_id: floor.campus_id,
      floor_id: floorId,
      code: input.code,
      room_type: input.roomType,
      capacity: input.capacity,
      accessibility: input.accessibility,
      permitted_population: input.permittedPopulation ?? null,
      occupancy_compatibility_rule: input.occupancyCompatibilityRule ?? null,
      safety_restriction: input.safetyRestriction ?? null,
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: floor.campus_id,
      actorUserId: user.sub,
      action: 'room.created',
      entityType: 'room',
      entityId: row.id,
      after: row,
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Room code '${input.code}' already exists on this floor`);
    throw err;
  }
}

// Field edits only (code/roomType/capacity/accessibility/restrictions) —
// deliberately separate from updateRoomStatus below, which owns `status`
// and its active-occupancy guard. Renaming a room's code or bumping its
// capacity has no occupancy implication, so no guard is needed here.
export async function updateRoom(user: AuthUser, roomId: string, input: z.infer<typeof updateRoomSchema>) {
  const before = await repo.findRoom(roomId);
  if (!before) throw new NotFoundError('Room');
  await recordCodeAliasIfRenamed(user, before.campus_id, 'room', roomId, before.code, input.code);

  // D17.01 item 48 — a capacity edit that would leave the room's physical
  // bed count exceeding its new configured capacity is rejected outright,
  // not silently allowed to drift out of sync. Reducing capacity below the
  // current bed count is the only capacity edit that can conflict; raising
  // it, or leaving it unset, never can.
  if (input.capacity !== undefined && input.capacity < before.capacity) {
    const bedCount = await repo.countBeds(roomId);
    if (input.capacity < bedCount) {
      throw new ConflictError(`Room has ${bedCount} bed(s) — capacity cannot be reduced below that without removing beds first`);
    }
  }

  try {
    const after = await repo.updateRoom(roomId, {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.roomType !== undefined && { room_type: input.roomType }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.accessibility !== undefined && { accessibility: input.accessibility }),
      ...(input.permittedPopulation !== undefined && { permitted_population: input.permittedPopulation }),
      ...(input.occupancyCompatibilityRule !== undefined && { occupancy_compatibility_rule: input.occupancyCompatibilityRule }),
      ...(input.safetyRestriction !== undefined && { safety_restriction: input.safetyRestriction }),
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: before.campus_id,
      actorUserId: user.sub,
      action: 'room.updated',
      entityType: 'room',
      entityId: roomId,
      before,
      after,
    });
    return after;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Room code '${input.code}' already exists on this floor`);
    throw err;
  }
}

// flow.md §15 / §18 DoD: "Cannot deactivate with unresolved active
// occupancy" — the guard below is the actual enforcement, not just a docs
// note. Reactivating (any non-active -> active) is always allowed.
// D17.01 item 43 widened this from a two-value active/inactive toggle to
// the shared four-state lifecycle — the occupancy guard now applies to
// every non-active target (suspended/deactivated/retired all mean "not
// available for new occupancy"), not just the old 'inactive' value.
// Items 46/47: a reason is mandatory leaving 'active' — this is also how a
// room gets safety-blocked (status='suspended' + statusReasonCategory=
// 'safety'), the D17.17 item 67 hook allocations/service.ts actually reads
// (via safety/repository.ts's findBedSafetyBlock) to reject new occupancy.
export async function updateRoomStatus(user: AuthUser, roomId: string, input: z.infer<typeof updateRoomStatusSchema>) {
  const before = await repo.findRoom(roomId);
  if (!before) throw new NotFoundError('Room');

  if (input.status !== 'active' && !input.reason) {
    throw new ConflictError('A reason is required when moving a room out of Active status');
  }

  if (input.status !== 'active' && (await repo.roomHasActiveOccupancy(roomId))) {
    throw new ConflictError('Room has a bed with active/reserved/occupied status — resolve or transfer occupancy before changing status');
  }

  const reason = input.status === 'active' ? null : (input.reason ?? null);
  const reviewDate = input.status === 'active' ? null : (input.reviewDate ?? null);
  const reasonCategory = input.status === 'active' ? null : (input.statusReasonCategory ?? null);
  const after = await repo.updateRoomStatus(roomId, input.status, reason, reviewDate, reasonCategory);
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'room.status_changed',
    entityType: 'room',
    entityId: roomId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function createBed(user: AuthUser, roomId: string, input: z.infer<typeof createBedSchema>) {
  const room = await repo.findRoom(roomId);
  if (!room) throw new NotFoundError('Room');

  // D17.01 item 48 — same cross-check as updateRoom's capacity-reduction
  // guard, the other direction: a new bed can't be added past the room's
  // already-configured capacity either.
  const bedCount = await repo.countBeds(roomId);
  if (bedCount >= room.capacity) {
    throw new ConflictError(`Room is already at its configured capacity (${room.capacity}) — raise capacity before adding another bed`);
  }

  try {
    const row = await repo.createBed({
      org_id: user.org_id,
      campus_id: room.campus_id,
      room_id: roomId,
      code: input.code,
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: room.campus_id,
      actorUserId: user.sub,
      action: 'bed.created',
      entityType: 'bed',
      entityId: row.id,
      after: row,
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Bed code '${input.code}' already exists in this room`);
    throw err;
  }
}

// Field edit only (code) — deliberately separate from updateBedStatus below,
// same reasoning as updateRoom vs. updateRoomStatus: a label rename has no
// occupancy implication, so it gets none of that guard.
export async function updateBed(user: AuthUser, bedId: string, input: z.infer<typeof updateBedSchema>) {
  const before = await repo.findBed(bedId);
  if (!before) throw new NotFoundError('Bed');
  await recordCodeAliasIfRenamed(user, before.campus_id, 'bed', bedId, before.code, input.code);

  try {
    const after = await repo.updateBed(bedId, {
      ...(input.code !== undefined && { code: input.code }),
    });
    await recordAudit({
      orgId: user.org_id,
      campusId: before.campus_id,
      actorUserId: user.sub,
      action: 'bed.updated',
      entityType: 'bed',
      entityId: bedId,
      before,
      after,
    });
    return after;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`Bed code '${input.code}' already exists in this room`);
    throw err;
  }
}

// Manual status override (blocked/maintenance/available) only — 'reserved',
// 'allocated' and 'occupied' are set exclusively by the allocation/check-in
// state machines (flow.md §6.1), never through this endpoint.
export async function updateBedStatus(user: AuthUser, bedId: string, input: z.infer<typeof updateBedStatusSchema>) {
  const before = await repo.findBed(bedId);
  if (!before) throw new NotFoundError('Bed');

  if (['reserved', 'allocated', 'occupied'].includes(before.status) && input.status === 'available') {
    throw new ConflictError(
      `Bed is currently '${before.status}' via an active allocation — release through the allocation/checkout workflow, not a manual status override`
    );
  }

  // D17.01 items 46/47 — the reason is already mandatory on this endpoint
  // (validators.ts); the only change here is persisting it (+ an optional
  // review date) onto the row itself instead of leaving it audit-log-only.
  // A move back to 'available' clears both — no reason applies once the
  // block/maintenance episode is over.
  const reason = input.status === 'available' ? null : input.reason;
  const reviewDate = input.status === 'available' ? null : (input.reviewDate ?? null);
  const after = await repo.updateBedStatus(bedId, input.status, reason, reviewDate);
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'bed.status_overridden',
    entityType: 'bed',
    entityId: bedId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}
