import { api } from './client';
import type { AnomalyType, PresenceStatus, VerificationEntry, VerificationSession, VerificationType } from '../types';

export async function openSession(input: {
  scopeType: 'room' | 'floor' | 'hostel';
  scopeId: string;
  verificationType: VerificationType;
  sessionDate?: string;
  notes?: string;
}) {
  const { session } = await api.post<{ session: VerificationSession }>('/occupancy-verification/sessions', input);
  return session;
}

export async function listSessions(filters?: { status?: string; scopeType?: string; scopeId?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.scopeType) params.set('scopeType', filters.scopeType);
  if (filters?.scopeId) params.set('scopeId', filters.scopeId);
  const qs = params.toString();
  const { sessions } = await api.get<{ sessions: VerificationSession[] }>(`/occupancy-verification/sessions${qs ? `?${qs}` : ''}`);
  return sessions;
}

export async function getSession(id: string) {
  const { session } = await api.get<{ session: VerificationSession }>(`/occupancy-verification/sessions/${id}`);
  return session;
}

export async function listUnresolvedMismatches() {
  const { entries } = await api.get<{ entries: VerificationEntry[] }>('/occupancy-verification/sessions/mismatches');
  return entries;
}

export async function markEntry(
  sessionId: string,
  input: {
    entryId: string;
    presenceStatus: PresenceStatus;
    observedBedId?: string;
    identityVerificationMethod?: string;
    anomalyType?: AnomalyType;
    unauthorisedPersonNote?: string;
    evidenceNotes?: string;
  }
) {
  const { entry } = await api.post<{ entry: VerificationEntry }>(`/occupancy-verification/sessions/${sessionId}/entries`, input);
  return entry;
}

export async function closeSession(id: string, notes?: string) {
  const { session } = await api.post<{ session: VerificationSession }>(`/occupancy-verification/sessions/${id}/close`, { notes });
  return session;
}

export async function markReferredToTransfer(entryId: string) {
  const { entry } = await api.post<{ entry: VerificationEntry }>(`/occupancy-verification/entries/${entryId}/refer-to-transfer`, {});
  return entry;
}
