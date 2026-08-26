import { z } from 'zod';

const AREA_TYPES = [
  'washroom',
  'bathing_area',
  'corridor',
  'drinking_water',
  'study_room',
  'recreation',
  'gym',
  'terrace',
  'common_kitchen',
  'laundry_area',
  'visitor_waiting',
  'prayer_room',
  'garden',
  'lift',
  'other',
] as const;

// --- Common areas (item 75) -------------------------------------------

export const createCommonAreaSchema = z.object({
  hostelId: z.string().uuid(),
  floorId: z.string().uuid().optional(),
  areaType: z.enum(AREA_TYPES),
  name: z.string().trim().min(1).max(120),
  openingHours: z.string().trim().max(200).optional(),
  capacity: z.number().int().positive().optional(),
  permittedPopulation: z.string().trim().max(500).optional(),
  cleaningSchedule: z.string().trim().max(500).optional(),
  safetyRestriction: z.string().trim().max(500).optional(),
});

export const updateCommonAreaStatusSchema = z.object({
  status: z.enum(['operational', 'closed', 'under_maintenance']),
  reason: z.string().trim().max(500).optional(),
});

// --- Sanitation inspection (item 76) ------------------------------------

export const recordInspectionSchema = z.object({
  commonAreaId: z.string().uuid(),
  cleanlinessScore: z.number().int().min(1).max(5),
  odourVentilationOk: z.boolean().default(true),
  waterAvailabilityOk: z.boolean().default(true),
  drainageOk: z.boolean().default(true),
  consumablesAvailable: z.boolean().optional(),
  fixtureConditionNotes: z.string().trim().max(500).optional(),
  lightingOk: z.boolean().default(true),
  accessibilityOk: z.boolean().default(true),
  wasteBinCondition: z.string().trim().max(200).optional(),
  pestIndicator: z.boolean().default(false),
  privacyLatchOk: z.boolean().default(true),
  safetyHazardNotes: z.string().trim().max(500).optional(),
  photoUrl: z.string().trim().url().max(2000).optional(),
  correctiveActionNeeded: z.boolean().default(false),
  correctiveActionNotes: z.string().trim().max(500).optional(),
  reinspectionOf: z.string().uuid().optional(),
});

// --- Utility outages (item 77) ------------------------------------------

export const reportOutageSchema = z.object({
  hostelId: z.string().uuid(),
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  outageType: z.enum([
    'water_shortage',
    'drinking_water',
    'hot_water',
    'electricity',
    'generator_backup',
    'lift',
    'internet',
    'sewage_drainage',
    'sanitation_closure',
    'gas_fuel',
    'other',
  ]),
  severity: z.enum(['minor', 'major', 'critical']).default('minor'),
  estimatedRestorationAt: z.string().datetime().optional(),
  alternativeArrangement: z.string().trim().max(1000).optional(),
});

export const updateOutageEtaSchema = z.object({
  estimatedRestorationAt: z.string().datetime(),
});

export const setAlternativeArrangementSchema = z.object({
  alternativeArrangement: z.string().trim().min(1).max(1000),
});

export const restoreOutageSchema = z.object({});

export const verifyOutageSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const closeOutageSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

// --- Pest control (item 78) ---------------------------------------------

export const reportPestFindingSchema = z.object({
  scopeType: z.enum(['room', 'common_area', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  findingNotes: z.string().trim().min(1).max(1000),
  recurrenceOf: z.string().uuid().optional(),
});

export const schedulePestTreatmentSchema = z.object({
  scheduledAt: z.string().datetime(),
  treatmentMethod: z.string().trim().max(500).optional(),
  chemicalReference: z.string().trim().max(200).optional(),
});

export const notifyResidentsPestSchema = z.object({});

export const recordPestTreatmentSchema = z.object({
  reEntrySafeAt: z.string().datetime().optional(),
});

export const reinspectPestSchema = z.object({
  result: z.string().trim().min(1).max(1000),
  passed: z.boolean(),
});
