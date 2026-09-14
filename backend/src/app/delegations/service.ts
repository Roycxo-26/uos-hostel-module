import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { getRoleLevel, getUserHighestRoleLevel } from '../../utils/approvalResolution';
import { recordAudit } from '../../utils/audit';
import { notify } from '../../utils/notify';
import * as repo from './repository';
import type { createDelegationSchema, listDelegationsQuerySchema, revokeDelegationSchema } from './validators';

const ROLE_LABELS: Record<string, string> = { warden: 'Warden', head_warden: 'Head Warden' };

/**
 * UOS_Final.docx audit (12 Sep 2026), section 6.4 — the missing create
 * side of hostel.approver_delegations. Same role-level rule
 * utils/approvalResolution.ts already uses to decide ESCALATED: you may
 * only hand away authority you currently hold or outrank yourself, at the
 * same campus — a plain Warden can delegate 'warden' to a peer covering
 * their leave, but can never delegate 'head_warden' to anyone, no matter
 * who the delegate is. This is a service-level check, not a route
 * permission string, because it depends on which role is being delegated,
 * not just who's calling — the same reasoning requireHostelPermission's
 * own header comment gives for leaving ABAC scope checks to services.
 */
export async function createDelegation(user: AuthUser, input: z.infer<typeof createDelegationSchema>) {
  const campus = await db('shadow_campuses').where({ campus_id: input.campusId }).first('campus_id');
  if (!campus) throw new NotFoundError('Campus');

  if (input.delegateUserId === user.sub) {
    throw new ForbiddenError('You cannot delegate authority to yourself — you already hold whatever role you currently have.');
  }

  const requiredLevel = await getRoleLevel(input.role);
  const actorLevel = await getUserHighestRoleLevel(user.sub, input.campusId);
  if (requiredLevel === null || actorLevel === null || actorLevel < requiredLevel) {
    throw new ForbiddenError(`You must hold ${ROLE_LABELS[input.role]} authority (or higher) at this campus yourself to delegate it.`);
  }

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: input.campusId,
    role: input.role,
    delegate_user_id: input.delegateUserId,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
    reason: input.reason,
    created_by: user.sub,
    exclusions: JSON.stringify(input.exclusions),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: input.campusId,
    actorUserId: user.sub,
    action: 'delegation.created',
    entityType: 'approver_delegation',
    entityId: row.id,
    after: row,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: input.campusId,
    userId: input.delegateUserId,
    type: 'delegation.created',
    title: `You've been delegated ${ROLE_LABELS[input.role]} approval authority from ${new Date(input.effectiveFrom).toLocaleDateString()} to ${new Date(input.effectiveTo).toLocaleDateString()}`,
    body: input.reason,
    link: '/duty-roster',
  });

  return row;
}

export async function listDelegations(filters: z.infer<typeof listDelegationsQuerySchema>) {
  return repo.list(filters);
}

export async function listStaffCandidates(campusId: string) {
  return repo.listStaffCandidates(campusId);
}

/**
 * Same "hold the authority you're touching" rule as create — either side
 * of a delegation should be revocable by someone who could have created it
 * (the original creator, or anyone else who currently outranks the
 * delegated role at that campus), not only the exact person who happened
 * to create it — a Head Warden should be able to clean up a delegation
 * their predecessor set up, for instance.
 */
export async function revokeDelegation(user: AuthUser, id: string, input: z.infer<typeof revokeDelegationSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Delegation');
  if (!before.active) throw new ForbiddenError('This delegation is already inactive.');

  const requiredLevel = await getRoleLevel(before.role);
  const actorLevel = await getUserHighestRoleLevel(user.sub, before.campus_id);
  if (requiredLevel === null || actorLevel === null || actorLevel < requiredLevel) {
    throw new ForbiddenError(`You must hold ${ROLE_LABELS[before.role]} authority (or higher) at this campus to revoke this delegation.`);
  }

  const after = await repo.revoke(id, {
    revoked_at: db.fn.now(),
    revoked_by: user.sub,
    revoked_reason: input.reason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'delegation.revoked',
    entityType: 'approver_delegation',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.delegate_user_id,
    type: 'delegation.revoked',
    title: `Your delegated ${ROLE_LABELS[before.role]} approval authority was revoked`,
    body: input.reason,
    link: '/duty-roster',
  });

  return after;
}
