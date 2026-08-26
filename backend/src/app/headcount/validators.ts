import { z } from 'zod';

export const openSessionSchema = z.object({
  scopeType: z.enum(['room', 'floor', 'hostel']),
  scopeId: z.string().uuid(),
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(), // defaults to today, server-side
});

export const markEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(['present', 'missing']), // 'approved_out'/'unknown' are system-computed, not hand-set — see service.ts
  note: z.string().trim().max(500).optional(),
});

export const listSessionsQuerySchema = z.object({
  scopeType: z.enum(['room', 'floor', 'hostel']).optional(),
  scopeId: z.string().uuid().optional(),
  status: z.enum(['open', 'closed']).optional(),
});
