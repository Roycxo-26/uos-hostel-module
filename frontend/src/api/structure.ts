import { api } from './client';
import type { Block, Bed, Floor, Hostel, HostelTree, LifecycleStatus, Room } from '../types';

/** HOSTEL-GAP-ANALYSIS.md D17.01 item 44 — resolve an old, renamed-away
 * code back to its current entity. */
export async function resolveCodeAlias(entityType: 'hostel' | 'block' | 'floor' | 'room' | 'bed', code: string) {
  const { alias } = await api.get<{ alias: { entityId: string; entityType: string; oldCode: string; supersededAt: string } }>(
    `/structure/aliases?entityType=${entityType}&code=${encodeURIComponent(code)}`
  );
  return alias;
}

export async function listHostels() {
  const { hostels } = await api.get<{ hostels: Hostel[] }>('/structure/hostels');
  return hostels;
}

export async function getHostelTree(hostelId: string) {
  const { hostel } = await api.get<{ hostel: HostelTree }>(`/structure/hostels/${hostelId}`);
  return hostel;
}

export async function createHostel(input: {
  campusId?: string;
  code: string;
  name: string;
  genderPolicy: string;
  capacity: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  categoryPolicy?: string[];
  accessibilityPolicy?: string;
}) {
  const { hostel } = await api.post<{ hostel: Hostel }>('/structure/hostels', input);
  return hostel;
}

/** flow.md §19 item 18 gap-closure — the backend has supported this since
 * Batch 1 (`PATCH /structure/hostels/:id`); no frontend caller ever existed
 * until now. All fields optional/partial, matching updateHostelSchema. */
export async function updateHostel(
  hostelId: string,
  input: Partial<{
    code: string;
    name: string;
    genderPolicy: string;
    capacity: number;
    status: LifecycleStatus;
    effectiveFrom: string;
    effectiveTo: string;
    categoryPolicy: string[];
    accessibilityPolicy: string;
  }>
) {
  const { hostel } = await api.patch<{ hostel: Hostel }>(`/structure/hostels/${hostelId}`, input);
  return hostel;
}

export async function createBlock(hostelId: string, input: { code: string; name: string }) {
  const { block } = await api.post<{ block: Block }>(`/structure/hostels/${hostelId}/blocks`, input);
  return block;
}

/** flow.md §19 item 18 gap-closure — the code/name edits this note flagged
 * as a still-missing, bigger follow-up. Backend built alongside this call. */
export async function updateBlock(
  blockId: string,
  input: Partial<{ code: string; name: string; wardenUserId: string; status: LifecycleStatus }>
) {
  const { block } = await api.patch<{ block: Block }>(`/structure/blocks/${blockId}`, input);
  return block;
}

export async function createFloor(blockId: string, input: { number: string; name?: string }) {
  const { floor } = await api.post<{ floor: Floor }>(`/structure/blocks/${blockId}/floors`, input);
  return floor;
}

export async function updateFloor(
  floorId: string,
  input: Partial<{ number: string; name: string; floorInchargeUserId: string; status: LifecycleStatus }>
) {
  const { floor } = await api.patch<{ floor: Floor }>(`/structure/floors/${floorId}`, input);
  return floor;
}

export async function createRoom(
  floorId: string,
  input: {
    code: string;
    roomType: string;
    capacity: number;
    accessibility: boolean;
    permittedPopulation?: string;
    occupancyCompatibilityRule?: string;
    safetyRestriction?: string;
  }
) {
  const { room } = await api.post<{ room: Room }>(`/structure/floors/${floorId}/rooms`, input);
  return room;
}

export async function updateRoom(
  roomId: string,
  input: Partial<{
    code: string;
    roomType: string;
    capacity: number;
    accessibility: boolean;
    permittedPopulation: string;
    occupancyCompatibilityRule: string;
    safetyRestriction: string;
  }>
) {
  const { room } = await api.patch<{ room: Room }>(`/structure/rooms/${roomId}`, input);
  return room;
}

export async function createBed(roomId: string, input: { code: string }) {
  const { bed } = await api.post<{ bed: Bed }>(`/structure/rooms/${roomId}/beds`, input);
  return bed;
}

/** flow.md §19 item 18 gap-closure, second pass — Bed was missed the first
 * time even though its `code` is exactly the same kind of plain display
 * label as Room's. bedCategory added for D17.25 item 89 (TODO.md Batch 22) —
 * only takes effect while the bed is 'available' (backend-enforced). */
export async function updateBed(bedId: string, input: { code?: string; bedCategory?: 'resident' | 'guest_short_stay' }) {
  const { bed } = await api.patch<{ bed: Bed }>(`/structure/beds/${bedId}`, input);
  return bed;
}

export async function updateBedStatus(
  bedId: string,
  input: { status: 'available' | 'blocked' | 'maintenance'; reason: string; reviewDate?: string }
) {
  const { bed } = await api.patch<{ bed: Bed }>(`/structure/beds/${bedId}/status`, input);
  return bed;
}

/** flow.md §19 item 18 gap-closure — same story as updateHostel above:
 * backend endpoint existed since Batch 1, no frontend caller until now.
 * D17.01 item 43 widened `status` to the shared four-state lifecycle;
 * `reason` is required by the backend for any non-'active' target. */
export async function updateRoomStatus(
  roomId: string,
  status: LifecycleStatus,
  reason?: string,
  reviewDate?: string,
  statusReasonCategory?: 'safety' | 'maintenance' | 'policy' | 'other'
) {
  const { room } = await api.patch<{ room: Room }>(`/structure/rooms/${roomId}/status`, { status, reason, reviewDate, statusReasonCategory });
  return room;
}
