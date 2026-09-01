// D17.10 depth (TODO.md Batch 23) — twelve BRD movement types, replacing
// the original two. See the migration's own comment for what was
// deliberately left out (day outing folds into gate_pass; "unplanned
// absence reported after departure" is a genuinely different, retroactive
// shape, not forced into this forward-request type list).
export type MovementType =
  | 'gate_pass'
  | 'leave'
  | 'night_out'
  | 'weekend_leave'
  | 'vacation_leave'
  | 'academic_field_visit'
  | 'official_university_movement'
  | 'medical_leave'
  | 'emergency_leave'
  | 'extended_leave'
  | 'late_return_extension'
  | 'mass_holiday_leave';

export type MovementStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'out' | 'returned' | 'overdue';

export interface MovementRequest {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  movement_type: MovementType;
  destination: string;
  purpose: string;
  requested_out: Date;
  requested_return: Date;
  status: MovementStatus;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  actual_exit_at: Date | null;
  exit_recorded_by: string | null;
  actual_return_at: Date | null;
  return_recorded_by: string | null;
  guardian_id: string | null;
  request_version: number;
  effective_return: Date | null;
  guardian_confirmation_bypassed: boolean;
  guardian_confirmation_bypass_reason: string | null;
  escalated_30m_at: Date | null;
  escalated_3h_at: Date | null;
  escalated_12h_at: Date | null;
  created_at: Date;
}

export interface ResidentGuardian {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  name: string;
  relationship: string;
  mobile_number: string;
  is_primary: boolean;
  verified: boolean;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Date;
}

export type GuardianConfirmationMethod = 'otp' | 'call';
export type GuardianConfirmationStatus = 'pending' | 'verified' | 'declined' | 'expired' | 'failed' | 'invalidated';

export interface MovementGuardianConfirmation {
  id: string;
  org_id: string;
  campus_id: string;
  movement_request_id: string;
  request_version: number;
  method: GuardianConfirmationMethod;
  otp_code_hash: string | null;
  otp_generated_at: Date | null;
  otp_expires_at: Date | null;
  otp_attempt_count: number;
  otp_max_attempts: number;
  call_outcome: 'approve' | 'decline' | null;
  call_remark: string | null;
  call_guardian_id: string | null;
  status: GuardianConfirmationStatus;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Date;
}

export type ExtensionStatus = 'pending' | 'approved' | 'rejected';

export interface MovementExtensionRequest {
  id: string;
  org_id: string;
  campus_id: string;
  movement_request_id: string;
  requested_new_return: Date;
  reason: string;
  status: ExtensionStatus;
  guardian_confirmation_id: string | null;
  created_by: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  created_at: Date;
}
