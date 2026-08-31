import { api } from './client';
import type { GuestStay, GuestType } from '../types';

// D17.25 item 89 (TODO.md Batch 22).
export async function createGuestStay(input: {
  bedId: string;
  guestName: string;
  guestType: GuestType;
  hostReference?: string;
  purpose?: string;
  arrivalDate: string;
  departureDate?: string;
  feeReference?: string;
  mealEntitlement?: string;
}) {
  const { guestStay } = await api.post<{ guestStay: GuestStay }>('/guest-stays', input);
  return guestStay;
}

export async function listGuestStays(filters?: { status?: string; bedId?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bedId) params.set('bedId', filters.bedId);
  const qs = params.toString();
  const { guestStays } = await api.get<{ guestStays: GuestStay[] }>(`/guest-stays${qs ? `?${qs}` : ''}`);
  return guestStays;
}

export async function checkInGuestStay(id: string, identityVerified: boolean, keyReference?: string) {
  const { guestStay } = await api.post<{ guestStay: GuestStay }>(`/guest-stays/${id}/check-in`, { identityVerified, keyReference });
  return guestStay;
}

export async function checkOutGuestStay(id: string, notes?: string) {
  const { guestStay } = await api.post<{ guestStay: GuestStay }>(`/guest-stays/${id}/check-out`, { notes });
  return guestStay;
}

export async function cancelGuestStay(id: string, reason: string) {
  const { guestStay } = await api.post<{ guestStay: GuestStay }>(`/guest-stays/${id}/cancel`, { reason });
  return guestStay;
}
