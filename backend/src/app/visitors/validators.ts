import { z } from 'zod';

const HOST_TYPES = ['resident', 'day_scholar', 'faculty', 'staff', 'department', 'campus_office', 'other'] as const;
const VISITOR_CATEGORIES = ['family', 'friend', 'vendor', 'official', 'delivery', 'other'] as const;

export const requestVisitorSchema = z
  .object({
    hostType: z.enum(HOST_TYPES).default('resident'),
    visitorName: z.string().trim().min(1).max(150),
    visitorPhone: z.string().trim().min(1).max(30),
    visitorPhotoUrl: z.string().trim().url().max(2000).optional(),
    visitorIdReference: z.string().trim().max(500).optional(),
    visitorCategory: z.enum(VISITOR_CATEGORIES).optional(),
    purpose: z.string().trim().min(1).max(500),
    requestedVisitStart: z.string().datetime(),
    requestedVisitEnd: z.string().datetime(),
    approvedZoneScope: z.string().trim().max(500).optional(),
    emergencyContact: z.string().trim().max(100).optional(),
  })
  .refine((v) => new Date(v.requestedVisitEnd) > new Date(v.requestedVisitStart), {
    message: 'The visit end time must be after the visit start time.',
    path: ['requestedVisitEnd'],
  });

export const decideVisitorRequestSchema = z.object({
  decision: z.enum(['approved', 'denied', 'returned_for_information']),
  reason: z.string().trim().min(1).max(1000),
});

// A host resubmitting after RETURNED_FOR_INFORMATION — same fields as the
// original request, since the whole point is fixing what staff flagged.
export const resubmitVisitorRequestSchema = requestVisitorSchema;

export const cancelVisitorRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const recordVisitorEntrySchema = z.object({}).strict();
export const recordVisitorExitSchema = z.object({}).strict();

export const closeVisitorRequestSchema = z.object({}).strict();

export const reopenVisitorRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const hotlistCredentialSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listVisitorRequestsQuerySchema = z.object({
  status: z
    .enum(['requested', 'returned_for_information', 'approved', 'denied', 'cancelled', 'pass_issued', 'entered', 'exited', 'overstay', 'expired', 'closed', 'reopened'])
    .optional(),
  hostUserId: z.string().uuid().optional(),
});
