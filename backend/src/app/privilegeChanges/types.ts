// D17.07 item 100 (TODO.md Batch 25).

export type PrivilegeChangeType = 'access_zone' | 'visitor_hosting' | 'outpass_rule_profile' | 'mess_entitlement' | 'temporary_access' | 'hostel_privilege_status';
export type PrivilegeChangeAction = 'grant' | 'restrict' | 'suspend' | 'restore';
export type PrivilegeChangeStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'reversed';

export interface ResidentPrivilegeChange {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  privilege_type: PrivilegeChangeType;
  action: PrivilegeChangeAction;
  previous_configuration: Record<string, unknown> | null;
  proposed_configuration: Record<string, unknown>;
  effective_from: Date;
  effective_to: Date | null;
  initiator_user_id: string;
  reason: string;
  status: PrivilegeChangeStatus;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  resident_acknowledged_at: Date | null;
  linked_reference_type: string | null;
  linked_reference_id: string | null;
  superseded_by: string | null;
  created_at: Date;
}
