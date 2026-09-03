import { z } from 'zod';

const SERVICE_TYPES = [
  'linen_exchange', 'garment_laundry', 'scheduled_floor_pickup', 'drop_counter', 'token_bag',
  'self_service_washer', 'outsourced_vendor', 'emergency_linen_replacement', 'paid_premium',
] as const;

export const requestOrderSchema = z.object({
  studentId: z.string().uuid().optional(),
  serviceType: z.enum(SERVICE_TYPES),
  pickupDropLocation: z.string().trim().max(300).optional(),
  bagTokenId: z.string().trim().max(100).optional(),
  requestedPickupAt: z.string().datetime().optional(),
  itemCategories: z.array(z.string().trim().max(50)).optional(),
});

export const recordPickupSchema = z.object({
  pickupCount: z.number().int().positive(),
  pickupWeight: z.number().positive().optional(),
  conditionExceptionsAtHandoff: z.string().trim().max(1000).optional(),
  bagTokenId: z.string().trim().max(100).optional(),
  providerReference: z.string().trim().max(300).optional(),
});

export const recordReturnSchema = z.object({
  returnedCount: z.number().int().nonnegative(),
  returnedConditionNotes: z.string().trim().max(1000).optional(),
});

export const acknowledgeReturnSchema = z.object({}).strict();

export const reportExceptionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const resolveExceptionSchema = z.object({
  outcome: z.enum(['resolved_forward', 'resolved_cancelled']),
  notes: z.string().trim().min(1).max(1000),
  // §24G.5: "Lost/damaged compensation requires authorised assessment
  // and Finance handoff" — an amount here raises a real Finance 'refund'
  // event (never a direct wallet write, per LAW-41).
  compensationAmount: z.number().positive().optional(),
});

export const markUnclaimedSchema = z.object({}).strict();

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const reopenOrderSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const linkComplaintSchema = z.object({
  complaintReference: z.string().trim().min(1).max(500),
});

export const listOrdersQuerySchema = z.object({
  status: z
    .enum([
      'requested', 'accepted', 'picked_up', 'in_process', 'ready_for_return', 'returned', 'resident_acknowledged',
      'closed', 'count_dispute', 'lost_item', 'damaged_item', 'unclaimed_return', 'cancelled', 'reopened',
    ])
    .optional(),
  studentId: z.string().uuid().optional(),
});
