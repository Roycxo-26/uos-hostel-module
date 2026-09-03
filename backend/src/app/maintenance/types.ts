// HOSTEL-GAP-ANALYSIS.md D17.08 (TODO.md Batch 29). "HOSTEL - v.1.md" §16.

export type MaintenanceCategory =
  | 'electrical'
  | 'plumbing'
  | 'water_supply'
  | 'furniture'
  | 'room_appliance'
  | 'washroom'
  | 'housekeeping'
  | 'pest_control'
  | 'internet_it'
  | 'security'
  | 'access_credential'
  | 'food_mess_service'
  | 'safety_emergency'
  | 'common_area_issue'
  | 'other';

export type MaintenancePriority = 'low' | 'normal' | 'high' | 'critical';

// §16.5's own state list, minus a separate DRAFT/UNDER_REVIEW split (same
// simplification reasoning as visitors/types.ts) — 12 stored states.
export type MaintenanceTicketStatus =
  | 'reported'
  | 'pending_verification'
  | 'returned_for_information'
  | 'rejected'
  | 'verified'
  | 'emergency_routed'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'reopened'
  | 'cancelled';

export interface MaintenanceTicket {
  id: string;
  org_id: string;
  campus_id: string;
  room_id: string | null;
  location_note: string | null;
  raised_by: string;
  category: MaintenanceCategory;
  description: string;
  priority: MaintenancePriority;
  is_emergency: boolean;
  evidence_photo_url: string | null;
  status: MaintenanceTicketStatus;
  verification_required: boolean;
  verifier_user_id: string | null;
  verified_at: Date | null;
  verification_decision: 'approved' | 'returned' | 'rejected' | null;
  verification_reason: string | null;
  duplicate_of_ticket_id: string | null;
  assigned_to_user_id: string | null;
  assigned_to_provider: string | null;
  manual_external_reference: string | null;
  due_date: string | null;
  resolution_notes: string | null;
  resolution_evidence_url: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  resident_confirmed_at: Date | null;
  reopen_reason: string | null;
  cancelled_reason: string | null;
  is_local_fallback: boolean;
  sla_escalated_at: Date | null;
  created_at: Date;
}

// §16.5's own list, minus 'pest_control' — Batch 19's pest_control_
// treatments already models that lifecycle end to end; see the
// migration's own header comment.
export type HousekeepingTaskType = 'daily' | 'weekly' | 'monthly' | 'checkout_deep_clean';
export type HousekeepingTaskStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'rework_required' | 'cancelled';

export const HOUSEKEEPING_CHECKLIST_KEYS_BY_TYPE: Record<HousekeepingTaskType, readonly string[]> = {
  daily: ['floor_swept_mopped', 'trash_removed', 'surfaces_wiped'],
  weekly: ['deep_dusting', 'window_cleaning', 'floor_scrubbed'],
  monthly: ['deep_sanitization', 'fixture_check'],
  checkout_deep_clean: ['inventory_area_cleared', 'deep_sanitization', 'walls_inspected'],
};

export interface HousekeepingTask {
  id: string;
  org_id: string;
  campus_id: string;
  scope_type: 'room' | 'floor' | 'hostel';
  scope_id: string;
  task_type: HousekeepingTaskType;
  scheduled_date: string;
  assigned_to_user_id: string | null;
  preferred_time: string | null;
  room_entry_id: string | null;
  checklist: Record<string, { completed: boolean; completedBy?: string; completedAt?: string; notes?: string }> | null;
  status: HousekeepingTaskStatus;
  completed_at: Date | null;
  completed_by: string | null;
  missed_reason: string | null;
  rework_of_task_id: string | null;
  consumable_request_reference: string | null;
  created_at: Date;
}

// §16.6 minus 'common_area' — Batch 19's sanitation_inspections already
// scores common areas; this object covers what that one doesn't (a
// resident's own room and its attached washroom). See migration header.
export type CleanlinessAreaType = 'room' | 'washroom';
export type CleanlinessAppealStatus = 'none' | 'appealed' | 'upheld' | 'overturned';

export interface CleanlinessInspection {
  id: string;
  org_id: string;
  campus_id: string;
  area_type: CleanlinessAreaType;
  scope_id: string;
  housekeeping_task_id: string | null;
  inspector_user_id: string;
  inspected_at: Date;
  cleanliness_score: number;
  waste_segregation_ok: boolean | null;
  prohibited_accumulation_flag: boolean;
  safety_hazard_flag: boolean;
  maintenance_defect_noted: boolean;
  maintenance_defect_notes: string | null;
  energy_water_notes: string | null;
  resident_participation_notes: string | null;
  photo_url: string | null;
  resident_comments: string | null;
  correction_deadline: string | null;
  reinspection_of_id: string | null;
  appeal_status: CleanlinessAppealStatus;
  appeal_reason: string | null;
  appeal_decided_by: string | null;
  appeal_decided_at: Date | null;
  appeal_decision_reason: string | null;
  created_at: Date;
}

// ============================================================================
// §16.7 — composite room-readiness gate. Computed, not stored (item 119).
// ============================================================================

export interface RoomReadinessGates {
  physicalVacancy: boolean;
  inventoryKeyClearance: boolean;
  housekeepingComplete: boolean;
  inspectionPassed: boolean;
  safetyClear: boolean;
  maintenanceClear: boolean;
}

export interface RoomReadiness {
  ready: boolean;
  gates: RoomReadinessGates;
  /** §16.7 also lists "Required Access Configuration Ready" — not modelled
   * in this codebase (no access-configuration concept beyond keys/room
   * entries, both already covered by other gates), named rather than
   * faked with an always-true gate. */
  notModelled: readonly string[];
}

/**
 * Pure — no db access — so it's safe for checkouts/service.ts to import
 * directly (this codebase's rule is "no service.ts imports another
 * module's service.ts", not its types.ts; same pattern finance/types.ts's
 * computeBalances already established). All the actual data-fetching
 * (across this module's own repository plus safety/repository.ts) happens
 * in the caller.
 */
export function computeRoomReadiness(gates: RoomReadinessGates): RoomReadiness {
  return {
    ready: Object.values(gates).every(Boolean),
    gates,
    notModelled: ['requiredAccessConfigurationReady'],
  };
}
