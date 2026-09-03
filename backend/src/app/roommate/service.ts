import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify } from '../../utils/notify';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import type { CompatibilityRecommendation } from './types';
import type { listRequestsQuerySchema, requestRoommateSchema, respondToRequestSchema, revokeRequestSchema } from './validators';

async function canManageRoommates(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'roommate:manage');
}

/** §24J.3: "Validate both eligible for same term/population" — an active
 * application for that exact term, not withdrawn/rejected/cancelled/
 * closed, whose eligibility outcome is 'eligible' or
 * 'conditionally_eligible'. Read-only cross-table query, same as every
 * other repo-to-repo-style read this session uses for a check that
 * doesn't warrant importing another module's own service.ts. */
async function assertEligibleForTerm(studentId: string, term: string): Promise<void> {
  const application = await db('hostel_applications')
    .where({ student_id: studentId, term })
    .whereNotIn('status', ['withdrawn', 'rejected', 'cancelled', 'closed'])
    .whereIn('eligibility_outcome', ['eligible', 'conditionally_eligible'])
    .first('id');
  if (!application) throw new ConflictError(`Resident does not have an eligible application for term '${term}'`);
}

/**
 * §24J.3's own consent flowchart. D17-LAW-37: "Mutual roommate requests
 * require both parties' valid consent" — this only ever creates the
 * REQUEST; the mutual preference itself only exists once accepted (see
 * respondToRequest).
 */
export async function requestRoommate(user: AuthUser, input: z.infer<typeof requestRoommateSchema>) {
  if (input.requestedStudentId === user.sub) throw new ValidationError('Cannot request yourself as a roommate');
  await assertEligibleForTerm(user.sub, input.term);
  await assertEligibleForTerm(input.requestedStudentId, input.term);

  const existing = await repo.findActiveBetween(user.sub, input.requestedStudentId, input.term);
  if (existing) throw new ConflictError('An active roommate request already exists between you and this resident for this term');

  const campusId = resolveCampusId(user);
  const settings = await getSettings(user.org_id);
  const expiresAt = new Date(Date.now() + settings.policyDefaults.roommateRequestExpiryDays * 24 * 60 * 60 * 1000);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    requesting_student_id: user.sub,
    requested_student_id: input.requestedStudentId,
    term: input.term,
    message: input.message ?? null,
    expires_at: expiresAt,
  });
  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'roommate_request.created', entityType: 'roommate_request', entityId: row.id, after: row });
  await notify({
    orgId: user.org_id,
    campusId,
    userId: input.requestedStudentId,
    type: 'roommate_request.received',
    title: 'Someone would like to room with you',
    body: input.message ?? undefined,
    link: '/roommate',
  });
  return row;
}

export async function listMyRequests(user: AuthUser, filters: { status?: string }) {
  return repo.listForStudent(user.sub, filters);
}

export async function listAllRequests(user: AuthUser, filters: { status?: string; studentId?: string }) {
  if (!(await canManageRoommates(user))) throw new ForbiddenError('Only staff can view all roommate requests');
  return repo.list(filters);
}

export async function getRequest(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Roommate request');
  const isParty = row.requesting_student_id === user.sub || row.requested_student_id === user.sub;
  if (!isParty && !(await canManageRoommates(user))) throw new ForbiddenError('You can only view your own roommate requests');
  return row;
}

export async function respondToRequest(user: AuthUser, id: string, input: z.infer<typeof respondToRequestSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Roommate request');
  if (before.requested_student_id !== user.sub) throw new ForbiddenError('Only the resident this request was sent to can respond');
  if (before.status !== 'pending') throw new ConflictError(`Cannot respond to a request in status '${before.status}'`);
  if (new Date(before.expires_at) < new Date()) throw new ConflictError('This request has already expired');

  const after = await repo.update(id, {
    status: input.decision,
    responded_at: db.fn.now(),
    ...(input.decision === 'declined' && { decline_reason: input.reason ?? null }),
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: `roommate_request.${input.decision}`, entityType: 'roommate_request', entityId: id, before, after, reason: input.reason });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.requesting_student_id,
    type: 'roommate_request.responded',
    title: input.decision === 'accepted' ? 'Your roommate request was accepted' : 'Your roommate request was declined',
    body: input.decision === 'declined' ? input.reason : 'This is now a recommendation for allocation staff — placement together still depends on available shared capacity.',
    link: '/roommate',
  });
  return after;
}

/** §24J.4: "Mutual request may be revoked before configured allocation
 * lock." This build's own lock proxy: once either resident actually has
 * an allocation, the request is effectively history, not something to
 * quietly withdraw. */
export async function revokeRequest(user: AuthUser, id: string, input: z.infer<typeof revokeRequestSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Roommate request');
  const isParty = before.requesting_student_id === user.sub || before.requested_student_id === user.sub;
  if (!isParty && !(await canManageRoommates(user))) throw new ForbiddenError('Only a party to this request, or staff, can revoke it');
  if (!['pending', 'accepted'].includes(before.status)) throw new ConflictError(`Cannot revoke a request in status '${before.status}'`);

  const anyAllocated = await db('allocations')
    .whereIn('student_id', [before.requesting_student_id, before.requested_student_id])
    .whereIn('status', ['checked_in_active', 'awaiting_check_in', 'confirmed'])
    .first('id');
  if (anyAllocated) throw new ConflictError('Cannot revoke — allocation has already progressed for one of the residents');

  const after = await repo.update(id, { status: 'revoked', revoked_by: user.sub, revoked_at: db.fn.now() });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'roommate_request.revoked', entityType: 'roommate_request', entityId: id, before, after, reason: input.reason });
  const otherParty = user.sub === before.requesting_student_id ? before.requested_student_id : before.requesting_student_id;
  await notify({ orgId: user.org_id, campusId: before.campus_id, userId: otherParty, type: 'roommate_request.revoked', title: 'A roommate request was revoked', body: input.reason, link: '/roommate' });
  return after;
}

/** §24J.3/§24J.4 — the allocation-time recommendation. Staff-only, and
 * deliberately this thin: whether a mutual accepted match exists, never
 * either resident's own compatibility answers ("does not expose one
 * resident's raw answers to another"). Actual bed placement stays a human
 * decision in Allocations — this never writes anything there. */
export async function getCompatibilityRecommendation(user: AuthUser, studentId: string, term: string): Promise<CompatibilityRecommendation> {
  if (!(await canManageRoommates(user))) throw new ForbiddenError('Only staff can view a compatibility recommendation');
  const match = await repo.findAcceptedForStudent(studentId, term);
  if (!match) return { hasMutualMatch: false, roommateRequestId: null, otherStudentId: null, term };

  const otherStudentId = match.requesting_student_id === studentId ? match.requested_student_id : match.requesting_student_id;
  return { hasMutualMatch: true, roommateRequestId: match.id, otherStudentId, term };
}
