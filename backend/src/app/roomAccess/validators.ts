import { z } from 'zod';

const ENTRY_PURPOSES = [
  'scheduled_housekeeping',
  'scheduled_inspection',
  'maintenance',
  'welfare_check',
  'security_investigation',
  'emergency',
  'pest_treatment',
  'checkout_abandonment',
  'asset_utility_inspection',
  'legal_audit',
] as const;

// D17.20 item 71 — a normal request needs a planned window; an emergency
// needs a bypass reason instead (LAW-31's own "emergency-bypass controls"
// requirement). service.ts enforces exactly one of the two being present,
// same conditional-requirement tradeoff this codebase uses everywhere
// rather than a `.refine()` here duplicating that logic.
export const requestEntrySchema = z.object({
  roomId: z.string().uuid(),
  purpose: z.enum(ENTRY_PURPOSES),
  plannedWindowStart: z.string().datetime().optional(),
  plannedWindowEnd: z.string().datetime().optional(),
  emergencyBypassReason: z.string().trim().min(1).max(500).optional(),
  noticeGiven: z.boolean().default(false),
  witnessUserId: z.string().uuid().optional(),
  workReference: z.string().trim().max(200).optional(),
});

export const approveEntrySchema = z.object({
  consentGiven: z.boolean().optional(),
});

export const recordEntrySchema = z.object({
  enteredBy: z.string().uuid().optional(),
  evidenceNotes: z.string().trim().max(1000).optional(),
});

export const recordExitSchema = z.object({
  evidenceNotes: z.string().trim().max(1000).optional(),
});

export const cancelEntrySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// D17.20 item 72.
export const issueKeySchema = z.object({
  keyIdentifier: z.string().trim().min(1).max(30),
  scopeType: z.enum(['room', 'floor', 'block', 'hostel']),
  scopeId: z.string().uuid(),
  issuedTo: z.string().uuid(),
  purpose: z.string().trim().max(500).optional(),
  expectedReturnAt: z.string().datetime(),
  roomEntryId: z.string().uuid().optional(),
});

export const returnKeySchema = z.object({});

export const reportKeyLostSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// D17.20 item 73. D17.06 item 113 (TODO.md Batch 28) added 'package_delivery'
// plus the four package-specific optional fields below — carrier/tracking/
// packageType/restrictedItemFlag only mean anything for that custody_type,
// but kept as plain optional fields rather than a discriminated union: this
// module already stores every other type-varying custody field the same
// way (foundLocation, witnessUserId, etc. are all "only some types use
// this"), so a package is not a special case here.
export const recordCustodySchema = z.object({
  custodyType: z.enum([
    'found_property',
    'checkout_belongings',
    'emergency_secured',
    'confiscated_item',
    'damaged_property',
    'key_or_token',
    'security_evidence_transfer',
    'package_dispute',
    'package_delivery',
  ]),
  itemDescription: z.string().trim().min(1).max(500),
  studentId: z.string().uuid().optional(),
  foundLocation: z.string().trim().max(200).optional(),
  witnessUserId: z.string().uuid().optional(),
  conditionNotes: z.string().trim().max(500).optional(),
  storageLocation: z.string().trim().max(200).optional(),
  retentionUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  carrier: z.string().trim().max(100).optional(),
  trackingNumber: z.string().trim().max(150).optional(),
  packageType: z.string().trim().max(30).optional(),
  restrictedItemFlag: z.boolean().optional(),
});

// D17.06 item 113 — identityVerificationNotes is the "collection identity
// check" the gap analysis named as missing; optional because it only
// applies when releasing to the claimant in person (not every custody_type
// releases that way — e.g. transferCustodyToSecurity is a separate action).
export const releaseCustodySchema = z.object({
  claimantUserId: z.string().uuid().optional(),
  releasedTo: z.string().trim().min(1).max(200),
  identityVerificationNotes: z.string().trim().max(500).optional(),
});

export const transferCustodyToSecuritySchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const disposeCustodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const addNoticeAttemptSchema = z.object({
  note: z.string().trim().min(1).max(500),
});

// D17.06 item 113 — a manual reminder, on top of the automatic arrival
// notification recordCustody already sends for a package_delivery.
export const sendPackageReminderSchema = z.object({}).strict();

// D17.20 item 74.
export const createEvidenceReferenceSchema = z.object({
  referenceId: z.string().trim().min(1).max(200),
  timeRangeStart: z.string().datetime().optional(),
  timeRangeEnd: z.string().datetime().optional(),
  caseReference: z.string().trim().max(200).optional(),
  linkedEntityType: z.string().trim().max(30).optional(),
  linkedEntityId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateLegalHoldSchema = z.object({
  legalHoldStatus: z.enum(['none', 'hold', 'released']),
});
