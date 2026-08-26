import { api } from './client';
import type { Allocation, AllocationOffer, AllocationStatus, BedHold, NoBedReason, WaitlistEntry } from '../types';

export async function listAllocations(status?: AllocationStatus) {
  const { allocations } = await api.get<{ allocations: Allocation[] }>(`/allocations${status ? `?status=${status}` : ''}`);
  return allocations;
}

export async function getAllocation(id: string) {
  const { allocation } = await api.get<{ allocation: Allocation }>(`/allocations/${id}`);
  return allocation;
}

export async function createAllocation(input: { applicationId: string; bedId: string }) {
  const { allocation } = await api.post<{ allocation: Allocation }>('/allocations', input);
  return allocation;
}

export async function listNoShowQueue() {
  const { allocations } = await api.get<{ allocations: Allocation[] }>('/allocations/no-show-queue');
  return allocations;
}

export async function releaseNoShow(id: string, reason: string) {
  const { allocation } = await api.post<{ allocation: Allocation }>(`/allocations/${id}/no-show/release`, { reason });
  return allocation;
}

export async function extendNoShow(id: string, reason: string, newDeadline: string) {
  const { allocation } = await api.post<{ allocation: Allocation }>(`/allocations/${id}/no-show/extend`, { reason, newDeadline });
  return allocation;
}

// D17.03 item 58.
export async function deferNoShow(id: string, reason: string) {
  const { allocation } = await api.post<{ allocation: Allocation }>(`/allocations/${id}/no-show/defer`, { reason });
  return allocation;
}

export async function reassignNoShow(id: string, newApplicationId: string) {
  const { offer } = await api.post<{ offer: AllocationOffer }>(`/allocations/${id}/no-show/reassign`, { newApplicationId });
  return offer;
}

export async function cancelAllocation(id: string) {
  const { allocation } = await api.post<{ allocation: Allocation }>(`/allocations/${id}/cancel`, {});
  return allocation;
}

// D17.03 item 53 — Waitlist.

export async function listWaitlist(filters?: { hostelId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.hostelId) params.set('hostelId', filters.hostelId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const { waitlist } = await api.get<{ waitlist: WaitlistEntry[] }>(`/allocations/waitlist${qs ? `?${qs}` : ''}`);
  return waitlist;
}

export async function getMyWaitlistPosition() {
  const { position } = await api.get<{ position: WaitlistEntry | null }>('/allocations/waitlist/mine');
  return position;
}

export async function updateWaitlistPriority(entryId: string, priorityScore: number, notes?: string) {
  const { entry } = await api.patch<{ entry: WaitlistEntry }>(`/allocations/waitlist/${entryId}/priority`, { priorityScore, notes });
  return entry;
}

export async function withdrawFromWaitlist(entryId: string) {
  const { entry } = await api.post<{ entry: WaitlistEntry }>(`/allocations/waitlist/${entryId}/withdraw`, {});
  return entry;
}

// D17.03 item 54 — Bed holds.

export async function reserveBed(input: { bedId: string; reason: string; expiresAt?: string }) {
  const { hold } = await api.post<{ hold: BedHold }>('/allocations/bed-holds', input);
  return hold;
}

export async function releaseBedHold(holdId: string) {
  const { hold } = await api.post<{ hold: BedHold }>(`/allocations/bed-holds/${holdId}/release`, {});
  return hold;
}

// D17.03 item 56.

export async function getNoBedReason(applicationId: string) {
  return api.get<{ reason: NoBedReason; message: string }>(`/allocations/no-bed-reason/${applicationId}`);
}

// D17.03 item 55 — Allocation offers.

export async function createOffer(input: { applicationId: string; bedId: string; acceptDeadlineHours?: number }) {
  const { offer } = await api.post<{ offer: AllocationOffer }>('/allocations/offers', input);
  return offer;
}

export async function listOffers(status?: string) {
  const { offers } = await api.get<{ offers: AllocationOffer[] }>(`/allocations/offers${status ? `?status=${status}` : ''}`);
  return offers;
}

export async function acceptOffer(offerId: string) {
  return api.post<{ offer: AllocationOffer; allocation: Allocation }>(`/allocations/offers/${offerId}/accept`, {});
}

export async function declineOffer(offerId: string, reason: string) {
  const { offer } = await api.post<{ offer: AllocationOffer }>(`/allocations/offers/${offerId}/decline`, { reason });
  return offer;
}

export async function withdrawOffer(offerId: string, reason: string) {
  const { offer } = await api.post<{ offer: AllocationOffer }>(`/allocations/offers/${offerId}/withdraw`, { reason });
  return offer;
}
