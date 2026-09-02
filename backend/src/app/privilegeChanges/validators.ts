import { z } from 'zod';

const PRIVILEGE_TYPES = ['access_zone', 'visitor_hosting', 'outpass_rule_profile', 'mess_entitlement', 'temporary_access', 'hostel_privilege_status'] as const;
const ACTIONS = ['grant', 'restrict', 'suspend', 'restore'] as const;

export const requestPrivilegeChangeSchema = z.object({
  studentId: z.string().uuid(),
  privilegeType: z.enum(PRIVILEGE_TYPES),
  action: z.enum(ACTIONS),
  proposedConfiguration: z.record(z.unknown()),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional(),
  reason: z.string().trim().min(1).max(1000),
  linkedReferenceType: z.string().trim().max(30).optional(),
  linkedReferenceId: z.string().uuid().optional(),
});

export const decidePrivilegeChangeSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(1000),
});

export const acknowledgePrivilegeChangeSchema = z.object({}).strict();

export const reversePrivilegeChangeSchema = z.object({
  proposedConfiguration: z.record(z.unknown()),
  reason: z.string().trim().min(1).max(1000),
});

export const cancelPrivilegeChangeSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listPrivilegeChangesQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  status: z.enum(['requested', 'approved', 'rejected', 'cancelled', 'reversed']).optional(),
});
