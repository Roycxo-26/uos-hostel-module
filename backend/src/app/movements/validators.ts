import { z } from 'zod';

export const requestMovementSchema = z
  .object({
    movementType: z.enum(['gate_pass', 'leave']).default('gate_pass'),
    destination: z.string().trim().min(1).max(200),
    purpose: z.string().trim().min(1).max(500),
    requestedOut: z.string().datetime(),
    requestedReturn: z.string().datetime(),
  })
  .refine((v) => new Date(v.requestedReturn) > new Date(v.requestedOut), {
    message: 'requestedReturn must be after requestedOut',
    path: ['requestedReturn'],
  });

export const decideMovementSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(500),
});

export const cancelMovementSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// BR §8: "Gate records exit/entry" — no free-text body needed, the actor
// and timestamp are captured server-side (see service.ts), matching how
// checkins/service.ts records checked_in_by/checked_in_at.
export const recordExitSchema = z.object({}).strict();
export const recordReturnSchema = z.object({}).strict();

export const listMovementsQuerySchema = z.object({
  status: z.enum(['requested', 'approved', 'rejected', 'cancelled', 'out', 'returned', 'overdue']).optional(),
});
