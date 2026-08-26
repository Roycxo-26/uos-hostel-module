// HOSTEL-GAP-ANALYSIS.md D17.11 + D17.17 (TODO.md Batch 16).

export type SafetyStatus =
  | 'NOT_ASSESSED'
  | 'COMPLIANT_CURRENT'
  | 'INSPECTION_DUE'
  | 'FINDING_OPEN_NON_CRITICAL'
  | 'FINDING_OPEN_CRITICAL'
  | 'SAFETY_RESTRICTION_ACTIVE'
  | 'EVACUATION_READINESS_DEGRADED'
  | 'CERTIFICATE_EXPIRED_OR_UNKNOWN'
  | 'MANUAL_VERIFICATION_REQUIRED'
  | 'CLOSED_FOR_SAFETY';

export interface SafetyProfile {
  certificateReference?: string;
  evacuationCapacity?: number;
  fireAlarmStatusRef?: string;
  extinguisherInspectionRef?: string;
  emergencyLightingStatus?: string;
  assemblyPoints?: string[];
  emergencyContactChain?: string;
  drillFrequencyDays?: number;
  openCorrectiveActions?: string;
}

// D17.17 item 66 — 'real_emergency' shares this exact table/lifecycle with
// a planned drill rather than getting a parallel one; see the migration's
// own comment.
export type DrillType = 'planned_drill' | 'real_emergency';
export type DrillScopeType = 'room' | 'floor' | 'hostel';
export type DrillStatus = 'planned' | 'coverage_validated' | 'notified' | 'in_progress' | 'completed' | 'cancelled';

export interface EvacuationDrill {
  id: string;
  org_id: string;
  campus_id: string;
  hostel_id: string;
  drill_type: DrillType;
  scope_type: DrillScopeType;
  scope_id: string;
  status: DrillStatus;
  assembly_points: string[] | null;
  planned_date: string | null;
  opened_by: string | null;
  closed_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  findings: string | null;
  corrective_actions: Record<string, unknown> | null;
  unresolved_count: number;
  created_at: Date;
}

export type DrillEntryStatus = 'accounted_for' | 'unresolved' | 'excused_on_leave';

export interface EvacuationDrillEntry {
  id: string;
  drill_id: string;
  student_id: string;
  status: DrillEntryStatus;
  note: string | null;
  recorded_by: string | null;
  recorded_at: Date | null;
}
