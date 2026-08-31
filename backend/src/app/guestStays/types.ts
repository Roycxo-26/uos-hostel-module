// HOSTEL-GAP-ANALYSIS.md D17.25 (TODO.md Batch 22, item 89).

export type GuestType = 'parent' | 'visiting_faculty' | 'other';
export type GuestStayStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled';

export interface GuestStay {
  id: string;
  org_id: string;
  campus_id: string;
  bed_id: string;
  guest_name: string;
  guest_type: GuestType;
  host_reference: string | null;
  purpose: string | null;
  arrival_date: string;
  departure_date: string | null;
  identity_verified: boolean;
  fee_reference: string | null;
  key_reference: string | null;
  meal_entitlement: string | null;
  policy_acknowledged: boolean;
  status: GuestStayStatus;
  checkout_notes: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}
