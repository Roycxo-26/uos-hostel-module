import { api } from './client';
import type { LaundryOrder, LaundryServiceType } from '../types';

export async function requestOrder(input: {
  studentId?: string;
  serviceType: LaundryServiceType;
  pickupDropLocation?: string;
  bagTokenId?: string;
  requestedPickupAt?: string;
  itemCategories?: string[];
}) {
  const { order } = await api.post<{ order: LaundryOrder }>('/laundry', input);
  return order;
}

export async function listOrders(filters: { status?: string; studentId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { orders } = await api.get<{ orders: LaundryOrder[] }>(`/laundry${params ? `?${params}` : ''}`);
  return orders;
}

export async function getOrder(id: string) {
  const { order } = await api.get<{ order: LaundryOrder }>(`/laundry/${id}`);
  return order;
}

export async function acceptOrder(id: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/accept`, {});
  return order;
}

export async function recordPickup(id: string, input: { pickupCount: number; pickupWeight?: number; conditionExceptionsAtHandoff?: string; bagTokenId?: string; providerReference?: string }) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/pickup`, input);
  return order;
}

export async function startProcessing(id: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/start-processing`, {});
  return order;
}

export async function markReadyForReturn(id: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/ready`, {});
  return order;
}

export async function recordReturn(id: string, returnedCount: number, returnedConditionNotes?: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/return`, { returnedCount, returnedConditionNotes });
  return order;
}

export async function acknowledgeReturn(id: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/acknowledge`, {});
  return order;
}

export async function closeOrder(id: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/close`, {});
  return order;
}

export async function disputeCount(id: string, reason: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/dispute-count`, { reason });
  return order;
}

export async function reportLostItem(id: string, reason: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/report-lost`, { reason });
  return order;
}

export async function reportDamagedItem(id: string, reason: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/report-damaged`, { reason });
  return order;
}

export async function resolveException(id: string, outcome: 'resolved_forward' | 'resolved_cancelled', notes: string, compensationAmount?: number) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/resolve-exception`, { outcome, notes, compensationAmount });
  return order;
}

export async function markUnclaimed(id: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/mark-unclaimed`, {});
  return order;
}

export async function cancelOrder(id: string, reason: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/cancel`, { reason });
  return order;
}

export async function reopenOrder(id: string, reason: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/reopen`, { reason });
  return order;
}

export async function linkComplaint(id: string, complaintReference: string) {
  const { order } = await api.post<{ order: LaundryOrder }>(`/laundry/${id}/link-complaint`, { complaintReference });
  return order;
}
