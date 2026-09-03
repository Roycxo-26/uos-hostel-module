import { z } from 'zod';

const EVENT_TYPES = ['hostel_fee', 'deposit', 'mess_fee_reference', 'lost_key_charge', 'late_fee', 'damage_charge', 'waiver', 'refund'] as const;

// item 108/109 — raising an event always starts proposed/hostel_manual
// (enforced in the service, not here); evidenceNotes is where "resident
// showed a bank receipt screenshot" or similar gets recorded, distinct
// from an actual Finance confirmation.
export const raiseFinancialEventSchema = z.object({
  studentId: z.string().uuid(),
  eventType: z.enum(EVENT_TYPES),
  amount: z.number().positive(),
  description: z.string().trim().min(1).max(500),
  evidenceNotes: z.string().trim().max(1000).optional(),
  // e.g. 'checkout' + a checkout id, or 'financial_event' + the charge a
  // waiver/refund offsets.
  linkedReferenceType: z.string().trim().max(30).optional(),
  linkedReferenceId: z.string().uuid().optional(),
});

// item 109 — the DEV-SIMULATED Finance-confirmation action (see
// service.ts's own comment). No fields of its own; who's allowed to call
// it is the real gate.
export const confirmFinancialEventSchema = z.object({}).strict();

export const disputeFinancialEventSchema = z.object({
  disputeReason: z.string().trim().min(1).max(1000),
});

export const reverseFinancialEventSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listFinancialEventsQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  status: z.enum(['proposed', 'finance_confirmed', 'disputed', 'reversed']).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
});
