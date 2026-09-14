import { z } from 'zod';

export const createProviderSchema = z.object({
  providerName: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(1000),
  emergencyContact: z.string().trim().max(200).optional(),
  safetyInspectionReference: z.string().trim().max(500).optional(),
  defaultContractReference: z.string().trim().max(500).optional(),
});

export const decideProviderComplianceSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'suspended']),
  reason: z.string().trim().min(1).max(1000),
});

export const listProvidersQuerySchema = z.object({
  complianceStatus: z.enum(['pending', 'approved', 'expired', 'rejected', 'suspended']).optional(),
});

const PLACEMENT_TYPES = [
  'private_accommodation', 'partner_residence', 'visiting_exchange', 'emergency_temporary',
  'guest_short_stay', 'summer_vacation', 'overflow',
] as const;

export const requestPlacementSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    providerId: z.string().uuid(),
    placementType: z.enum(PLACEMENT_TYPES),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    roomBedReference: z.string().trim().max(300).optional(),
    contractReference: z.string().trim().max(500).optional(),
    paymentOwnerReference: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'The end date must be after the start date.', path: ['endDate'] });

export const decidePlacementSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(1000),
});

export const confirmOccupancySchema = z.object({}).strict();

export const requestExitSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const confirmExitSchema = z.object({
  exitNotes: z.string().trim().max(1000).optional(),
});

export const cancelPlacementSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const linkIssueHandoffSchema = z.object({
  issueHandoffReference: z.string().trim().min(1).max(500),
});

export const listPlacementsQuerySchema = z.object({
  status: z
    .enum(['requested', 'under_review', 'approved', 'rejected', 'active', 'periodic_confirmation_due', 'exit_requested', 'exited', 'cancelled'])
    .optional(),
  studentId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
});
