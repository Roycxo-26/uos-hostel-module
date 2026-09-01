import { api } from './client';
import type { CoverageValidation, DutyPrivilegeType, DutyResolution, SafeguardingPrivilegeType } from '../types';
import type { ResponsibilityAssignment } from './responsibilities';

export async function createDutyAssignment(input: {
  assigneeUserId: string;
  privilegeType: DutyPrivilegeType;
  scopeType: 'room' | 'floor' | 'hostel';
  scopeId: string;
  effectiveFrom: string;
  effectiveTo: string;
  substituteUserId?: string;
}) {
  const { assignment } = await api.post<{ assignment: ResponsibilityAssignment }>('/responsibilities/duty', input);
  return assignment;
}

export async function getCoverageValidation(scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  return api.get<CoverageValidation>(`/responsibilities/duty/coverage?scopeType=${scopeType}&scopeId=${scopeId}`);
}

export async function resolveDutyAuthority(privilegeType: DutyPrivilegeType, scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  const { resolution } = await api.get<{ resolution: DutyResolution }>(
    `/responsibilities/duty/resolve/${privilegeType}?scopeType=${scopeType}&scopeId=${scopeId}`
  );
  return resolution;
}

// D17.09 depth (TODO.md Batch 24) — assigns a standing safeguarding role.
export async function createSafeguardingAssignment(input: {
  assigneeUserId: string;
  privilegeType: SafeguardingPrivilegeType;
  scopeId: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}) {
  const { assignment } = await api.post<{ assignment: ResponsibilityAssignment }>('/responsibilities/safeguarding', {
    ...input,
    scopeType: 'hostel',
  });
  return assignment;
}

export async function listDutyAssignments(scopeType?: string, scopeId?: string) {
  const params = new URLSearchParams();
  if (scopeType) params.set('scopeType', scopeType);
  if (scopeId) params.set('scopeId', scopeId);
  const { assignments } = await api.get<{ assignments: ResponsibilityAssignment[] }>(`/responsibilities?${params.toString()}`);
  return assignments;
}
