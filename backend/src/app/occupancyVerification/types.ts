// HOSTEL-GAP-ANALYSIS.md D17.18 (TODO.md Batch 17).

export type VerificationScopeType = 'room' | 'floor' | 'hostel';
export type VerificationType =
  | 'scheduled'
  | 'floor'
  | 'spot'
  | 'post_migration'
  | 'post_transfer'
  | 'post_holiday'
  | 'emergency'
  | 'audit_directed';
export type SessionStatus = 'open' | 'closed';

export interface VerificationSession {
  id: string;
  org_id: string;
  campus_id: string;
  scope_type: VerificationScopeType;
  scope_id: string;
  verification_type: VerificationType;
  session_date: string;
  status: SessionStatus;
  notes: string | null;
  opened_by: string | null;
  opened_at: Date;
  closed_by: string | null;
  closed_at: Date | null;
}

export type PresenceStatus = 'observed' | 'not_observed' | 'refused' | 'unavailable';

// D17.18 item 69 — the thirteen-value BRD anomaly enum.
export type AnomalyType =
  | 'EXPECTED_AND_CONFIRMED'
  | 'EXPECTED_NOT_PRESENT'
  | 'PRESENT_WRONG_BED'
  | 'PRESENT_WRONG_ROOM'
  | 'UNAUTHORISED_PERSON_PRESENT'
  | 'DUPLICATE_OCCUPANCY_SUSPECTED'
  | 'BED_PHYSICALLY_EMPTY_BUT_SYSTEM_OCCUPIED'
  | 'OCCUPANT_PRESENT_BUT_SYSTEM_EMPTY'
  | 'RESIDENT_ON_APPROVED_ABSENCE'
  | 'TEMPORARY_RELOCATION_NOT_SYNCED'
  | 'IDENTITY_UNVERIFIED'
  | 'ROOM_ACCESS_NOT_COMPLETED'
  | 'DATA_CORRECTION_REQUIRED';

// D17.18 item 70 — never a direct bed-field write; only ever a flag +
// notification. The actual fix always goes through D17.07's Transfer
// workflow.
export type CorrectionStatus = 'none' | 'explained_by_existing_record' | 'needs_correction' | 'referred_to_transfer' | 'resolved';

export interface VerificationEntry {
  id: string;
  org_id: string;
  campus_id: string;
  session_id: string;
  student_id: string | null;
  expected_bed_id: string;
  observed_bed_id: string | null;
  presence_status: PresenceStatus;
  identity_verification_method: string | null;
  anomaly_type: AnomalyType;
  unauthorised_person_note: string | null;
  evidence_notes: string | null;
  correction_status: CorrectionStatus;
  follow_up_owner: string | null;
  recorded_by: string | null;
  recorded_at: Date | null;
}

/** Anomaly types that mean the physical reality genuinely disagrees with
 * the system, as opposed to a benign explanation (approved absence,
 * lagging sync) — these are the ones item 70's auto-check runs against. */
export const MISMATCH_ANOMALY_TYPES: ReadonlySet<AnomalyType> = new Set([
  'PRESENT_WRONG_BED',
  'PRESENT_WRONG_ROOM',
  'UNAUTHORISED_PERSON_PRESENT',
  'DUPLICATE_OCCUPANCY_SUSPECTED',
  'BED_PHYSICALLY_EMPTY_BUT_SYSTEM_OCCUPIED',
  'OCCUPANT_PRESENT_BUT_SYSTEM_EMPTY',
]);
