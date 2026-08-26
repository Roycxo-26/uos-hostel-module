export type AllocationStatus =
  | 'proposed'
  | 'bed_locked'
  | 'confirmed'
  | 'awaiting_check_in'
  | 'checked_in_active'
  | 'no_show_review'
  | 'released'
  | 'extended_hold'
  | 'transfer_pending'
  | 'checkout_pending'
  | 'ended'
  // D17.03 item 58
  | 'no_show_warning'
  | 'cancelled_by_resident'
  | 'deferred'
  | 'reassigned';

export interface Allocation {
  id: string;
  org_id: string;
  campus_id: string;
  application_id: string | null;
  student_id: string;
  bed_id: string;
  status: AllocationStatus;
  check_in_deadline: Date | null;
  approver_user_id: string | null;
  no_show_reason: string | null;
  no_show_warned_at: Date | null;
  bed_hold_id: string | null;
  created_at: Date;
}

// D17.03 item 53.
export type WaitlistStatus = 'active' | 'offered' | 'expired' | 'withdrawn' | 'fulfilled';

export interface WaitlistEntry {
  id: string;
  org_id: string;
  campus_id: string;
  application_id: string;
  student_id: string;
  hostel_id: string | null;
  priority_score: string; // numeric column — knex/pg returns as string
  status: WaitlistStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Read-model only — computed at query time (see repository.ts), never
 * stored. See migration's own comment on why a persisted rank would go
 * stale. */
export interface WaitlistEntryWithRank extends WaitlistEntry {
  rank: number;
}

// D17.03 item 54 — six BRD hold types. Only 'offer'/'accepted_offer'
// (the new Offer flow below) and 'policy_reservation' (a direct staff
// action) are actively created by this batch; 'recommendation' has no
// scoring engine to emit it yet, and 'transfer'/'emergency' remain valid
// values for Batch 25/D17.07 to adopt later rather than being retrofitted
// onto Transfer's already-working bed-lock logic here.
export type BedHoldType = 'recommendation' | 'offer' | 'accepted_offer' | 'transfer' | 'emergency' | 'policy_reservation';

export interface BedHold {
  id: string;
  org_id: string;
  campus_id: string;
  bed_id: string;
  hold_type: BedHoldType;
  reference_type: string | null;
  reference_id: string | null;
  held_by: string | null;
  reason: string | null;
  expires_at: Date | null;
  released_at: Date | null;
  created_at: Date;
}

// D17.03 item 55.
export type AllocationOfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface AllocationOffer {
  id: string;
  org_id: string;
  campus_id: string;
  application_id: string;
  student_id: string;
  bed_id: string;
  bed_hold_id: string | null;
  offered_by: string | null;
  status: AllocationOfferStatus;
  accept_deadline: Date;
  decided_at: Date | null;
  decline_reason: string | null;
  created_at: Date;
}

// D17.03 item 56 — a pure classifier, nothing persisted.
export type NoBedReason = 'NO_PHYSICAL_BED' | 'NO_COMPATIBLE_BED' | 'ALL_BEDS_HELD_OR_OCCUPIED' | 'POLICY_RESTRICTION';
