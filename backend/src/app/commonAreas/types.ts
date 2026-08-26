// HOSTEL-GAP-ANALYSIS.md D17.19 (TODO.md Batch 19).

export type CommonAreaType =
  | 'washroom'
  | 'bathing_area'
  | 'corridor'
  | 'drinking_water'
  | 'study_room'
  | 'recreation'
  | 'gym'
  | 'terrace'
  | 'common_kitchen'
  | 'laundry_area'
  | 'visitor_waiting'
  | 'prayer_room'
  | 'garden'
  | 'lift'
  | 'other';

export type CommonAreaStatus = 'operational' | 'closed' | 'under_maintenance';

export interface CommonArea {
  id: string;
  org_id: string;
  campus_id: string;
  hostel_id: string;
  floor_id: string | null;
  area_type: CommonAreaType;
  name: string;
  status: CommonAreaStatus;
  opening_hours: string | null;
  capacity: number | null;
  permitted_population: string | null;
  cleaning_schedule: string | null;
  next_inspection_date: string | null;
  safety_restriction: string | null;
}

export type InspectionStatus = 'passed' | 'failed' | 'needs_reinspection';

export interface SanitationInspection {
  id: string;
  org_id: string;
  campus_id: string;
  common_area_id: string;
  inspected_by: string | null;
  inspected_at: Date;
  cleanliness_score: number;
  odour_ventilation_ok: boolean;
  water_availability_ok: boolean;
  drainage_ok: boolean;
  consumables_available: boolean | null;
  fixture_condition_notes: string | null;
  lighting_ok: boolean;
  accessibility_ok: boolean;
  waste_bin_condition: string | null;
  pest_indicator: boolean;
  privacy_latch_ok: boolean;
  safety_hazard_notes: string | null;
  photo_url: string | null;
  corrective_action_needed: boolean;
  corrective_action_notes: string | null;
  status: InspectionStatus;
  reinspection_of: string | null;
}

export type OutageScopeType = 'room' | 'floor' | 'hostel';
export type OutageType =
  | 'water_shortage'
  | 'drinking_water'
  | 'hot_water'
  | 'electricity'
  | 'generator_backup'
  | 'lift'
  | 'internet'
  | 'sewage_drainage'
  | 'sanitation_closure'
  | 'gas_fuel'
  | 'other';
export type OutageSeverity = 'minor' | 'major' | 'critical';
export type OutageStatus = 'reported' | 'notified' | 'restored' | 'verified' | 'closed';

export interface UtilityOutage {
  id: string;
  org_id: string;
  campus_id: string;
  hostel_id: string;
  scope_type: OutageScopeType;
  scope_id: string;
  outage_type: OutageType;
  severity: OutageSeverity;
  status: OutageStatus;
  affected_population_count: number | null;
  alternative_arrangement: string | null;
  reported_by: string | null;
  reported_at: Date;
  estimated_restoration_at: Date | null;
  restored_at: Date | null;
  verified_by: string | null;
  verified_at: Date | null;
  closure_notes: string | null;
}

export type PestTreatmentStatus = 'finding_reported' | 'scheduled' | 'resident_notified' | 'treated' | 'reinspected' | 'closed';
export type PestScopeType = 'room' | 'common_area' | 'floor' | 'hostel';

export interface PestControlTreatment {
  id: string;
  org_id: string;
  campus_id: string;
  scope_type: PestScopeType;
  scope_id: string;
  finding_notes: string;
  treatment_method: string | null;
  chemical_reference: string | null;
  status: PestTreatmentStatus;
  scheduled_at: Date | null;
  resident_notified_at: Date | null;
  treated_at: Date | null;
  re_entry_safe_at: Date | null;
  reinspected_at: Date | null;
  reinspection_result: string | null;
  recurrence_of: string | null;
}
