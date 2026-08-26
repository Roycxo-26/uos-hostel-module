export type MovementType = 'gate_pass' | 'leave';
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
  created_at: Date;
}
