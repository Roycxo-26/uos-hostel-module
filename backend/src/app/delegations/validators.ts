import { z } from 'zod';
import { DELEGATABLE_ENTITY_TYPES } from '../../utils/approvalResolution';

export const createDelegationSchema = z
  .object({
    campusId: z.string().uuid(),
    // student is deliberately not offered — delegating "the authority to
    // approve things" only makes sense for a role that ever approves
    // anything (see role_levels seed: only warden/head_warden appear in
    // any authorizeApproval() call across the app).
    role: z.enum(['warden', 'head_warden']),
    delegateUserId: z.string().uuid(),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime(),
    reason: z.string().trim().min(1).max(500),
    // What this delegate should NOT be trusted to decide, even though the
    // delegation otherwise covers `role`'s authority — e.g. keep
    // 'resident_privilege_change' (suspend/reinstate) for yourself while
    // handing off everything else. Empty/omitted = no exclusions.
    exclusions: z.array(z.enum(DELEGATABLE_ENTITY_TYPES)).max(DELEGATABLE_ENTITY_TYPES.length).optional().default([]),
  })
  .refine((v) => v.effectiveTo > v.effectiveFrom, {
    message: 'The "effective to" date must be after the "effective from" date.',
    path: ['effectiveTo'],
  });

export const listDelegationsQuerySchema = z.object({
  campusId: z.string().uuid().optional(),
  role: z.enum(['warden', 'head_warden']).optional(),
  // Default true — the list a Head Warden actually wants to see day to day
  // is "who's currently covering for whom", not a full history. Pass
  // active=false explicitly to see revoked/expired ones too.
  active: z.coerce.boolean().optional().default(true),
});

export const revokeDelegationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listStaffCandidatesQuerySchema = z.object({
  campusId: z.string().uuid(),
});
