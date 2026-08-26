import { api } from './client';
import type { Checkout, CheckoutStatus } from '../types';

export async function listCheckouts(status?: CheckoutStatus) {
  const { checkouts } = await api.get<{ checkouts: Checkout[] }>(`/checkouts${status ? `?status=${status}` : ''}`);
  return checkouts;
}

export async function getCheckout(id: string) {
  const { checkout } = await api.get<{ checkout: Checkout }>(`/checkouts/${id}`);
  return checkout;
}

export async function requestCheckout(input: { studentId?: string; reason: string }) {
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

export async function approveCheckout(id: string, input: { overrideReason?: string; bedOutcome: 'available' | 'blocked' }) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/approve`, input);
  return checkout;
}

export async function cancelCheckout(id: string, reason: string) {
  const { checkout } = await api.post<{ checkout: Checkout }>(`/checkouts/${id}/cancel`, { reason });
  return checkout;
}
