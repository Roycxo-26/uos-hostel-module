import { api } from './client';
import type { ClosureCase, ClosureCaseImpact, ClosureCaseType, ClosureReasonCategory, ClosureScopeType } from '../types';

// D17.25 (TODO.md Batch 22).
export async function createClosureCase(input: {
  hostelId: string;
  caseType: ClosureCaseType;
  scopeType: ClosureScopeType;
  scopeId: string;
  reasonCategory: ClosureReasonCategory;
  reasonNotes?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  exceptionPolicy?: string;
}) {
  const { closureCase } = await api.post<{ closureCase: ClosureCase }>('/closures', input);
  return closureCase;
}

export async function listClosureCases(filters?: { hostelId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.hostelId) params.set('hostelId', filters.hostelId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const { closureCases } = await api.get<{ closureCases: ClosureCase[] }>(`/closures${qs ? `?${qs}` : ''}`);
  return closureCases;
}

export async function getClosureCase(id: string) {
  const { closureCase } = await api.get<{ closureCase: ClosureCase }>(`/closures/${id}`);
  return closureCase;
}

export async function decideClosureCase(id: string, decision: 'approved' | 'rejected', reason: string) {
  const { closureCase } = await api.post<{ closureCase: ClosureCase }>(`/closures/${id}/decide`, { decision, reason });
  return closureCase;
}

export async function startClosureCase(id: string) {
  const { closureCase } = await api.post<{ closureCase: ClosureCase }>(`/closures/${id}/start`, {});
  return closureCase;
}

export async function addManualImpact(id: string, studentId: string) {
  const { impact } = await api.post<{ impact: ClosureCaseImpact }>(`/closures/${id}/impacts`, { studentId });
  return impact;
}

export async function resolveImpact(
  impactId: string,
  input: { outcome: 'relocated' | 'checked_out' | 'on_leave' | 'exception_no_destination'; destinationBedId?: string; notes?: string }
) {
  const { impact } = await api.post<{ impact: ClosureCaseImpact }>(`/closures/impacts/${impactId}/resolve`, input);
  return impact;
}

export async function updateReopeningChecklist(id: string, key: string, completed: boolean, notes?: string) {
  const { closureCase } = await api.post<{ closureCase: ClosureCase }>(`/closures/${id}/reopening-checklist`, { key, completed, notes });
  return closureCase;
}

export async function completeClosureCase(id: string) {
  const { closureCase } = await api.post<{ closureCase: ClosureCase }>(`/closures/${id}/complete`, {});
  return closureCase;
}

export async function cancelClosureCase(id: string, reason: string) {
  const { closureCase } = await api.post<{ closureCase: ClosureCase }>(`/closures/${id}/cancel`, { reason });
  return closureCase;
}
