// Mirrors backend's AuthUser (@uos/auth) + this module's own /me response
// and entity shapes (now camelCase at the HTTP boundary — see
// backend/src/middlewares/camelCaseResponse.ts).

export type CampusScope = 'SINGLE' | 'PARTIAL' | 'ALL';

// Platform-level identity, decoded from the JWT payload — NOT this module's
// own role. See HostelRole below for that.
export interface AuthUser {
  sub: string;
  orgId: string;
  campusId: string;
  campusScope: CampusScope;
  allowedCampuses?: string[];
  orgRole: string;
  isSuperAdmin: boolean;
  moduleId: string;
  tokenType: 'bare' | 'scoped';
}

// This module's own roles (hostel.role_levels / user_roles — see
// backend/src/database/seeds/001_hostel_permissions.ts). Distinct from
// AuthUser.orgRole, which is a platform concept.
export type HostelRole = 'head_warden' | 'warden' | 'student';

export interface HostelRoleAssignment {
  campusId: string;
  role: HostelRole;
}

// GET /me — the actual source of "what can this user do in Hostel", since
// none of it lives in the JWT.
export interface Me {
  sub: string;
  name: string | null;
  email: string | null;
  orgId: string;
  campusId: string;
  campusScope: CampusScope;
  orgRole: string;
  isSuperAdmin: boolean;
  hostelRoles: HostelRoleAssignment[];
}

/** True if `me` can act as platform-level staff (Super Admin / org_admin —
 * flow.md §5.1's "full control" tier) OR holds the given Hostel-module role
 * at all. Mirrors backend's requireHostelPermission bypass logic — keep the
 * two in sync if that logic ever changes. */
export function hasHostelRole(me: Me | null, role: HostelRole): boolean {
  if (!me) return false;
  if (me.isSuperAdmin || me.orgRole === 'org_admin') return true;
  return me.hostelRoles.some((r) => r.role === role || (role === 'warden' && r.role === 'head_warden'));
}

export function isPlatformAdmin(me: Me | null): boolean {
  return Boolean(me?.isSuperAdmin || me?.orgRole === 'org_admin');
}

// --- Tenant settings (white-label) — backend/src/app/settings ---

export interface Branding {
  institutionName: string;
  logoUrl: string | null;
  primaryColor: string;
}

export interface Terminology {
  hostelLabel: string;
  blockLabel: string;
  floorLabel: string;
  roomLabel: string;
  bedLabel: string;
  wardenLabel: string;
  headWardenLabel: string;
  floorInchargeLabel: string;
  roomCrLabel: string;
}

export interface FeatureFlags {
  showBlockLevel: boolean;
  showFloorLevel: boolean;
  enableVisitorSlots: boolean;
  enableSports: boolean;
  enableMealAttendance: boolean;
  enableSpecialDiet: boolean;
  enableParentAccess: boolean;
}

export interface PolicyDefaults {
  attendanceWindowStart: string;
  attendanceCutoff: string;
  checkInDeadlineHours: number;
  visitorSlotDurationMinutes: number;
  visitorSlotCapacityPerSlot: number;
  gatePassMaxDurationHours: number;
  movementReturnReminderMinutes: number;
}

export interface TenantSettings {
  orgId: string;
  branding: Branding;
  terminology: Terminology;
  featureFlags: FeatureFlags;
  policyDefaults: PolicyDefaults;
  updatedAt: string;
}

// --- Hostel structure ---

// HOSTEL-GAP-ANALYSIS.md D17.01 item 43 — shared four-state lifecycle for
// hostel/block/floor/room (bed keeps its own richer operational enum).
export type LifecycleStatus = 'active' | 'suspended' | 'deactivated' | 'retired';

// D17.17 item 64.
export type SafetyStatus =
  | 'NOT_ASSESSED' | 'COMPLIANT_CURRENT' | 'INSPECTION_DUE' | 'FINDING_OPEN_NON_CRITICAL'
  | 'FINDING_OPEN_CRITICAL' | 'SAFETY_RESTRICTION_ACTIVE' | 'EVACUATION_READINESS_DEGRADED'
  | 'CERTIFICATE_EXPIRED_OR_UNKNOWN' | 'MANUAL_VERIFICATION_REQUIRED' | 'CLOSED_FOR_SAFETY';

