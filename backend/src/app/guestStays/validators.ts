import { z } from 'zod';

export const createGuestStaySchema = z.object({
  bedId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(200),
  guestType: z.enum(['parent', 'visiting_faculty', 'other']),
  hostReference: z.string().trim().max(500).optional(),
  purpose: z.string().trim().max(500).optional(),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
  feeReference: z.string().trim().max(500).optional(),
  mealEntitlement: z.string().trim().max(500).optional(),
});

export const checkInGuestStaySchema = z.object({
  identityVerified: z.boolean(),
  keyReference: z.string().trim().max(200).optional(),
});

export const checkOutGuestStaySchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

export const cancelGuestStaySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
