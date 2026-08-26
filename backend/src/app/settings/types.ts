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
