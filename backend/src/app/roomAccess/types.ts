// HOSTEL-GAP-ANALYSIS.md D17.20 (TODO.md Batch 18).

export type RoomEntryPurpose =
  | 'scheduled_housekeeping'
  | 'scheduled_inspection'
  | 'maintenance'
  | 'welfare_check'
  | 'security_investigation'
  | 'emergency'
  | 'pest_treatment'
  | 'checkout_abandonment'
  | 'asset_utility_inspection'
  | 'legal_audit';

export type RoomEntryStatus = 'requested' | 'approved' | 'notified' | 'entered' | 'completed' | 'cancelled';

export interface RoomEntry {
  id: string;
  org_id: string;
  campus_id: string;
  room_id: string;
  purpose: RoomEntryPurpose;
  status: RoomEntryStatus;
  requested_by: string | null;
  approved_by: string | null;
  notice_given: boolean;
  consent_given: boolean | null;
  emergency_bypass_reason: string | null;
  witness_user_id: string | null;
  planned_window_start: Date | null;
  planned_window_end: Date | null;
  entered_by: string | null;
  entry_at: Date | null;
  exit_at: Date | null;
  work_reference: string | null;
  evidence_notes: string | null;
}

export type KeyScopeType = 'room' | 'floor' | 'block' | 'hostel';
export type KeyLogStatus = 'issued' | 'returned' | 'overdue' | 'lost';

export interface MasterKeyLogRow {
  id: string;
  org_id: string;
  campus_id: string;
  key_identifier: string;
  scope_type: KeyScopeType;
  scope_id: string;
  room_entry_id: string | null;
  issued_to: string;
  issued_by: string | null;
  purpose: string | null;
  issued_at: Date;
  expected_return_at: Date;
  returned_at: Date | null;
  status: KeyLogStatus;
  lost_reason: string | null;
}

export type CustodyType =
  | 'found_property'
  | 'checkout_belongings'
  | 'emergency_secured'
  | 'confiscated_item'
  | 'damaged_property'
  | 'key_or_token'
  | 'security_evidence_transfer'
  | 'package_dispute';

export type CustodyStatus = 'in_custody' | 'claimed' | 'released' | 'transferred_to_security' | 'disposed';

export interface PropertyCustodyRow {
  id: string;
  org_id: string;
  campus_id: string;
  custody_type: CustodyType;
  item_description: string;
  student_id: string | null;
  found_location: string | null;
  found_at: Date | null;
  collected_by: string | null;
  witness_user_id: string | null;
  condition_notes: string | null;
  storage_location: string | null;
  notice_notes: string | null;
  status: CustodyStatus;
  claimant_user_id: string | null;
  released_at: Date | null;
  released_to: string | null;
  disposal_reason: string | null;
  retention_until: string | null;
}

export type LegalHoldStatus = 'none' | 'hold' | 'released';

export interface SecurityEvidenceReference {
  id: string;
  org_id: string;
  campus_id: string;
  reference_id: string;
  time_range_start: Date | null;
  time_range_end: Date | null;
  case_reference: string | null;
  legal_hold_status: LegalHoldStatus;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  notes: string | null;
  created_by: string | null;
}
