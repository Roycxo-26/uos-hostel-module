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

// D17.20 item 73.
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
  ]),
  itemDescription: z.string().trim().min(1).max(500),
  studentId: z.string().uuid().optional(),
  foundLocation: z.string().trim().max(200).optional(),
  witnessUserId: z.string().uuid().optional(),
  conditionNotes: z.string().trim().max(500).optional(),
  storageLocation: z.string().trim().max(200).optional(),
  retentionUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
});

export const releaseCustodySchema = z.object({
  claimantUserId: z.string().uuid().optional(),
  releasedTo: z.string().trim().min(1).max(200),
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
