// HOSTEL-GAP-ANALYSIS.md D17.21 (TODO.md Batch 20).

export type GrievanceScope =
  | 'allocation'
  | 'waitlist'
  | 'transfer'
  | 'staff_behaviour'
  | 'service_quality'
  | 'privacy_room_entry'
  | 'damage_assessment'
  | 'fee_charge'
  | 'safety_sanitation'
  | 'accessibility'
  | 'retaliation'
  | 'other';

export type GrievanceStatus =
  | 'submitted'
  | 'under_review'
  | 'returned_for_information'
  | 'decision_issued'
  | 'appeal_submitted'
  | 'independent_review'
  | 'final_decision'
  | 'resolved'
  | 'closed'
  | 'reopened'
  | 'withdrawn';

export interface Grievance {
  id: string;
  org_id: string;
  campus_id: string;
  raised_by: string;
  scope: GrievanceScope;
  subject_user_id: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  description: string;
  status: GrievanceStatus;
  assigned_reviewer: string | null;
  information_request_notes: string | null;
  interim_action_notes: string | null;
  referred_to: string | null;
  decision_reason: string | null;
  remedy_notes: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  appeal_reason: string | null;
  appeal_submitted_at: Date | null;
  independent_reviewer: string | null;
  final_decision_reason: string | null;
  final_decided_by: string | null;
  final_decided_at: Date | null;
  remediation_notes: string | null;
  reopen_reason: string | null;
  created_at: Date;
}

export interface PolicyVersion {
  id: string;
  org_id: string;
  campus_id: string;
  document_key: string;
  version: string;
  content_hash: string | null;
  title: string;
  mandatory: boolean;
  published_by: string | null;
  published_at: Date;
  re_ack_deadline: string | null;
}

export type AcknowledgementState = 'pending' | 'accepted' | 'declined';

export interface PolicyAcknowledgement {
  id: string;
  org_id: string;
  campus_id: string;
  policy_version_id: string;
  student_id: string;
  presented_at: Date;
  viewed_at: Date | null;
  state: AcknowledgementState;
  signature_method: string | null;
  acknowledged_at: Date | null;
  decline_reason: string | null;
}
