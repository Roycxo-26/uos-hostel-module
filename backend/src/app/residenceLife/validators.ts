import { z } from 'zod';

// --- Facility bookings (§24H.4) ---------------------------------------------

export const requestBookingSchema = z
  .object({
    commonAreaId: z.string().uuid(),
    purpose: z.string().trim().min(1).max(500),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    attendeeCount: z.number().int().positive().optional(),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), { message: 'endAt must be after startAt', path: ['endAt'] });

export const decideBookingSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(1000),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const recordDamageIncidentSchema = z.object({
  reference: z.string().trim().min(1).max(500),
});

export const listBookingsQuerySchema = z.object({
  status: z.enum(['requested', 'approved', 'rejected', 'checked_in', 'completed', 'cancelled', 'no_show', 'closed']).optional(),
  commonAreaId: z.string().uuid().optional(),
});

// --- Residence-life programmes (§24H.2/24H.3) -------------------------------

const PROGRAMME_TYPES = [
  'new_resident_orientation', 'floor_hostel_meeting', 'safety_awareness', 'cleanliness_waste_conservation',
  'peer_mentoring', 'study_support_session', 'sports_recreation', 'cultural_social',
  'volunteer_community_service', 'resident_committee_meeting', 'other',
] as const;

export const proposeProgrammeSchema = z.object({
  programmeType: z.enum(PROGRAMME_TYPES),
  targetScopeType: z.enum(['hostel', 'floor']),
  targetScopeId: z.string().uuid(),
  // Optional — staff may name a different organiser (e.g. a Room Head);
  // defaults to the caller themselves.
  organiserUserId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime(),
  location: z.string().trim().max(300).optional(),
  facilityBookingId: z.string().uuid().optional(),
  capacity: z.number().int().positive().optional(),
  registrationRequired: z.boolean().default(false),
  accessibilityNeeds: z.string().trim().max(500).optional(),
  consentRequired: z.boolean().default(false),
  incidentSafetyPlan: z.string().trim().max(2000).optional(),
  costBudgetReference: z.string().trim().max(500).optional(),
});

export const decideProgrammeSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(1000),
});

export const startProgrammeSchema = z.object({}).strict();

export const completeProgrammeSchema = z.object({
  outcomeNotes: z.string().trim().max(2000).optional(),
  feedbackSummary: z.string().trim().max(2000).optional(),
});

export const cancelProgrammeSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const registerForProgrammeSchema = z.object({}).strict();

export const markAttendanceSchema = z.object({
  studentId: z.string().uuid(),
  attended: z.boolean(),
  participationNotes: z.string().trim().max(500).optional(),
});

export const listProgrammesQuerySchema = z.object({
  status: z.enum(['requested', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled']).optional(),
  targetScopeType: z.enum(['hostel', 'floor']).optional(),
  targetScopeId: z.string().uuid().optional(),
});
