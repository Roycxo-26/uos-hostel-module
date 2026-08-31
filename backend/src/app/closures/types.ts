// HOSTEL-GAP-ANALYSIS.md D17.25 (TODO.md Batch 22).

export type ClosureCaseType = 'shutdown' | 'mass_relocation';
export type ClosureScopeType = 'room' | 'floor' | 'hostel';
export type ClosureReasonCategory =
  | 'semester_vacation'
  | 'maintenance_renovation'
  | 'safety'
  | 'pest_treatment'
  | 'low_occupancy_consolidation'
  | 'emergency'
  | 'event_operational'
  | 'water_sanitation_failure'
  | 'structural_work'
  | 'disaster';

export type ClosureCaseStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'active_closure'
  | 'reopening_planned'
  | 'reopened'
  | 'completed'
  | 'cancelled';

export interface ReopeningChecklistItem {
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
}

export type ReopeningChecklist = Record<string, ReopeningChecklistItem>;

export interface ClosureCase {
  id: string;
  org_id: string;
  campus_id: string;
  hostel_id: string;
  case_type: ClosureCaseType;
  scope_type: ClosureScopeType;
  scope_id: string;
  reason_category: ClosureReasonCategory;
  reason_notes: string | null;
  status: ClosureCaseStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: Date | null;
  actual_end_date: Date | null;
  exception_policy: string | null;
  reopening_checklist: ReopeningChecklist | null;
  proposed_by: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export type ClosureImpactOutcome = 'pending' | 'relocated' | 'checked_out' | 'on_leave' | 'exception_no_destination';

export interface ClosureCaseImpact {
  id: string;
  closure_case_id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  allocation_id: string | null;
  source_bed_id: string | null;
  outcome: ClosureImpactOutcome;
  destination_bed_id: string | null;
  new_allocation_id: string | null;
  notes: string | null;
  reconciled_at: Date | null;
  reconciled_by: string | null;
  created_at: Date;
  updated_at: Date;
}
