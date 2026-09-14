import { api } from './client';

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  // UOS_Final.docx audit (12 Sep 2026) — real gap: the backend has always
  // returned these two (repository.ts's `list` is a plain SELECT *, no
  // column list to keep in sync), this type just never declared them, so
  // Reports.tsx never rendered what was already coming back on every row.
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
}

export async function listAuditLog(filters: { entityType?: string; action?: string; limit?: number } = {}) {
  const params = new URLSearchParams(filters as unknown as Record<string, string>).toString();
  const { entries } = await api.get<{ entries: AuditEntry[] }>(`/audit${params ? `?${params}` : ''}`);
  return entries;
}
