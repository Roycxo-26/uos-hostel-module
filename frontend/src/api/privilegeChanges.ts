import { api } from './client';
import type { PrivilegeChangeAction, PrivilegeChangeStatus, PrivilegeChangeType, ResidentPrivilegeChange } from '../types';

export async function listPrivilegeChanges(filters?: { studentId?: string; status?: PrivilegeChangeStatus }) {
  const params = new URLSearchParams();
  if (filters?.studentId) params.set('studentId', filters.studentId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const { privilegeChanges } = await api.get<{ privilegeChanges: ResidentPrivilegeChange[] }>(`/privilege-changes${qs ? `?${qs}` : ''}`);
  return privilegeChanges;
}

export async function getPrivilegeChange(id: string) {
  const { privilegeChange } = await api.get<{ privilegeChange: ResidentPrivilegeChange }>(`/privilege-changes/${id}`);
  return privilegeChange;
}

export async function requestPrivilegeChange(input: {
  studentId: string;
  privilegeType: PrivilegeChangeType;
  action: PrivilegeChangeAction;
  proposedConfiguration: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
}) {
  const { privilegeChange } = await api.post<{ privilegeChange: ResidentPrivilegeChange }>('/privilege-changes', input);
  return privilegeChange;
}

export async function decidePrivilegeChange(id: string, decision: 'approved' | 'rejected', reason: string) {
  const { privilegeChange } = await api.post<{ privilegeChange: ResidentPrivilegeChange }>(`/privilege-changes/${id}/decide`, { decision, reason });
  return privilegeChange;
}

export async function acknowledgePrivilegeChange(id: string) {
  const { privilegeChange } = await api.post<{ privilegeChange: ResidentPrivilegeChange }>(`/privilege-changes/${id}/acknowledge`, {});
  return privilegeChange;
}

export async function reversePrivilegeChange(id: string, proposedConfiguration: Record<string, unknown>, reason: string) {
  const { privilegeChange } = await api.post<{ privilegeChange: ResidentPrivilegeChange }>(`/privilege-changes/${id}/reverse`, { proposedConfiguration, reason });
  return privilegeChange;
}

export async function cancelPrivilegeChange(id: string, reason: string) {
  const { privilegeChange } = await api.post<{ privilegeChange: ResidentPrivilegeChange }>(`/privilege-changes/${id}/cancel`, { reason });
  return privilegeChange;
}
