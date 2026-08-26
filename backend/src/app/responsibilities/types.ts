// UOS HOSTEL BR.md §2 — Room Head ('room_head') and Floor/Side In-charge
// ('floor_incharge') are the two BR-driven additions. 'attendance_taker'/
// 'verifier' predate this module (migration 6) and stay reserved for the
// future Headcount module (TODO.md Batch 5).
// HOSTEL-GAP-ANALYSIS.md D17.22 item 83 (TODO.md Batch 21) — five duty-
// roster roles added on top of this same primitive, not a parallel
// table: effective_from/effective_to already model a duty window, and
// substitute_user_id already models backup/acting authority.
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

// The BRD's own escalation ladder — resolveDutyAuthority (service.ts)
// walks this in order.
export const DUTY_PRIVILEGE_TYPES: readonly PrivilegeType[] = [
  'duty_warden',
  'floor_duty_officer',
  'front_desk_shift',
  'security_contact',
  'emergency_contact',
];
export type ScopeType = 'room' | 'floor' | 'hostel';
export type ResponsibilityStatus = 'draft' | 'active' | 'expired' | 'revoked';

export interface ResponsibilityAssignment {
  id: string;
  org_id: string;
  campus_id: string;
  assignee_user_id: string;
  privilege_type: PrivilegeType;
  scope_type: ScopeType;
  scope_id: string;
  effective_from: Date;
  effective_to: Date | null;
  assigned_by: string;
  substitute_user_id: string | null;
  status: ResponsibilityStatus;
  revoke_reason: string | null;
  created_at: Date;
}
