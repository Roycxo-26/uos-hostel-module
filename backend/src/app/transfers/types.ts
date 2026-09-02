export type TransferStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export type TransferType = 'normal' | 'emergency';

// D17.07 depth (TODO.md Batch 25) — the BRD's own change-type list, minus
// the ones that went to the new resident_privilege_changes table instead
// (see the migration's own comment). Purely descriptive/reporting — it
// never changes which approval authority (transfer_type) applies.
export type ChangeCategory =
  | 'bed_change'
  | 'room_change'
  | 'floor_wing_block_transfer'
  | 'hostel_to_hostel_transfer'
  | 'campus_to_campus_transfer'
  | 'temporary_maintenance_relocation'
  | 'accessibility_accommodation_move'
  | 'safety_welfare_emergency_move'
  | 'conflict_resolution_move'
  | 'administrative_reassignment'
  | 'resident_requested_voluntary_move'
  | 'extension_of_stay'
  | 'early_termination';

export interface TransferRequest {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  current_allocation_id: string;
  old_bed_id: string;
  new_bed_id: string | null;
  new_allocation_id: string | null;
  reason: string;
  transfer_type: TransferType;
  retrospective_review_deadline: Date | null;
  status: TransferStatus;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  executed_by: string | null;
  executed_at: Date | null;
  old_room_inspection_notes: string | null;
  old_bed_outcome: 'available' | 'blocked' | null;
  // BR §7 round-trip temporary relocation (UAT.md Batch 10 gap-closure) —
  // is_temporary opts an emergency transfer into the auto-restore sweep;
  // retrospective_review_deadline doubles as the return-due date.
  is_temporary: boolean;
  restored_at: Date | null;
  restore_transfer_id: string | null;
  restoration_blocked_at: Date | null;
  // D17.07 items 101/102.
  destination_campus_id: string | null;
  destination_accepted_by: string | null;
  destination_accepted_at: Date | null;
  credential_remapping_notes: string | null;
  change_category: ChangeCategory | null;
  created_at: Date;
}
