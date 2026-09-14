import { z } from 'zod';

const CATEGORIES = [
  'electrical', 'plumbing', 'water_supply', 'furniture', 'room_appliance', 'washroom', 'housekeeping',
  'pest_control', 'internet_it', 'security', 'access_credential', 'food_mess_service', 'safety_emergency',
  'common_area_issue', 'other',
] as const;
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;

// §16.2/16.4 — a resident reports against their own room by default; staff
// may report against any room or a location note (a common-area issue with
// no single room). 'safety_emergency' auto-bypasses verification, enforced
// in the service (depends on the category alone, not caller input).
// Frontline/offline support (12 Sep 2026) — widened from 2000 so a
// compressed camera photo (a data: URI, from frontend/src/offline/
// compressImage.ts) fits — same "it's just a URL field" stopgap pattern
// as everywhere else in this schema, just sized for an embedded photo
// instead of a short link. `.url()` already accepts a `data:` URI.
const photoDataUrlSchema = z.string().trim().url().max(500_000);

export const reportTicketSchema = z
  .object({
    roomId: z.string().uuid().optional(),
    locationNote: z.string().trim().max(300).optional(),
    category: z.enum(CATEGORIES),
    description: z.string().trim().min(1).max(1000),
    priority: z.enum(PRIORITIES).default('normal'),
    evidencePhotoUrl: photoDataUrlSchema.optional(),
  })
  .refine((v) => v.roomId || v.locationNote, {
    message: 'Either roomId or locationNote is required',
    path: ['locationNote'],
  });

export const verifyTicketSchema = z.object({
  decision: z.enum(['approved', 'returned', 'rejected']),
  reason: z.string().trim().min(1).max(1000),
});

export const assignTicketSchema = z.object({
  assignedToUserId: z.string().uuid().optional(),
  assignedToProvider: z.string().trim().max(200).optional(),
  manualExternalReference: z.string().trim().max(500).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
});

export const resolveTicketSchema = z.object({
  resolutionNotes: z.string().trim().min(1).max(1000),
  resolutionEvidenceUrl: photoDataUrlSchema.optional(),
});

export const confirmTicketResolutionSchema = z.object({}).strict();

export const reopenTicketSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const cancelTicketSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const linkDuplicateTicketSchema = z.object({
  duplicateOfTicketId: z.string().uuid(),
});

export const listTicketsQuerySchema = z.object({
  status: z
    .enum(['reported', 'pending_verification', 'returned_for_information', 'rejected', 'verified', 'emergency_routed', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened', 'cancelled'])
    .optional(),
  roomId: z.string().uuid().optional(),
  raisedBy: z.string().uuid().optional(),
});

// --- Housekeeping (item 117) -------------------------------------------------

export const scheduleHousekeepingTaskSchema = z.object({
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  taskType: z.enum(['daily', 'weekly', 'monthly', 'checkout_deep_clean']),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  assignedToUserId: z.string().uuid().optional(),
  preferredTime: z.string().trim().max(100).optional(),
  // §16.5 "room-access permission" — when set, creates a linked Batch 18
  // room_entries row (purpose='scheduled_housekeeping') rather than a
  // second permission concept.
  requestRoomAccess: z.boolean().default(false),
});

export const updateHousekeepingChecklistSchema = z.object({
  key: z.string().trim().min(1).max(50),
  completed: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});

export const completeHousekeepingTaskSchema = z.object({
  consumableRequestReference: z.string().trim().max(500).optional(),
});

export const markHousekeepingMissedSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// Creates a fresh task pointing back at the one that failed inspection —
// same "new row, not a rewrite" reasoning as every other supersession
// pointer this codebase uses.
export const createReworkTaskSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  assignedToUserId: z.string().uuid().optional(),
});

export const listHousekeepingTasksQuerySchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'missed', 'rework_required', 'cancelled']).optional(),
  scopeType: z.enum(['room', 'floor', 'hostel']).optional(),
  scopeId: z.string().uuid().optional(),
});

// --- Cleanliness inspection (item 118) --------------------------------------

export const recordCleanlinessInspectionSchema = z.object({
  areaType: z.enum(['room', 'washroom']),
  scopeId: z.string().uuid(),
  housekeepingTaskId: z.string().uuid().optional(),
  cleanlinessScore: z.number().int().min(1).max(5),
  wasteSegregationOk: z.boolean().optional(),
  prohibitedAccumulationFlag: z.boolean().default(false),
  safetyHazardFlag: z.boolean().default(false),
  maintenanceDefectNoted: z.boolean().default(false),
  maintenanceDefectNotes: z.string().trim().max(1000).optional(),
  energyWaterNotes: z.string().trim().max(500).optional(),
  residentParticipationNotes: z.string().trim().max(500).optional(),
  photoUrl: z.string().trim().url().max(2000).optional(),
  correctionDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  reinspectionOfId: z.string().uuid().optional(),
});

export const appealCleanlinessInspectionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const decideCleanlinessAppealSchema = z.object({
  outcome: z.enum(['upheld', 'overturned']),
  reason: z.string().trim().min(1).max(1000),
});

export const addResidentCommentSchema = z.object({
  comment: z.string().trim().min(1).max(1000),
});

export const listCleanlinessInspectionsQuerySchema = z.object({
  areaType: z.enum(['room', 'washroom']).optional(),
  scopeId: z.string().uuid().optional(),
});
