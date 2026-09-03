// HOSTEL-GAP-ANALYSIS.md D17.13 (TODO.md Batch 30, item 120). "HOSTEL -
// v.1.md" §21.

export type ProviderComplianceStatus = 'pending' | 'approved' | 'expired' | 'rejected' | 'suspended';
export type ProviderIntegrationStatus = 'manual' | 'integrated';

export interface OffCampusProvider {
  id: string;
  org_id: string;
  campus_id: string;
  provider_name: string;
  address: string;
  emergency_contact: string | null;
  compliance_status: ProviderComplianceStatus;
  compliance_notes: string | null;
  safety_inspection_reference: string | null;
  default_contract_reference: string | null;
  integration_status: ProviderIntegrationStatus;
  created_by: string;
  created_at: Date;
}

// §21.1's own seven categories.
export type OffCampusPlacementType =
  | 'private_accommodation'
  | 'partner_residence'
  | 'visiting_exchange'
  | 'emergency_temporary'
  | 'guest_short_stay'
  | 'summer_vacation'
  | 'overflow';

export type OffCampusPlacementStatus =
  | 'requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'periodic_confirmation_due'
  | 'exit_requested'
  | 'exited'
  | 'cancelled';

export interface OffCampusPlacement {
  id: string;
  org_id: string;
  campus_id: string;
  provider_id: string;
  student_id: string;
  placement_type: OffCampusPlacementType;
  status: OffCampusPlacementStatus;
  start_date: string;
  end_date: string;
  actual_exit_date: string | null;
  room_bed_reference: string | null;
  contract_reference: string | null;
  safety_inspection_reference: string | null;
  payment_owner_reference: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  last_occupancy_confirmed_at: Date | null;
  next_occupancy_confirmation_due: string | null;
  issue_handoff_reference: string | null;
  exit_confirmed_by: string | null;
  exit_confirmed_at: Date | null;
  exit_notes: string | null;
  cancelled_reason: string | null;
  created_at: Date;
}
