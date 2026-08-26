import { z } from 'zod';

const SAFETY_STATUS_VALUES = [
  'NOT_ASSESSED',
  'COMPLIANT_CURRENT',
  'INSPECTION_DUE',
  'FINDING_OPEN_NON_CRITICAL',
  'FINDING_OPEN_CRITICAL',
  'SAFETY_RESTRICTION_ACTIVE',
  'EVACUATION_READINESS_DEGRADED',
  'CERTIFICATE_EXPIRED_OR_UNKNOWN',
  'MANUAL_VERIFICATION_REQUIRED',
  'CLOSED_FOR_SAFETY',
] as const;

const safetyProfileSchema = z.object({
  certificateReference: z.string().trim().max(200).optional(),
  evacuationCapacity: z.number().int().positive().optional(),
  fireAlarmStatusRef: z.string().trim().max(200).optional(),
  extinguisherInspectionRef: z.string().trim().max(200).optional(),
  emergencyLightingStatus: z.string().trim().max(200).optional(),
  assemblyPoints: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  emergencyContactChain: z.string().trim().max(1000).optional(),
  drillFrequencyDays: z.number().int().positive().optional(),
  openCorrectiveActions: z.string().trim().max(1000).optional(),
});

// D17.17 item 64 — a `dataAsOf` timestamp is REQUIRED whenever the status
// itself is being set (not just the profile), enforcing the BRD's own
// rule at the schema layer, not just in a comment: "unknown or stale data
// cannot be converted to COMPLIANT_CURRENT" — more generally, no status
// value can be asserted without saying as of when it's true.
export const updateSafetyStatusSchema = z.object({
  status: z.enum(SAFETY_STATUS_VALUES),
  owner: z.string().trim().min(1).max(200),
  dataAsOf: z.string().datetime(),
  profile: safetyProfileSchema.optional(),
});

export const planDrillSchema = z.object({
  hostelId: z.string().uuid(),
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  assemblyPoints: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

export const triggerEmergencySchema = z.object({
  hostelId: z.string().uuid(),
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
});

export const markDrillEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(['accounted_for', 'unresolved']),
  note: z.string().trim().max(500).optional(),
});

export const completeDrillSchema = z.object({
  findings: z.string().trim().max(2000).optional(),
  correctiveActions: z.record(z.unknown()).optional(),
});

export const cancelDrillSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
