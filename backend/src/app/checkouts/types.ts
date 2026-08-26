export type CheckoutStatus = 'requested' | 'inspected' | 'completed' | 'cancelled';

export interface Checkout {
  id: string;
  org_id: string;
  campus_id: string;
  student_id: string;
  allocation_id: string;
  bed_id: string;
  reason: string;
  status: CheckoutStatus;
  inspection_notes: string | null;
  damage_found: boolean;
  damage_charge_amount: string | null;
  damage_description: string | null;
  damage_disputed: boolean;
  dispute_reason: string | null;
  desk_cleared: boolean;
  finance_cleared: boolean;
  override_reason: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  bed_outcome: 'available' | 'blocked' | null;
  created_at: Date;
}
