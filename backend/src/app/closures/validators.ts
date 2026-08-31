import { z } from 'zod';

const REASON_CATEGORIES = [
  'semester_vacation',
  'maintenance_renovation',
  'safety',
  'pest_treatment',
  'low_occupancy_consolidation',
  'emergency',
  'event_operational',
  'water_sanitation_failure',
  'structural_work',
  'disaster',
] as const;

// 24I.3's reopening workflow, collapsed to the eight steps that are
// genuinely separate inspectable readiness checks — see the migration's own
// comment for which steps this deliberately leaves out (and why).
export const REOPENING_CHECKLIST_KEYS = [
  'facilities_safety_readiness',
  'water_electricity_sanitation',
  'housekeeping_pest_readiness',
  'room_bed_inventory_inspection',
  'keys_access_prepared',
  'meal_service_readiness',
  'duty_roster_front_desk_ready',
  'resident_return_schedule',
] as const;

export const createClosureCaseSchema = z.object({
  hostelId: z.string().uuid(),
  caseType: z.enum(['shutdown', 'mass_relocation']),
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  reasonCategory: z.enum(REASON_CATEGORIES),
  reasonNotes: z.string().trim().max(2000).optional(),
  plannedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  exceptionPolicy: z.string().trim().max(2000).optional(),
});

export const decideClosureCaseSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(1000),
});

export const resolveImpactSchema = z.object({
  outcome: z.enum(['relocated', 'checked_out', 'on_leave', 'exception_no_destination']),
  // Only meaningful (and required) when outcome === 'relocated'.
  destinationBedId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateReopeningChecklistSchema = z.object({
  key: z.enum(REOPENING_CHECKLIST_KEYS),
  completed: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});

export const cancelClosureCaseSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
