import { z } from 'zod';

const COMPETITION_TYPES = [
  'best_room_of_the_week', 'best_room_of_the_month', 'best_floor_wing', 'most_responsible_room',
  'most_proactive_student_or_team', 'cleanest_common_area_team', 'best_waste_management',
  'best_energy_water_conservation', 'best_community_participation', 'other',
] as const;

const scoringDimensionSchema = z.object({
  key: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
  weight: z.number().positive(),
  scoreMin: z.number(),
  scoreMax: z.number(),
  evidenceRequired: z.boolean().default(false),
  minimumInspections: z.number().int().min(0).default(1),
  treatMissingAsZero: z.boolean().default(false),
});

export const toggleHostelGamificationSchema = z.object({
  enabled: z.boolean(),
});

// §23.5: "Rules and weights are published before the competition starts" —
// the full dimension set is required at creation, not addable piecemeal
// later once the competition is open.
export const createCompetitionSchema = z
  .object({
    hostelId: z.string().uuid(),
    competitionType: z.enum(COMPETITION_TYPES),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    scoringDimensions: z.array(scoringDimensionSchema).min(1),
    eligibleScopeType: z.enum(['room', 'floor']).default('room'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    appealWindowDays: z.number().int().min(0).default(7),
    tieBreakerRule: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'The end date must be after the start date.', path: ['endDate'] });

export const generateEntriesSchema = z.object({}).strict();

export const cancelCompetitionSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listCompetitionsQuerySchema = z.object({
  hostelId: z.string().uuid().optional(),
  status: z.enum(['draft', 'open', 'scoring_locked', 'provisional_result', 'appeal_window', 'final_result', 'closed', 'cancelled']).optional(),
});

export const recordScoreSchema = z.object({
  dimensionKey: z.string().trim().min(1).max(50),
  score: z.number(),
  evidenceReference: z.string().trim().max(500).optional(),
  editReason: z.string().trim().max(500).optional(),
});

export const optOutEntrySchema = z.object({}).strict();

export const setAliasSchema = z.object({
  alias: z.string().trim().min(1).max(100),
});

export const issueRecognitionSchema = z.object({
  rewardDescription: z.string().trim().max(1000).optional(),
});

export const appealEntrySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const decideEntryAppealSchema = z.object({
  outcome: z.enum(['upheld', 'overturned']),
  reason: z.string().trim().min(1).max(1000),
});
