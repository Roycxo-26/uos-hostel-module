import { z } from 'zod';

// ux-flow.md §3.3 "Checkout screen": reason/date. studentId is staff-only
// (on behalf), same self-service-by-default pattern as
// transfers/movements/cases.
export const requestCheckoutSchema = z.object({
  studentId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(500),
});

export const inspectCheckoutSchema = z.object({
  inspectionNotes: z.string().trim().max(2000).optional(),
  damageFound: z.boolean().default(false),
  damageChargeAmount: z.number().nonnegative().optional(),
  damageDescription: z.string().trim().max(1000).optional(),
});

export const disputeDamageSchema = z.object({
  disputeReason: z.string().trim().min(1).max(1000),
});

export const recordClearanceSchema = z.object({
  deskCleared: z.boolean().optional(),
  financeCleared: z.boolean().optional(),
});

// BR's own Checkout override row: "Reason + unresolved clearance risks
// mandatory." Required only when clearances aren't actually complete —
// enforced in the service, not here, since that depends on the record's
// current state.
export const approveCheckoutSchema = z.object({
  overrideReason: z.string().trim().max(500).optional(),
  bedOutcome: z.enum(['available', 'blocked']).default('available'),
});

export const cancelCheckoutSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listCheckoutsQuerySchema = z.object({
  status: z.enum(['requested', 'inspected', 'completed', 'cancelled']).optional(),
});
