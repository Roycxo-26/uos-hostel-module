import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { resolveCampusId } from '../../utils/campusScope';
import { notify } from '../../utils/notify';
import * as repo from './repository';
import type {
  acknowledgePrivilegeChangeSchema,
  cancelPrivilegeChangeSchema,
  decidePrivilegeChangeSchema,
  requestPrivilegeChangeSchema,
  reversePrivilegeChangeSchema,
} from './validators';
import type { PrivilegeChangeAction, PrivilegeChangeType } from './types';

async function canManage(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'privilege_change:manage');
}

/** D17.07 item 100 — deliberately staff-initiated throughout, unlike
 * applications/transfers/movements' own self-service submit. Every listed
 * privilege_type is an administrative lever (restricting/suspending a
 * resident's access zones or hostel privilege status is never something a
 * resident requests against themselves), so this module doesn't build a
 * dual self-service/staff path — a real, named simplification versus the
 * BRD's generic "initiator" field, not an oversight. */
function requiredRoleFor(privilegeType: PrivilegeChangeType, action: PrivilegeChangeAction): string {
  return privilegeType === 'hostel_privilege_status' && action === 'suspend' ? 'head_warden' : 'warden';
}

export async function requestPrivilegeChange(user: AuthUser, input: z.infer<typeof requestPrivilegeChangeSchema>) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can request a resident privilege change');
  const campusId = resolveCampusId(user);

  const currentlyActive = await repo.findActiveForStudentAndType(input.studentId, input.privilegeType);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    student_id: input.studentId,
    privilege_type: input.privilegeType,
    action: input.action,
    previous_configuration: currentlyActive ? JSON.stringify(currentlyActive.proposed_configuration) : null,
    proposed_configuration: JSON.stringify(input.proposedConfiguration),
    effective_from: new Date(input.effectiveFrom),
    effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null,
    initiator_user_id: user.sub,
    reason: input.reason,
    linked_reference_type: input.linkedReferenceType ?? null,
    linked_reference_id: input.linkedReferenceId ?? null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'privilege_change.requested',
    entityType: 'resident_privilege_change',
    entityId: row.id,
    after: row,
  });
  await notify({
    orgId: user.org_id,
    campusId,
    userId: input.studentId,
    type: 'privilege_change.requested',
    title: `A ${input.action} on your ${input.privilegeType.replace(/_/g, ' ')} has been proposed, pending approval`,
    body: input.reason,
    link: '/allocations',
  });

  return row;
}

export async function listPrivilegeChanges(user: AuthUser, filters: { studentId?: string; status?: string }) {
  const isStaff = await canManage(user);
  return repo.list({ ...filters, studentId: isStaff ? filters.studentId : user.sub });
}

export async function getPrivilegeChange(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Resident privilege change');
  if (row.student_id !== user.sub && !(await canManage(user))) {
    throw new ForbiddenError('You can only view your own privilege changes');
  }
  return row;
}

/** Approving supersedes whichever record was previously the active one for
 * this student+privilege_type — BRD's own "reversal/supersession history":
 * the old row's own status stays exactly what it was (still legitimately
 * 'approved', historically true), only its `superseded_by` pointer changes,
 * so a timeline read never has to reinterpret what a past record's status
 * meant at the time. */
export async function decidePrivilegeChange(user: AuthUser, id: string, input: z.infer<typeof decidePrivilegeChangeSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Resident privilege change');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a privilege change in status '${before.status}'`);

  const requiredRole = requiredRoleFor(before.privilege_type, before.action);
  const resolution = await authorizeApproval(user, { requiredRole, campusId: before.campus_id });

  if (input.decision === 'approved') {
    const currentlyActive = await repo.findActiveForStudentAndType(before.student_id, before.privilege_type);
    if (currentlyActive && currentlyActive.id !== before.id) {
      await repo.update(currentlyActive.id, { superseded_by: before.id });
    }
  }

  const after = await repo.update(id, {
    status: input.decision,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    decision_reason: input.reason,
  });

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'resident_privilege_change',
    entityId: id,
    requiredRole,
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `privilege_change.${input.decision}`,
    entityType: 'resident_privilege_change',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'privilege_change.decided',
    title: `Your ${before.privilege_type.replace(/_/g, ' ')} change was ${input.decision}`,
    body: input.reason,
    link: '/allocations',
  });

  return after;
}

