import { api } from './client';
import type { ApproverDelegation, DelegatableEntityType, DelegatableRole } from '../types';

// UOS_Final.docx audit (12 Sep 2026) §6.4 — the missing create/list/revoke
// client for hostel.approver_delegations. See backend/src/app/delegations
// for the server side; utils/approvalResolution.ts's authorizeApproval is
// what actually honours a delegation once one exists.

export async function createDelegation(input: {
  campusId: string;
  role: DelegatableRole;
  delegateUserId: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  exclusions?: DelegatableEntityType[];
}) {
  const { delegation } = await api.post<{ delegation: ApproverDelegation }>('/delegations', input);
  return delegation;
}

export async function listDelegations(filters?: { campusId?: string; role?: DelegatableRole; active?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.campusId) params.set('campusId', filters.campusId);
  if (filters?.role) params.set('role', filters.role);
  if (filters?.active !== undefined) params.set('active', String(filters.active));
  const qs = params.toString();
  const { delegations } = await api.get<{ delegations: ApproverDelegation[] }>(`/delegations${qs ? `?${qs}` : ''}`);
  return delegations;
}

export async function listDelegationCandidates(campusId: string) {
  const { candidates } = await api.get<{ candidates: { id: string; role: DelegatableRole; name: string; email: string }[] }>(
    `/delegations/candidates?campusId=${campusId}`
  );
  return candidates;
}

export async function revokeDelegation(id: string, reason: string) {
  const { delegation } = await api.post<{ delegation: ApproverDelegation }>(`/delegations/${id}/revoke`, { reason });
  return delegation;
}
