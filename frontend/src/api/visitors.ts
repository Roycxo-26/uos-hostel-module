import { api } from './client';
import type { ShiftHandover, VisitorCategory, VisitorHostType, VisitorRequest } from '../types';

export interface VisitorRequestInput {
  hostType?: VisitorHostType;
  visitorName: string;
  visitorPhone: string;
  visitorPhotoUrl?: string;
  visitorIdReference?: string;
  visitorCategory?: VisitorCategory;
  purpose: string;
  requestedVisitStart: string;
  requestedVisitEnd: string;
  approvedZoneScope?: string;
  emergencyContact?: string;
}

export async function requestVisitor(input: VisitorRequestInput) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>('/visitors', input);
  return visitor;
}

export async function listVisitorRequests(filters: { status?: string; hostUserId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { visitors } = await api.get<{ visitors: VisitorRequest[] }>(`/visitors${params ? `?${params}` : ''}`);
  return visitors;
}

export async function getVisitorRequest(id: string) {
  const { visitor } = await api.get<{ visitor: VisitorRequest }>(`/visitors/${id}`);
  return visitor;
}

export async function getShiftHandover() {
  return api.get<ShiftHandover>('/visitors/shift-handover');
}

export async function decideVisitorRequest(id: string, decision: 'approved' | 'denied' | 'returned_for_information', reason: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/decide`, { decision, reason });
  return visitor;
}

export async function resubmitVisitorRequest(id: string, input: VisitorRequestInput) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/resubmit`, input);
  return visitor;
}

export async function cancelVisitorRequest(id: string, reason: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/cancel`, { reason });
  return visitor;
}

export async function recordVisitorEntry(id: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/enter`, {});
  return visitor;
}

export async function recordVisitorExit(id: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/exit`, {});
  return visitor;
}

export async function closeVisitorRequest(id: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/close`, {});
  return visitor;
}

export async function reopenVisitorRequest(id: string, reason: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/reopen`, { reason });
  return visitor;
}

export async function hotlistCredential(id: string, reason: string) {
  const { visitor } = await api.post<{ visitor: VisitorRequest }>(`/visitors/${id}/hotlist`, { reason });
  return visitor;
}
