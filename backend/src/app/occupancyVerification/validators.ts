import { z } from 'zod';

export const openSessionSchema = z.object({
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  verificationType: z.enum(['scheduled', 'floor', 'spot', 'post_migration', 'post_transfer', 'post_holiday', 'emergency', 'audit_directed']),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  notes: z.string().trim().max(1000).optional(),
});

const ANOMALY_TYPES = [
  'EXPECTED_AND_CONFIRMED',
  'EXPECTED_NOT_PRESENT',
  'PRESENT_WRONG_BED',
  'PRESENT_WRONG_ROOM',
  'UNAUTHORISED_PERSON_PRESENT',
  'DUPLICATE_OCCUPANCY_SUSPECTED',
  'BED_PHYSICALLY_EMPTY_BUT_SYSTEM_OCCUPIED',
  'OCCUPANT_PRESENT_BUT_SYSTEM_EMPTY',
  'RESIDENT_ON_APPROVED_ABSENCE',
  'TEMPORARY_RELOCATION_NOT_SYNCED',
  'IDENTITY_UNVERIFIED',
  'ROOM_ACCESS_NOT_COMPLETED',
  'DATA_CORRECTION_REQUIRED',
] as const;

export const markEntrySchema = z.object({
  entryId: z.string().uuid(),
  presenceStatus: z.enum(['observed', 'not_observed', 'refused', 'unavailable']),
  observedBedId: z.string().uuid().optional(),
  identityVerificationMethod: z.string().trim().max(50).optional(),
  anomalyType: z.enum(ANOMALY_TYPES).default('EXPECTED_AND_CONFIRMED'),
  unauthorisedPersonNote: z.string().trim().max(500).optional(),
  evidenceNotes: z.string().trim().max(1000).optional(),
});

export const closeSessionSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});
