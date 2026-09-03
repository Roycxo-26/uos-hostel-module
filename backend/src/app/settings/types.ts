// White-label configuration shape + defaults. Source rule book Ch. 6
// ("White-Label and Tenant Configuration") lists these exact categories.
// Every other module reads labels/flags/policy values from here via
// service.ts — never hardcode "Hostel", "Warden", etc.

export interface Branding {
  institutionName: string;
  logoUrl: string | null;
  /** Hex colour, e.g. "#3730A3". Applied as the frontend's --color-accent. */
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
  // D17.13 (TODO.md Batch 30) — §21.1: "This is an optional feature
  // entitlement." Off by default; see offCampus/service.ts's own comment
  // on §21.4's module-off behaviour (existing records stay readable, new
  // ones are blocked, nothing is deleted).
  enableOffCampusHousing: boolean;
}

export interface PolicyDefaults {
  attendanceWindowStart: string;
  attendanceCutoff: string;
  checkInDeadlineHours: number;
  visitorSlotDurationMinutes: number;
  visitorSlotCapacityPerSlot: number;
  gatePassMaxDurationHours: number;
  /** How long before a movement's `requested_return` staff get a one-time
   * "this is coming due" nudge — distinct from, and earlier than, the
   * "overdue" flag jobs/flagOverdueMovements.ts sets once the deadline has
   * actually passed. See migration 20260101000021's own comment. */
  movementReturnReminderMinutes: number;
  // D17.03 (TODO.md Batch 14) — default accept-window for a new allocation
  // offer, and how long before a check-in deadline the resident gets a
  // one-time "this is coming due" nudge (same shape as
  // movementReturnReminderMinutes above, applied to check-in instead).
  offerAcceptDeadlineHours: number;
  noShowWarningHoursBeforeDeadline: number;
  // D17.10 depth (TODO.md Batch 23) — guardian-OTP timing and the staged
  // overdue-escalation ladder, both explicitly asked to stay tenant-
  // configurable by the policy that defined them ("These timings should
  // remain configurable for future institutions").
  guardianOtpExpiryMinutes: number;
  guardianOtpMaxAttempts: number;
  movementEscalation30mMinutes: number;
  movementEscalation3hHours: number;
  movementEscalation12hHours: number;
  // D17.12 depth (TODO.md Batch 26) — how long staff must wait, with at
  // least one logged contact attempt, before an abandonment checkout can
  // be approved without the resident's own participation.
  abandonmentLegalWaitingPeriodDays: number;
  // D17.08 (TODO.md Batch 29) — §16.4 "Floor Warden SLA is configurable
  // by priority"; this build uses one flat SLA rather than a per-priority
  // matrix (named simplification, see maintenance/service.ts). §16.7's
  // composite room-readiness gate's own cleanliness threshold (1-5 scale).
  maintenanceVerificationSlaHours: number;
  roomReadinessMinCleanlinessScore: number;
  // D17.13 (TODO.md Batch 30) — §21.2 "periodic occupancy confirmation."
  offCampusOccupancyConfirmationIntervalDays: number;
  // D17.23 (TODO.md Batch 30, item 124) — §24G.3's own "service SLA,"
  // the default when an individual order doesn't override it.
  laundryDefaultSlaHours: number;
  // D17.26 (TODO.md Batch 30, item 126) — §24J.3's consent request
  // expiry window.
  roommateRequestExpiryDays: number;
}

export interface TenantSettings {
  orgId: string;
  branding: Branding;
  terminology: Terminology;
  featureFlags: FeatureFlags;
  policyDefaults: PolicyDefaults;
  updatedAt: string;
}

export const DEFAULT_BRANDING: Branding = {
  institutionName: 'Your Institution',
  logoUrl: null,
  primaryColor: '#3730A3',
};

export const DEFAULT_TERMINOLOGY: Terminology = {
  hostelLabel: 'Hostel',
  blockLabel: 'Block',
  floorLabel: 'Floor',
  roomLabel: 'Room',
  bedLabel: 'Bed',
  wardenLabel: 'Warden',
  headWardenLabel: 'Head Warden',
  floorInchargeLabel: 'Floor Incharge',
  roomCrLabel: 'Room CR',
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  showBlockLevel: true,
  showFloorLevel: true,
  enableVisitorSlots: true,
  enableSports: true,
  enableMealAttendance: true,
  enableSpecialDiet: true,
  enableParentAccess: false,
  enableOffCampusHousing: false,
};

export const DEFAULT_POLICY: PolicyDefaults = {
  attendanceWindowStart: '20:00',
  attendanceCutoff: '21:30',
  checkInDeadlineHours: 72,
  visitorSlotDurationMinutes: 60,
  visitorSlotCapacityPerSlot: 2,
  gatePassMaxDurationHours: 12,
  movementReturnReminderMinutes: 15,
  offerAcceptDeadlineHours: 48,
  noShowWarningHoursBeforeDeadline: 24,
  guardianOtpExpiryMinutes: 5,
  guardianOtpMaxAttempts: 3,
  movementEscalation30mMinutes: 30,
  movementEscalation3hHours: 3,
  movementEscalation12hHours: 12,
  abandonmentLegalWaitingPeriodDays: 7,
  maintenanceVerificationSlaHours: 24,
  roomReadinessMinCleanlinessScore: 3,
  offCampusOccupancyConfirmationIntervalDays: 30,
  laundryDefaultSlaHours: 48,
  roommateRequestExpiryDays: 7,
};

type StoredRow = {
  branding?: Partial<Branding>;
  terminology?: Partial<Terminology>;
  feature_flags?: Partial<FeatureFlags>;
  policy_defaults?: Partial<PolicyDefaults>;
  updated_at?: Date | string;
};

/** Merges a (possibly partial, possibly absent) DB row over the defaults so
 * every caller gets a fully-populated object — no null-checks scattered
 * through controllers or the frontend. */
export function withDefaults(orgId: string, row?: StoredRow): TenantSettings {
  return {
    orgId,
    branding: { ...DEFAULT_BRANDING, ...row?.branding },
    terminology: { ...DEFAULT_TERMINOLOGY, ...row?.terminology },
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, ...row?.feature_flags },
    policyDefaults: { ...DEFAULT_POLICY, ...row?.policy_defaults },
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
  };
}
