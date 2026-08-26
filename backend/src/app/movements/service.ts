import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type { cancelMovementSchema, decideMovementSchema, requestMovementSchema } from './validators';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function canManageMovements(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'movement:manage');
}

/** BR §8: "Residents shall request leave/gate pass" — self-service, own
 * campus (matches submitApplication's own resolveCampusId use). */
export async function requestMovement(user: AuthUser, input: z.infer<typeof requestMovementSchema>) {
  const campusId = resolveCampusId(user);

  const existing = await repo.findActiveForStudent(user.sub);
  if (existing) throw new ConflictError(`An active movement request already exists (status: ${existing.status})`);

  try {
    const row = await repo.create({
      org_id: user.org_id,
      campus_id: campusId,
      student_id: user.sub,
      movement_type: input.movementType,
      destination: input.destination,
      purpose: input.purpose,
      requested_out: new Date(input.requestedOut),
      requested_return: new Date(input.requestedReturn),
      status: 'requested',
    });

    await recordAudit({
      orgId: user.org_id,
      campusId,
      actorUserId: user.sub,
      action: 'movement.requested',
      entityType: 'movement_request',
      entityId: row.id,
      after: row,
    });

    // Real gap, found live via SELF-TEST-GUIDE.md C7 — this wrote the row
    // and audit entry and notified nobody; staff only found out by manually
    // re-checking this page. Same fix applied in applications/transfers/
    // cases services.
    await notifyCampusStaff(db, user.org_id, campusId, {
      type: 'movement.requested',
      title: `New ${input.movementType === 'leave' ? 'leave' : 'gate pass'} request awaiting decision`,
      link: '/movement',
    });

    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('An active movement request already exists');
    throw err;
  }
}

export async function listMovements(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canManageMovements(user)) ? undefined : user.sub;
  return repo.list({ status: filters.status, studentId });
}

export async function getMovement(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Movement request');
  if (row.student_id !== user.sub && !(await canManageMovements(user))) {
    throw new ForbiddenError('You can only view your own movement request');
  }
  return row;
}

/** Second real consumer of §5A's delegation framework (after Transfer) —
 * a plain Warden deciding a routine gate pass/leave resolves NORMAL; Head
 * Warden resolves ESCALATED; anyone else needs an active delegation. */
export async function decideMovement(user: AuthUser, id: string, input: z.infer<typeof decideMovementSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a movement request in status '${before.status}'`);

  const resolution = await authorizeApproval(user, { requiredRole: 'warden', campusId: before.campus_id });

  const after = await repo.update(id, {
    status: input.decision,
    decision_reason: input.reason,
    decided_by: user.sub,
    decided_at: db.fn.now(),
  });

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'movement_request',
    entityId: id,
    requiredRole: 'warden',
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `movement.${input.decision}`,
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'movement.decided',
    title: `Your ${before.movement_type === 'leave' ? 'leave' : 'gate pass'} request was ${input.decision}`,
    body: input.reason,
    link: '/movement',
  });

  return after;
}

export async function cancelMovement(user: AuthUser, id: string, input: z.infer<typeof cancelMovementSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (!['requested', 'approved'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a movement request in status '${before.status}'`);
  }
  if (before.student_id !== user.sub && !(await canManageMovements(user))) {
    throw new ForbiddenError('Only the requesting resident or staff can cancel this movement request');
  }

  const after = await repo.update(id, { status: 'cancelled', decision_reason: input.reason });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'movement.cancelled',
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — cancelling silently
  // notified nobody, whichever side did it. If the resident cancels, staff
  // (who may already be tracking an approved pass) should know it's off;
  // if staff cancel on the resident's behalf, the resident needs telling.
  if (user.sub === before.student_id) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'movement.cancelled',
      title: 'A gate pass / leave request was cancelled by the resident',
      link: '/movement',
    });
  } else {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: before.student_id,
      type: 'movement.cancelled',
      title: 'Your gate pass / leave request was cancelled by staff',
      body: input.reason,
      link: '/movement',
    });
  }

  return after;
}

/** BR §8: "Gate records exit" — staff-recorded for Phase 1 (see the
 * migration's own comment; no live Gate integration exists yet). */
export async function recordExit(user: AuthUser, id: string) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (before.status !== 'approved') throw new ConflictError(`Cannot record exit for a movement request in status '${before.status}'`);

  const after = await repo.update(id, { status: 'out', actual_exit_at: db.fn.now(), exit_recorded_by: user.sub });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'movement.exit_recorded',
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
  });

  return after;
}

/** BR §8: "Gate records entry; close leave" — also the resolution for
 * 'overdue' (a late return is still a return, just flagged in history via
 * the audit trail rather than a distinct terminal state). */
export async function recordReturn(user: AuthUser, id: string) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (!['out', 'overdue'].includes(before.status)) {
    throw new ConflictError(`Cannot record return for a movement request in status '${before.status}'`);
  }

  const after = await repo.update(id, { status: 'returned', actual_return_at: db.fn.now(), return_recorded_by: user.sub });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'movement.return_recorded',
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
  });

  return after;
}
