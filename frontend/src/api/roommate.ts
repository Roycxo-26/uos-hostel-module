import { api } from './client';

export type RoommateRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export interface RoommateRequest {
  id: string;
  requestingStudentId: string;
  requestedStudentId: string;
  term: string;
  message: string | null;
  status: RoommateRequestStatus;
  expiresAt: string;
  respondedAt: string | null;
  declineReason: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CompatibilityRecommendation {
  hasMutualMatch: boolean;
  roommateRequestId: string | null;
  otherStudentId: string | null;
  term: string | null;
}

export async function requestRoommate(requestedStudentId: string, term: string, message?: string) {
  const { request } = await api.post<{ request: RoommateRequest }>('/roommate/requests', { requestedStudentId, term, message });
  return request;
}

export async function listMyRequests(status?: string) {
  const { requests } = await api.get<{ requests: RoommateRequest[] }>(`/roommate/requests${status ? `?status=${status}` : ''}`);
  return requests;
}

export async function listAllRequests(filters: { status?: string; studentId?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const { requests } = await api.get<{ requests: RoommateRequest[] }>(`/roommate/requests/all${params ? `?${params}` : ''}`);
  return requests;
}

export async function getRequest(id: string) {
  const { request } = await api.get<{ request: RoommateRequest }>(`/roommate/requests/${id}`);
  return request;
}

export async function respondToRequest(id: string, decision: 'accepted' | 'declined', reason?: string) {
  const { request } = await api.post<{ request: RoommateRequest }>(`/roommate/requests/${id}/respond`, { decision, reason });
  return request;
}

export async function revokeRequest(id: string, reason: string) {
  const { request } = await api.post<{ request: RoommateRequest }>(`/roommate/requests/${id}/revoke`, { reason });
  return request;
}

export async function getCompatibilityRecommendation(studentId: string, term: string) {
  return api.get<CompatibilityRecommendation>(`/roommate/compatibility/${studentId}?term=${encodeURIComponent(term)}`);
}