/** BRD's own "resident acknowledgement where required" — self-service,
 * only the affected student, only once it's actually in effect. */
export async function acknowledgePrivilegeChange(user: AuthUser, id: string, _input: z.infer<typeof acknowledgePrivilegeChangeSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Resident privilege change');
  if (before.student_id !== user.sub) throw new ForbiddenError('Only the affected resident can acknowledge this change');
  if (before.status !== 'approved') throw new ConflictError(`Cannot acknowledge a privilege change in status '${before.status}'`);

  const after = await repo.update(id, { resident_acknowledged_at: db.fn.now() });
  await recordAudit({
    orgId: before.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'privilege_change.acknowledged',
    entityType: 'resident_privilege_change',
    entityId: id,
    before,
    after,
  });
  return after;
}

/** Creates and immediately approves a new record that supersedes the
 * current active one — a reversal is itself an authorised decision, not a
 * fresh proposal awaiting someone else's sign-off, so it doesn't go
 * through the requested->approved round trip a normal change does. */
export async function reversePrivilegeChange(user: AuthUser, id: string, input: z.infer<typeof reversePrivilegeChangeSchema>) {
  const target = await repo.findById(id);
  if (!target) throw new NotFoundError('Resident privilege change');
  if (target.status !== 'approved') throw new ConflictError('Only an approved (currently active) privilege change can be reversed');
  if (target.superseded_by) throw new ConflictError('This privilege change has already been superseded');

  const requiredRole = requiredRoleFor(target.privilege_type, target.action);
  const resolution = await authorizeApproval(user, { requiredRole, campusId: target.campus_id });

  const reversal = await repo.create({
    org_id: target.org_id,
    campus_id: target.campus_id,
    student_id: target.student_id,
    privilege_type: target.privilege_type,
    action: 'restore',
    previous_configuration: JSON.stringify(target.proposed_configuration),
    proposed_configuration: JSON.stringify(input.proposedConfiguration),
    effective_from: db.fn.now(),
    initiator_user_id: user.sub,
    reason: input.reason,
    status: 'approved',
    decided_by: user.sub,
    decided_at: db.fn.now(),
    decision_reason: input.reason,
  });
  await repo.update(target.id, { superseded_by: reversal.id });

  await recordApprovalResolution({
    orgId: target.org_id,
    campusId: target.campus_id,
    entityType: 'resident_privilege_change',
    entityId: reversal.id,
    requiredRole,
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });
  await recordAudit({
    orgId: target.org_id,
    campusId: target.campus_id,
    actorUserId: user.sub,
    action: 'privilege_change.reversed',
    entityType: 'resident_privilege_change',
    entityId: reversal.id,
    before: target,
    after: reversal,
    reason: input.reason,
  });
  await notify({
    orgId: target.org_id,
    campusId: target.campus_id,
    userId: target.student_id,
    type: 'privilege_change.reversed',
    title: `Your ${target.privilege_type.replace(/_/g, ' ')} change was reversed`,
    body: input.reason,
    link: '/allocations',
  });

  return reversal;
}

export async function cancelPrivilegeChange(user: AuthUser, id: string, input: z.infer<typeof cancelPrivilegeChangeSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Resident privilege change');
  if (before.status !== 'requested') throw new ConflictError(`Cannot cancel a privilege change in status '${before.status}'`);
  if (before.initiator_user_id !== user.sub && !(await canManage(user))) {
    throw new ForbiddenError('Only the initiator or staff can cancel this privilege change');
  }

  const after = await repo.update(id, { status: 'cancelled', decision_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'privilege_change.cancelled',
    entityType: 'resident_privilege_change',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  return after;
}
