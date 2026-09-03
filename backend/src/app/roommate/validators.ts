import { z } from 'zod';

export const requestRoommateSchema = z.object({
  requestedStudentId: z.string().uuid(),
  term: z.string().trim().min(1).max(40),
  message: z.string().trim().max(500).optional(),
});

export const respondToRequestSchema = z.object({
  decision: z.enum(['accepted', 'declined']),
  reason: z.string().trim().max(500).optional(),
});

export const revokeRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listRequestsQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'expired', 'revoked']).optional(),
  studentId: z.string().uuid().optional(),
});
