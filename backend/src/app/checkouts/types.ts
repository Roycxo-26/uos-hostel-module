// D17.12 depth (TODO.md Batch 26) — five checkout types; 'abandonment' is
// staff-only, item 106's own trigger.
export type CheckoutType = 'end_of_term' | 'early_voluntary' | 'disciplinary_removal' | 'death_incapacity' | 'abandonment';
export type CheckoutStatus = 'requested' | 'inspected' | 'completed' | 'cancelled' | 'reopened';

export interface PrerequisiteChecklistItem {
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
}
export type PrerequisiteChecklist = Record<string, PrerequisiteChecklistItem>;

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
  checkout_type: CheckoutType;
  prerequisite_checklist: PrerequisiteChecklist | null;
  item_return_verified_at: Date | null;
  item_return_verified_by: string | null;
  damage_assessment_finalized_at: Date | null;
  damage_assessment_finalized_by: string | null;
  room_ready_for_reuse_at: Date | null;
  room_ready_for_reuse_by: string | null;
  reopen_reason: string | null;
  legal_waiting_period_ends_at: Date | null;
  created_at: Date;
}

export type ContactMethod = 'call' | 'email' | 'sms' | 'in_person';
export type ContactOutcome = 'no_response' | 'invalid_contact' | 'reached';

export interface CheckoutContactAttempt {
  id: string;
  checkout_id: string;
  attempted_by: string;
  attempted_at: Date;
  method: ContactMethod;
  outcome: ContactOutcome;
  notes: string | null;
}

export type ItemCondition = 'good' | 'fair' | 'damaged' | 'missing';
export type ItemClassification = 'normal_wear' | 'damage' | 'not_applicable';

export interface CheckoutInventoryItem {
  id: string;
  checkout_id: string;
  checkin_item_id: string | null;
  item_name: string;
  item_category: string;
  condition_at_checkout: ItemCondition;
  classification: ItemClassification | null;
  photo_url: string | null;
  officer_notes: string | null;
  charge_amount: string | null;
  created_at: Date;
}
