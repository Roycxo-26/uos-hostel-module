import { z } from 'zod';

// All-partial by design — PATCH /settings only sends the section being
// edited. Unknown/absent fields fall back to current stored value, then the
// hard default.

export const brandingSchema = z.object({
  institutionName: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected hex colour like #3730A3').optional(),
});

export const terminologySchema = z.object({
  hostelLabel: z.string().trim().min(1).max(40).optional(),
  blockLabel: z.string().trim().min(1).max(40).optional(),
  floorLabel: z.string().trim().min(1).max(40).optional(),
  roomLabel: z.string().trim().min(1).max(40).optional(),
  bedLabel: z.string().trim().min(1).max(40).optional(),
  wardenLabel: z.string().trim().min(1).max(40).optional(),
  headWardenLabel: z.string().trim().min(1).max(40).optional(),
  floorInchargeLabel: z.string().trim().min(1).max(40).optional(),
  roomCrLabel: z.string().trim().min(1).max(40).optional(),
});

export const featureFlagsSchema = z.object({
  showBlockLevel: z.boolean().optional(),
  showFloorLevel: z.boolean().optional(),
  enableVisitorSlots: z.boolean().optional(),
  enableSports: z.boolean().optional(),
  enableMealAttendance: z.boolean().optional(),
  enableSpecialDiet: z.boolean().optional(),
  enableParentAccess: z.boolean().optional(),
});

export const policyDefaultsSchema = z.object({
  attendanceWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  attendanceCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  checkInDeadlineHours: z.number().int().positive().max(24 * 30).optional(),
  visitorSlotDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
  visitorSlotCapacityPerSlot: z.number().int().positive().max(100).optional(),
  gatePassMaxDurationHours: z.number().int().positive().max(72).optional(),
  movementReturnReminderMinutes: z.number().int().positive().max(24 * 60).optional(),
  offerAcceptDeadlineHours: z.number().int().positive().max(24 * 30).optional(),
  noShowWarningHoursBeforeDeadline: z.number().int().positive().max(24 * 30).optional(),
});

export const updateSettingsSchema = z.object({
  branding: brandingSchema.optional(),
  terminology: terminologySchema.optional(),
  featureFlags: featureFlagsSchema.optional(),
  policyDefaults: policyDefaultsSchema.optional(),
});
