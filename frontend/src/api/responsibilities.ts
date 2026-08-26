import { api } from './client';

// D17.22 item 83 (TODO.md Batch 21) — five duty-roster roles added on top
// of this same type, not a parallel one.
export type PrivilegeType =
  | 'attendance_taker'
  | 'verifier'
  | 'room_head'
  | 'floor_incharge'
  | 'duty_warden'
  | 'floor_duty_officer'
  | 'front_desk_shift'
  | 'security_contact'
  | 'emergency_contact';

export interface ResponsibilityAssignment {
  id: string;
  assigneeUserId: string;
  privilegeType: PrivilegeType;
  scopeType: 'room' | 'floor' | 'hostel';
  scopeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string;
  // UAT.md Batch 10 gap-closure — a substitute can act on this exact scope
  // exactly like the primary assignee (headcount/service.ts's
  // canActOnScope), the delegation-framework equivalent for a scoped
  // responsibility rather than a base role.
  substituteUserId: string | null;
  status: 'draft' | 'active' | 'expired' | 'revoked';
  revokeReason: string | null;
  createdAt: string;
}

export async function listAssignments(filters: { scopeType?: string; scopeId?: string }) {
  const params = new URLSearchParams(filters as Record<string, string>).toString();
  const { assignments } = await api.get<{ assignments: ResponsibilityAssignment[] }>(`/responsibilities${params ? `?${params}` : ''}`);
  return assignments;
}

export interface ResidentCandidate {
  id: string;
  name: string;
  email: string;
}

/** flow.md §19 item 15 gap-closure — real UX gap found live: "Assign to"/
 * "Substitute" asked staff to paste a raw user UUID with no way to discover
 * one anywhere in the UI. Real, named candidates instead. */
export async function listCandidates() {
  const { candidates } = await api.get<{ candidates: ResidentCandidate[] }>('/responsibilities/candidates');
  return candidates;
}

export async function assignResponsibility(input: {
  assigneeUserId: string;
  privilegeType: 'room_head' | 'floor_incharge';
  scopeType: 'room' | 'floor';
  scopeId: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  substituteUserId?: string;
}) {
  const { assignment } = await api.post<{ assignment: ResponsibilityAssignment }>('/responsibilities', input);
  return assignment;
}

export async function revokeAssignment(id: string, reason: string) {
  const { assignment } = await api.post<{ assignment: ResponsibilityAssignment }>(`/responsibilities/${id}/revoke`, { reason });
  return assignment;
}

/** UAT.md Batch 10 gap-closure — name (or clear, pass null) a substitute on
 * an already-active assignment without revoking and recreating it. */
export async function setSubstitute(id: string, substituteUserId: string | null) {
  const { assignment } = await api.post<{ assignment: ResponsibilityAssignment }>(`/responsibilities/${id}/substitute`, { substituteUserId });
  return assignment;
}
