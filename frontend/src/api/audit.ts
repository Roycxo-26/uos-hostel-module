import { api } from './client';

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export async function listAuditLog(filters: { entityType?: string; action?: string; limit?: number } = {}) {
  const params = new URLSearchParams(filters as unknown as Record<string, string>).toString();
  const { entries } = await api.get<{ entries: AuditEntry[] }>(`/audit${params ? `?${params}` : ''}`);
  return entries;
}
