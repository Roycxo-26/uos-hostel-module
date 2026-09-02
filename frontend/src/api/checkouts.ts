import { api } from './client';
import type { Checkout, CheckoutInventoryItem, CheckoutContactAttempt, CheckoutStatus, CheckoutType } from '../types';

export async function listCheckouts(status?: CheckoutStatus) {
  const { checkouts } = await api.get<{ checkouts: Checkout[] }>(`/checkouts${status ? `?status=${status}` : ''}`);
  return checkouts;
}

export async function getCheckout(id: string) {
  const { checkout } = await api.get<{ checkout: Checkout }>(`/checkouts/${id}`);
  return checkout;
}

export async function requestCheckout(input: { studentId?: string; reason: string; checkoutType?: CheckoutType }) {
  const { checkout } = await api.post<{ checkout: Checkout }>('/checkouts', input);
  return checkout;
}

export async function inspectCheckout(id: string, input: { inspectionNotes?: string; damageFound: boolean; damageChargeAmount?: number; damageDescription?: string }) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/inspect`, input);
  return checkout;
}

export async function disputeDamage(id: string, disputeReason: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/dispute-damage`, { disputeReason });
  return checkout;
}

export async function recordClearance(id: string, input: { deskCleared?: boolean; financeCleared?: boolean }) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/record-clearance`, input);
  return checkout;
}

// D17.12 item 103.
export async function updatePrerequisiteChecklist(id: string, key: string, completed: boolean, notes?: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/prerequisite-checklist`, { key, completed, notes });
  return checkout;
}

// D17.12 item 104 — the three new milestones.
export async function recordItemReturn(id: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/verify-item-return`, {});
  return checkout;
}
export async function finalizeDamageAssessment(id: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/finalize-damage-assessment`, {});
  return checkout;
}
export async function markRoomReadyForReuse(id: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/mark-room-ready`, {});
  return checkout;
}

// D17.12 item 106.
export async function recordContactAttempt(id: string, input: { method: 'call' | 'email' | 'sms' | 'in_person'; outcome: 'no_response' | 'invalid_contact' | 'reached'; notes?: string }) {
  const { attempt } = await api.post<{ attempt: CheckoutContactAttempt }>(`/checkouts/${id}/contact-attempts`, input);
  return attempt;
}

// D17.12 item 107.
export async function addCheckoutInventoryItem(
  id: string,
  input: {
    checkinItemId?: string;
    itemName: string;
    itemCategory?: string;
    conditionAtCheckout?: string;
    classification?: string;
    photoUrl?: string;
    officerNotes?: string;
    chargeAmount?: number;
  }
) {
  const { item } = await api.post<{ item: CheckoutInventoryItem }>(`/checkouts/${id}/inventory-items`, input);
  return item;
}

export async function approveCheckout(id: string, input: { overrideReason?: string; bedOutcome: 'available' | 'blocked' }) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/approve`, input);
  return checkout;
}

export async function cancelCheckout(id: string, reason: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/cancel`, { reason });
  return checkout;
}

// D17.12 item 105.
export async function reopenCheckout(id: string, reopenReason: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/reopen`, { reopenReason });
  return checkout;
}
