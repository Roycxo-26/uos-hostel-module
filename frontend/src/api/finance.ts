import { api } from './client';
import type { FinancialEvent, FinancialEventType, FinancialSummary } from '../types';

export async function listFinancialEvents(filters: { studentId?: string; status?: string; eventType?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { events } = await api.get<{ events: FinancialEvent[] }>(`/finance${params ? `?${params}` : ''}`);
  return events;
}

export async function getFinancialEvent(id: string) {
  const { event } = await api.get<{ event: FinancialEvent }>(`/finance/${id}`);
  return event;
}

export async function getResidentFinancialSummary(studentId: string) {
  return api.get<FinancialSummary>(`/finance/summary/${studentId}`);
}

export async function raiseFinancialEvent(input: {
  studentId: string;
  eventType: FinancialEventType;
  amount: number;
  description: string;
  evidenceNotes?: string;
  linkedReferenceType?: string;
  linkedReferenceId?: string;
}) {
  const { event } = await api.post<{ event: FinancialEvent }>('/finance', input);
  return event;
}

// D17.05 item 109 — the DEV-SIMULATED Finance-confirmation action. Only a
// Head Warden or a standing Finance Officer can actually call this
// successfully (enforced server-side).
export async function confirmFinancialEvent(id: string) {
  const { event } = await api.post<{ event: FinancialEvent }>(`/finance/${id}/confirm`, {});
  return event;
}

export async function disputeFinancialEvent(id: string, disputeReason: string) {
  const { event } = await api.post<{ event: FinancialEvent }>(`/finance/${id}/dispute`, { disputeReason });
  return event;
}

export async function reverseFinancialEvent(id: string, reason: string) {
  const { event } = await api.post<{ event: FinancialEvent }>(`/finance/${id}/reverse`, { reason });
  return event;
}
