import { z } from 'zod';

export const createAllocationSchema = z.object({
  applicationId: z.string().uuid(),
  bedId: z.string().uuid(),
});

export const noShowReleaseSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const noShowExtendSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  newDeadline: z.string().datetime(),
});

// D17.03 item 58.
export const deferNoShowSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const reassignNoShowSchema = z.object({
  newApplicationId: z.string().uuid(),
});

// D17.03 item 53.
export const updateWaitlistPrioritySchema = z.object({
  priorityScore: z.number(),
  notes: z.string().trim().max(1000).optional(),
});

// D17.03 item 54 — 'policy_reservation' is the only hold type this batch
// lets staff create directly; the rest are created internally by the
// offer flow or left for a later batch to adopt (see types.ts's own note).
export const reserveBedSchema = z.object({
  bedId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.string().datetime().optional(),
});

// D17.03 item 55.
export const createOfferSchema = z.object({
  applicationId: z.string().uuid(),
  bedId: z.string().uuid(),
  acceptDeadlineHours: z.number().int().positive().max(24 * 30).optional(),
});

export const declineOfferSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const withdrawOfferSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
