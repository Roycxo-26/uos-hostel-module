// HOSTEL-GAP-ANALYSIS.md D17.24 (TODO.md Batch 30, item 125). "HOSTEL
// V1.1.md" §24H.

export type FacilityBookingStatus = 'requested' | 'approved' | 'rejected' | 'checked_in' | 'completed' | 'cancelled' | 'no_show' | 'closed';

export interface FacilityBooking {
  id: string;
  org_id: string;
  campus_id: string;
  common_area_id: string;
  requested_by: string;
  purpose: string;
  start_at: Date;
  end_at: Date;
  attendee_count: number | null;
  status: FacilityBookingStatus;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  checked_in_at: Date | null;
  completed_at: Date | null;
  no_show_at: Date | null;
  cancelled_reason: string | null;
  damage_incident_reference: string | null;
  created_at: Date;
}

// §24H.2's own list.
export type ProgrammeType =
  | 'new_resident_orientation'
  | 'floor_hostel_meeting'
  | 'safety_awareness'
  | 'cleanliness_waste_conservation'
  | 'peer_mentoring'
  | 'study_support_session'
  | 'sports_recreation'
  | 'cultural_social'
  | 'volunteer_community_service'
  | 'resident_committee_meeting'
  | 'other';

export type ProgrammeStatus = 'requested' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';

export interface ResidenceProgramme {
  id: string;
  org_id: string;
  campus_id: string;
  programme_type: ProgrammeType;
  target_scope_type: 'hostel' | 'floor';
  target_scope_id: string;
  organiser_user_id: string;
  scheduled_at: Date;
  location: string | null;
  facility_booking_id: string | null;
  capacity: number | null;
  registration_required: boolean;
  accessibility_needs: string | null;
  consent_required: boolean;
  status: ProgrammeStatus;
  incident_safety_plan: string | null;
  feedback_summary: string | null;
  cost_budget_reference: string | null;
  outcome_notes: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  created_by: string;
  created_at: Date;
}

export interface ProgrammeParticipant {
  id: string;
  org_id: string;
  campus_id: string;
  programme_id: string;
  student_id: string;
  registered_at: Date;
  attended: boolean | null;
  participation_notes: string | null;
}
