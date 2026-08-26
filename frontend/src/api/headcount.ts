import { api } from './client';
import type { HeadcountEntry, HeadcountScopeType, HeadcountSession } from '../types';

export async function listSessions(filters: { scopeType?: string; scopeId?: string; status?: string } = {}) {
  const params = new URLSearchParams(filters as Record<string, string>).toString();
  const { sessions } = await api.get<{ sessions: HeadcountSession[] }>(`/headcount/sessions${params ? `?${params}` : ''}`);
  return sessions;
}

export async function getSession(id: string) {
  const { session } = await api.get<{ session: HeadcountSession }>(`/headcount/sessions/${id}`);
  return session;
}

export async function openSession(input: { scopeType: HeadcountScopeType; scopeId: string; sessionDate?: string }) {
  const { session } = await api.post<{ session: HeadcountSession }>('/headcount/sessions', input);
  return session;
}

export async function markEntry(sessionId: string, input: { studentId: string; status: 'present' | 'missing'; note?: string }) {
  const { entry } = await api.post<{ entry: HeadcountEntry }>(`/headcount/sessions/${sessionId}/entries`, input);
  return entry;
}

export async function closeSession(id: string) {
  const { session } = await api.post<{ session: HeadcountSession }>(`/headcount/sessions/${id}/close`, {});
  return session;
}

export async function listOpenIssues() {
  const { issues } = await api.get<{
    issues: Array<{ id: string; studentId: string; status: string; note: string | null; sessionId: string; scopeType: string; scopeId: string; sessionDate: string }>;
  }>('/headcount/sessions/reconciliation');
  return issues;
}