export interface SafetyProfile {
  certificateReference?: string;
  evacuationCapacity?: number;
  fireAlarmStatusRef?: string;
  extinguisherInspectionRef?: string;
  emergencyLightingStatus?: string;
  assemblyPoints?: string[];
  emergencyContactChain?: string;
  drillFrequencyDays?: number;
  openCorrectiveActions?: string;
}

export interface Hostel {
  id: string;
  orgId: string;
  campusId: string;
  code: string;
  name: string;
  genderPolicy: 'male' | 'female' | 'co-ed';
  capacity: number;
  status: LifecycleStatus;
  // UOS HOSTEL BR.md §3 — effective-dated configuration + category/
  // accessibility policy. categoryPolicy is open/tenant-defined, not a
  // closed enum — see backend/src/app/structure/validators.ts.
  effectiveFrom: string | null;
  effectiveTo: string | null;
  categoryPolicy: string[] | null;
  accessibilityPolicy: string | null;
  // D17.17 items 63/64.
  safetyStatus: SafetyStatus;
  safetyStatusOwner: string | null;
  safetyDataAsOf: string | null;
  safetyProfile: SafetyProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface Block {
  id: string;
  hostelId: string;
  code: string;
  name: string;
  wardenUserId: string | null;
  status: LifecycleStatus;
}

export interface Floor {
  id: string;
  blockId: string;
  number: string;
  name: string | null;
  floorInchargeUserId: string | null;
  status: LifecycleStatus;
}

export interface Room {
  id: string;
  floorId: string;
  code: string;
  roomType: string;
  capacity: number;
  accessibility: boolean;
  // D17.01 item 45 — replaces the old single `restrictions` field.
  permittedPopulation: string | null;
  occupancyCompatibilityRule: string | null;
  safetyRestriction: string | null;
  status: LifecycleStatus;
  // D17.01 items 46/47
  statusReason: string | null;
  statusReviewDate: string | null;
  // D17.17 item 67
  statusReasonCategory: 'safety' | 'maintenance' | 'policy' | 'other' | null;
}

export type BedStatus = 'available' | 'reserved' | 'allocated' | 'occupied' | 'blocked' | 'maintenance';

export interface Bed {
  id: string;
  roomId: string;
  code: string;
  status: BedStatus;
  statusReason: string | null;
  statusReviewDate: string | null;
}

export interface RoomWithBeds extends Room {
  beds: Bed[];
}
export interface FloorWithRooms extends Floor {
  rooms: RoomWithBeds[];
}
export interface BlockWithFloors extends Block {
  floors: FloorWithRooms[];
}
export interface HostelTree extends Hostel {
  blocks: BlockWithFloors[];
}

// --- Applications / Allocations / Check-ins ---

export type ApplicationStatus =
  | 'draft' | 'submitted' | 'under_review' | 'returned' | 'waitlisted' | 'rejected'
  | 'allocation_ready' | 'allocated' | 'closed' | 'cancelled'
  // D17.02 item 51
  | 'withdrawn' | 'reopened';

// D17.02 item 49 — HOSTEL V1.1.md §10.1's ten application types.
export type ApplicationType =
  | 'new_term' | 'renewal' | 'mid_term' | 'short_stay' | 'emergency' | 'visiting'
  | 'staff' | 'accessibility_request' | 'hostel_transfer' | 'off_campus_placement';

// D17.02 item 50 — HOSTEL V1.1.md §10.5's seven-value eligibility outcome.
export type EligibilityOutcome =
  | 'eligible' | 'conditionally_eligible' | 'waiting_for_evidence' | 'source_verification_pending'
  | 'ineligible_reconsiderable' | 'ineligible_final' | 'exception_review_required';

export interface EligibilityConditions {
  condition: string;
  responsibleParty?: string;
  dueDate?: string;
  expiry?: string;
  effectIfUnmet?: string;
  evidenceRequirement?: string;
}

export interface ApplicationAttachment {
  name: string;
  url: string;
  uploadedAt?: string;
}

export interface HostelApplication {
  id: string;
  orgId: string;
  campusId: string;
  studentId: string;
  term: string;
  applicationType: ApplicationType;
  preferences: { hostelId?: string; roomType?: string; accessibilityNeed?: string; notes?: string };
  attachments: ApplicationAttachment[];
  status: ApplicationStatus;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  eligibilityOutcome: EligibilityOutcome | null;
  eligibilityConditions: EligibilityConditions | null;
  reopenReason: string | null;
  renewalOfAllocationId: string | null;
  createdAt: string;
}

export type AllocationStatus =
  | 'proposed' | 'bed_locked' | 'confirmed' | 'awaiting_check_in' | 'checked_in_active'
  | 'no_show_review' | 'released' | 'extended_hold' | 'transfer_pending' | 'checkout_pending' | 'ended'
  // D17.03 item 58
  | 'no_show_warning' | 'cancelled_by_resident' | 'deferred' | 'reassigned';

export interface Allocation {
  id: string;
  orgId: string;
  campusId: string;
  applicationId: string | null;
  studentId: string;
  bedId: string;
  status: AllocationStatus;
  checkInDeadline: string | null;
  approverUserId: string | null;
  noShowReason: string | null;
  noShowWarnedAt: string | null;
  bedHoldId: string | null;
  createdAt: string;
}

// D17.03 item 53.
export type WaitlistStatus = 'active' | 'offered' | 'expired' | 'withdrawn' | 'fulfilled';

export interface WaitlistEntry {
  id: string;
  applicationId: string;
  studentId: string;
  hostelId: string | null;
  priorityScore: string;
  status: WaitlistStatus;
  notes: string | null;
  rank?: number;
  totalActive?: number;
  createdAt: string;
}

// D17.03 item 54.
export type BedHoldType = 'recommendation' | 'offer' | 'accepted_offer' | 'transfer' | 'emergency' | 'policy_reservation';

export interface BedHold {
  id: string;
  bedId: string;
  holdType: BedHoldType;
  reason: string | null;
  expiresAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}

// D17.03 item 55.
export type AllocationOfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface AllocationOffer {
  id: string;
  applicationId: string;
  studentId: string;
  bedId: string;
  status: AllocationOfferStatus;
  acceptDeadline: string;
  decidedAt: string | null;
  declineReason: string | null;
  createdAt: string;
}

// D17.03 item 56.
export type NoBedReason = 'NO_PHYSICAL_BED' | 'NO_COMPATIBLE_BED' | 'ALL_BEDS_HELD_OR_OCCUPIED' | 'POLICY_RESTRICTION';

export interface ConditionPhoto {
  url: string;
  caption?: string;
}

// D17.04 item 59.
export type InventoryItemCategory = 'furniture' | 'appliance' | 'key' | 'fixture' | 'other';
export type InventoryItemCondition = 'good' | 'fair' | 'damaged' | 'missing';
export type DefectSeverity = 'cosmetic' | 'service_impacting' | 'safety_critical';

export interface CheckInInventoryItem {
  id?: string;
  itemName: string;
  itemCategory: InventoryItemCategory;
  quantity: number;
  condition: InventoryItemCondition;
  defectSeverity?: DefectSeverity;
  photoUrl?: string;
  officerNotes?: string;
  residentResponse: 'accept' | 'dispute';
  residentNotes?: string;
}

// D17.04 item 60.
export type AcknowledgementType = 'accept_all' | 'accept_with_comments' | 'dispute_selected_item' | 'refuse_handover' | 'request_alternate_room';

export interface CheckIn {
  id: string;
  allocationId: string;
  undertakingAccepted: boolean;
  acknowledgementType: AcknowledgementType | null;
  officerNotes: string | null;
  residentNotes: string | null;
  safetyOverrideReason: string | null;
  conditionPhotos: ConditionPhoto[];
  items?: CheckInInventoryItem[];
  checkedInBy: string | null;
  checkedInAt: string;
}

// --- Transfers (UOS HOSTEL BR.md §7) ---

export type TransferStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export type TransferType = 'normal' | 'emergency';

export interface TransferRequest {
  id: string;
  orgId: string;
  campusId: string;
  studentId: string;
  currentAllocationId: string;
  oldBedId: string;
  newBedId: string | null;
  newAllocationId: string | null;
  reason: string;
  transferType: TransferType;
  retrospectiveReviewDeadline: string | null;
  status: TransferStatus;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  executedBy: string | null;
  executedAt: string | null;
  oldRoomInspectionNotes: string | null;
  oldBedOutcome: 'available' | 'blocked' | null;
  // BR §7 round-trip temporary relocation (UAT.md Batch 10 gap-closure).
  isTemporary: boolean;
  restoredAt: string | null;
  restoreTransferId: string | null;
  restorationBlockedAt: string | null;
  createdAt: string;
}

// --- Movement (UOS HOSTEL BR.md §8 — Gate Pass / Leave, merged) ---

export type MovementType = 'gate_pass' | 'leave';
export type MovementStatus = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'out' | 'returned' | 'overdue';

export interface MovementRequest {
  id: string;
  orgId: string;
  campusId: string;
  studentId: string;
  movementType: MovementType;
  destination: string;
  purpose: string;
  requestedOut: string;
  requestedReturn: string;
  status: MovementStatus;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  actualExitAt: string | null;
  actualReturnAt: string | null;
  createdAt: string;
}

// --- Headcount (UOS HOSTEL BR.md §8) ---

export type HeadcountScopeType = 'room' | 'floor' | 'hostel';
export type HeadcountSessionStatus = 'open' | 'closed';
export type HeadcountEntryStatus = 'present' | 'approved_out' | 'missing' | 'unknown';

export interface HeadcountEntry {
  id: string;
  sessionId: string;
  studentId: string;
  status: HeadcountEntryStatus;
  note: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
}

export interface HeadcountSession {
  id: string;
  scopeType: HeadcountScopeType;
  scopeId: string;
  sessionDate: string;
  status: HeadcountSessionStatus;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  entries?: HeadcountEntry[];
}

// --- Cases: Complaints / Incidents / Discipline (UOS HOSTEL BR.md §9) ---

export type CaseType = 'complaint' | 'incident';
export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CaseStatus = 'reported' | 'assigned' | 'in_progress' | 'resolved' | 'notice_issued' | 'decided' | 'appealed' | 'closed' | 'reopened';
export type DecisionOutcome = 'upheld' | 'dismissed' | 'other';

export interface CaseEvidence {
  url: string;
  caption?: string;
}

export interface Case {
  id: string;
  reporterUserId: string;
  subjectUserId: string | null;
  caseType: CaseType;
  category: string;
  description: string;
  roomId: string | null;
  severity: CaseSeverity | null;
  confidential: boolean;
  status: CaseStatus;
  assignedTo: string | null;
  evidence: CaseEvidence[];
  investigationNotes: string | null;
  noticeText: string | null;
  decisionOutcome: DecisionOutcome | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  appealReason: string | null;
  deskTicketReference: { status: string } | null;
  reopenReason: string | null;
  createdAt: string;
}

// --- Checkout (UOS HOSTEL BR.md §10) ---

export type CheckoutStatus = 'requested' | 'inspected' | 'completed' | 'cancelled';

export interface Checkout {
  id: string;
  studentId: string;
  allocationId: string;
  bedId: string;
  reason: string;
  status: CheckoutStatus;
  inspectionNotes: string | null;
  damageFound: boolean;
  damageChargeAmount: string | null;
  damageDescription: string | null;
  damageDisputed: boolean;
  disputeReason: string | null;
  deskCleared: boolean;
  financeCleared: boolean;
  overrideReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  bedOutcome: 'available' | 'blocked' | null;
  createdAt: string;
}

// --- Admin (required @uos/auth endpoints) ---

// Kept in sync with the real @uos/auth package's AdminUserRole (confirmed
// once collaborator access was granted — see backend/src/app/admin/service.ts).
// Frontend can't import the package's own type directly, so this is a
// hand-mirrored copy; earlier it was `isActive` (no `grantedAt`) from a
// best-effort inference made before the real package was installable.
export interface AdminUserRole {
  userId: string;
  name: string;
  email: string;
  campusId: string;
  role: string;
  grantedAt: string;
  active: boolean;
}

// D17.17 items 65/66 (TODO.md Batch 16).
export type DrillType = 'planned_drill' | 'real_emergency';
export type DrillScopeType = 'room' | 'floor' | 'hostel';
export type DrillStatus = 'planned' | 'coverage_validated' | 'notified' | 'in_progress' | 'completed' | 'cancelled';

export interface EvacuationDrill {
  id: string;
  hostelId: string;
  drillType: DrillType;
  scopeType: DrillScopeType;
  scopeId: string;
  status: DrillStatus;
  assemblyPoints: string[] | null;
  plannedDate: string | null;
  openedBy: string | null;
  closedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  findings: string | null;
  correctiveActions: Record<string, unknown> | null;
  unresolvedCount: number;
  createdAt: string;
  entries?: EvacuationDrillEntry[];
}

export type DrillEntryStatus = 'accounted_for' | 'unresolved' | 'excused_on_leave';

export interface EvacuationDrillEntry {
  id: string;
  drillId: string;
  studentId: string;
  status: DrillEntryStatus;
  note: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
}

// D17.18 (TODO.md Batch 17) — physical occupancy verification.
export type VerificationScopeType = 'room' | 'floor' | 'hostel';
export type VerificationType =
  | 'scheduled' | 'floor' | 'spot' | 'post_migration' | 'post_transfer' | 'post_holiday' | 'emergency' | 'audit_directed';
export type VerificationSessionStatus = 'open' | 'closed';

export interface VerificationSession {
  id: string;
  scopeType: VerificationScopeType;
  scopeId: string;
  verificationType: VerificationType;
  sessionDate: string;
  status: VerificationSessionStatus;
  notes: string | null;
  openedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  entries?: VerificationEntry[];
}

export type PresenceStatus = 'observed' | 'not_observed' | 'refused' | 'unavailable';

export type AnomalyType =
  | 'EXPECTED_AND_CONFIRMED' | 'EXPECTED_NOT_PRESENT' | 'PRESENT_WRONG_BED' | 'PRESENT_WRONG_ROOM'
  | 'UNAUTHORISED_PERSON_PRESENT' | 'DUPLICATE_OCCUPANCY_SUSPECTED' | 'BED_PHYSICALLY_EMPTY_BUT_SYSTEM_OCCUPIED'
  | 'OCCUPANT_PRESENT_BUT_SYSTEM_EMPTY' | 'RESIDENT_ON_APPROVED_ABSENCE' | 'TEMPORARY_RELOCATION_NOT_SYNCED'
  | 'IDENTITY_UNVERIFIED' | 'ROOM_ACCESS_NOT_COMPLETED' | 'DATA_CORRECTION_REQUIRED';

export type CorrectionStatus = 'none' | 'explained_by_existing_record' | 'needs_correction' | 'referred_to_transfer' | 'resolved';

export interface VerificationEntry {
  id: string;
  sessionId: string;
  studentId: string | null;
  expectedBedId: string;
  observedBedId: string | null;
  presenceStatus: PresenceStatus;
  identityVerificationMethod: string | null;
  anomalyType: AnomalyType;
  unauthorisedPersonNote: string | null;
  evidenceNotes: string | null;
  correctionStatus: CorrectionStatus;
  followUpOwner: string | null;
}

// D17.20 (TODO.md Batch 18) — room entry, master-key, property custody,
// security-evidence references.
export type RoomEntryPurpose =
  | 'scheduled_housekeeping' | 'scheduled_inspection' | 'maintenance' | 'welfare_check'
  | 'security_investigation' | 'emergency' | 'pest_treatment' | 'checkout_abandonment'
  | 'asset_utility_inspection' | 'legal_audit';
export type RoomEntryStatus = 'requested' | 'approved' | 'notified' | 'entered' | 'completed' | 'cancelled';

export interface RoomEntry {
  id: string;
  roomId: string;
  purpose: RoomEntryPurpose;
  status: RoomEntryStatus;
  requestedBy: string | null;
  approvedBy: string | null;
  noticeGiven: boolean;
  consentGiven: boolean | null;
  emergencyBypassReason: string | null;
  witnessUserId: string | null;
  plannedWindowStart: string | null;
  plannedWindowEnd: string | null;
  enteredBy: string | null;
  entryAt: string | null;
  exitAt: string | null;
  workReference: string | null;
  evidenceNotes: string | null;
}

export type KeyScopeType = 'room' | 'floor' | 'block' | 'hostel';
export type KeyLogStatus = 'issued' | 'returned' | 'overdue' | 'lost';

export interface MasterKeyLog {
  id: string;
  keyIdentifier: string;
  scopeType: KeyScopeType;
  scopeId: string;
  issuedTo: string;
  purpose: string | null;
  issuedAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  status: KeyLogStatus;
  lostReason: string | null;
}

export type CustodyType =
  | 'found_property' | 'checkout_belongings' | 'emergency_secured' | 'confiscated_item'
  | 'damaged_property' | 'key_or_token' | 'security_evidence_transfer' | 'package_dispute';
export type CustodyStatus = 'in_custody' | 'claimed' | 'released' | 'transferred_to_security' | 'disposed';

export interface PropertyCustody {
  id: string;
  custodyType: CustodyType;
  itemDescription: string;
  studentId: string | null;
  foundLocation: string | null;
  foundAt: string | null;
  conditionNotes: string | null;
  storageLocation: string | null;
  noticeNotes: string | null;
  status: CustodyStatus;
  claimantUserId: string | null;
  releasedAt: string | null;
  releasedTo: string | null;
  disposalReason: string | null;
  retentionUntil: string | null;
}

export type LegalHoldStatus = 'none' | 'hold' | 'released';

export interface SecurityEvidenceReference {
  id: string;
  referenceId: string;
  timeRangeStart: string | null;
  timeRangeEnd: string | null;
  caseReference: string | null;
  legalHoldStatus: LegalHoldStatus;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  notes: string | null;
}

// D17.19 (TODO.md Batch 19) — common areas, sanitation, utility outages,
// pest control.
export type CommonAreaType =
  | 'washroom' | 'bathing_area' | 'corridor' | 'drinking_water' | 'study_room' | 'recreation'
  | 'gym' | 'terrace' | 'common_kitchen' | 'laundry_area' | 'visitor_waiting' | 'prayer_room'
  | 'garden' | 'lift' | 'other';
export type CommonAreaStatus = 'operational' | 'closed' | 'under_maintenance';

export interface CommonArea {
  id: string;
  hostelId: string;
  floorId: string | null;
  areaType: CommonAreaType;
  name: string;
  status: CommonAreaStatus;
  openingHours: string | null;
  capacity: number | null;
  cleaningSchedule: string | null;
  safetyRestriction: string | null;
  inspections?: SanitationInspection[];
}

export type InspectionStatus = 'passed' | 'failed' | 'needs_reinspection';

export interface SanitationInspection {
  id: string;
  commonAreaId: string;
  inspectedAt: string;
  cleanlinessScore: number;
  status: InspectionStatus;
  correctiveActionNeeded: boolean;
  correctiveActionNotes: string | null;
  pestIndicator: boolean;
}

export type OutageScopeType = 'room' | 'floor' | 'hostel';
export type OutageType =
  | 'water_shortage' | 'drinking_water' | 'hot_water' | 'electricity' | 'generator_backup'
  | 'lift' | 'internet' | 'sewage_drainage' | 'sanitation_closure' | 'gas_fuel' | 'other';
export type OutageSeverity = 'minor' | 'major' | 'critical';
export type OutageStatus = 'reported' | 'notified' | 'restored' | 'verified' | 'closed';

export interface OutageUpdate {
  id: string;
  updateType: 'eta_change' | 'status_change' | 'note';
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface UtilityOutage {
  id: string;
  hostelId: string;
  scopeType: OutageScopeType;
  scopeId: string;
  outageType: OutageType;
  severity: OutageSeverity;
  status: OutageStatus;
  affectedPopulationCount: number | null;
  alternativeArrangement: string | null;
  estimatedRestorationAt: string | null;
  restoredAt: string | null;
  updates?: OutageUpdate[];
}

export type PestTreatmentStatus = 'finding_reported' | 'scheduled' | 'resident_notified' | 'treated' | 'reinspected' | 'closed';
export type PestScopeType = 'room' | 'common_area' | 'floor' | 'hostel';

export interface PestControlTreatment {
  id: string;
  scopeType: PestScopeType;
  scopeId: string;
  findingNotes: string;
  treatmentMethod: string | null;
  status: PestTreatmentStatus;
  scheduledAt: string | null;
  treatedAt: string | null;
  reinspectionResult: string | null;
}

// D17.21 (TODO.md Batch 20) — grievances, independent appeal, policy
// acknowledgement.
export type GrievanceScope =
  | 'allocation' | 'waitlist' | 'transfer' | 'staff_behaviour' | 'service_quality'
  | 'privacy_room_entry' | 'damage_assessment' | 'fee_charge' | 'safety_sanitation'
  | 'accessibility' | 'retaliation' | 'other';

export type GrievanceStatus =
  | 'submitted' | 'under_review' | 'returned_for_information' | 'decision_issued'
  | 'appeal_submitted' | 'independent_review' | 'final_decision' | 'resolved'
  | 'closed' | 'reopened' | 'withdrawn';

export interface Grievance {
  id: string;
  raisedBy: string;
  scope: GrievanceScope;
  subjectUserId: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  description: string;
  status: GrievanceStatus;
  assignedReviewer: string | null;
  informationRequestNotes: string | null;
  interimActionNotes: string | null;
  referredTo: string | null;
  decisionReason: string | null;
  remedyNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  appealReason: string | null;
  appealSubmittedAt: string | null;
  independentReviewer: string | null;
  finalDecisionReason: string | null;
  finalDecidedBy: string | null;
  finalDecidedAt: string | null;
  remediationNotes: string | null;
  reopenReason: string | null;
  createdAt: string;
}

export interface PolicyVersion {
  id: string;
  documentKey: string;
  version: string;
  title: string;
  mandatory: boolean;
  publishedAt: string;
  reAckDeadline: string | null;
}

export type AcknowledgementState = 'pending' | 'accepted' | 'declined';

export interface PolicyAcknowledgement {
  id: string;
  policyVersionId: string;
  studentId: string;
  state: AcknowledgementState;
  acknowledgedAt: string | null;
  declineReason: string | null;
}

export interface MyRights {
  policies: { version: PolicyVersion; myAcknowledgement: PolicyAcknowledgement | null }[];
  grievances: Grievance[];
  routes: { grievance: string; appeal: string; correctData: string };
}

// D17.22 (TODO.md Batch 21) — duty roster + operational notices.
export type DutyPrivilegeType = 'duty_warden' | 'floor_duty_officer' | 'front_desk_shift' | 'security_contact' | 'emergency_contact';

export interface DutyResolution {
  privilegeType: DutyPrivilegeType;
  resolvedUserId: string | null;
  resolvedVia: 'primary' | 'substitute' | 'head_warden_escalation' | 'unresolved';
}

export interface CoverageValidation {
  scopeType: string;
  scopeId: string;
  resolutions: DutyResolution[];
  hasGaps: boolean;
}

export type NoticeScopeType = 'room' | 'floor' | 'hostel';
export type NoticeSeverity = 'normal' | 'critical';

export interface OperationalNotice {
  id: string;
  scopeType: NoticeScopeType;
  scopeId: string;
  title: string;
  body: string | null;
  severity: NoticeSeverity;
  requiresAcknowledgement: boolean;
  publishedAt: string;
  supersededBy: string | null;
  unacknowledgedCount?: number;
}

export interface NoticeAcknowledgement {
  id: string;
  noticeId: string;
  studentId: string;
  deliveredAt: string;
  acknowledgedAt: string | null;
}

export interface ResidentEmergencyCard {
  studentId: string;
  occupancy: { hostelId: string; hostelName: string; blockCode: string; floorNumber: string; roomId: string; roomCode: string; bedCode: string } | null;
  currentMovementStatus: string;
  dutyWardenUserId: string | null;
  dataAsOf: string;
}
