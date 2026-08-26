export type TransferStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export type TransferType = 'normal' | 'emergency';

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
  created_at: Date;
}
