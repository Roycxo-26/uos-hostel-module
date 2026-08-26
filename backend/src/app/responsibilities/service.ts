import { getPermissions, hasOrgRole, hasPermission, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import { DUTY_PRIVILEGE_TYPES, type PrivilegeType } from './types';
import type {
  createAssignmentSchema,
  createDutyAssignmentSchema,
  listAssignmentsQuerySchema,
  revokeAssignmentSchema,
  setSubstituteSchema,
} from './validators';

// D17.22 item 83 gap-closure — createAssignment's own notify() calls used
// to hardcode a two-way room_head/floor_incharge ternary; that silently
// mislabelled every duty-roster privilege as "Floor In-charge" the moment
// this batch added five more values to the same enum. One real label
// table instead.
const PRIVILEGE_LABELS: Record<PrivilegeType, string> = {
  attendance_taker: 'Attendance Taker',
  verifier: 'Verifier',
  room_head: 'Room Head',
  floor_incharge: 'Floor In-charge',
  duty_warden: 'Duty Warden',
  floor_duty_officer: 'Floor Duty Officer',
  front_desk_shift: 'Front Desk Shift',
  security_contact: 'Security Contact',
  emergency_contact: 'Emergency Contact',
};

/** BR §2: Room Head is scoped to a room, Floor/Side In-charge to a floor —
 * validated against the real structure, not just a UUID shape. Widened
 * for D17.22 item 83 — duty-roster roles may also scope to a whole
 * hostel (e.g. Duty Warden, Front Desk Shift), not just room/floor. */
async function validateScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string): Promise<{ campus_id: string }> {
  const table = scopeType === 'room' ? 'rooms' : scopeType === 'floor' ? 'floors' : 'hostels';
  const row = await db(table).where({ id: scopeId }).first('campus_id');
  if (!row) throw new NotFoundError(scopeType === 'room' ? 'Room' : scopeType === 'floor' ? 'Floor' : 'Hostel');
  return row;
}

export async function createAssignment(user: AuthUser, input: z.infer<typeof createAssignmentSchema>) {
  const scope = await validateScope(input.scopeType, input.scopeId);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    assignee_user_id: input.assigneeUserId,
    privilege_type: input.privilegeType,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    effective_from: input.effectiveFrom ? new Date(input.effectiveFrom) : db.fn.now(),
    effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null,
    assigned_by: user.sub,
    substitute_user_id: input.substituteUserId ?? null,
    status: 'active',
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'responsibility.assigned',
    entityType: 'responsibility_assignment',
    entityId: row.id,
    after: row,
  });

  await notify({
    orgId: user.org_id,
    campusId: scope.campus_id,
    userId: input.assigneeUserId,
    type: 'responsibility.assigned',
    title: `You've been assigned ${PRIVILEGE_LABELS[input.privilegeType]}`,
    link: '/movement',
  });

  if (input.substituteUserId) {
    await notify({
      orgId: user.org_id,
      campusId: scope.campus_id,
      userId: input.substituteUserId,
      type: 'responsibility.substitute_assigned',
      title: `You've been named substitute ${PRIVILEGE_LABELS[input.privilegeType]}`,
      link: '/movement',
    });
  }

  return row;
}

/**
 * flow.md §5A's delegation framework, applied here: name (or clear) a
 * substitute for an active assignment without revoking and recreating it.
 * UAT.md Batch 10 gap-closure — "no substitute/fallback if an assigned Room
 * Head/Floor In-charge is unavailable." An active substitute can act on this
 * exact scope exactly like the primary assignee — see
 * headcount/service.ts's canActOnScope, the actual enforcement point.
 */
export async function setSubstitute(user: AuthUser, id: string, input: z.infer<typeof setSubstituteSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Responsibility assignment');
  if (before.status !== 'active') throw new ConflictError(`Cannot set a substitute on an assignment in status '${before.status}'`);
  if (input.substituteUserId === before.assignee_user_id) {
    throw new ConflictError('A substitute cannot be the same person as the primary assignee');
  }

  const after = await repo.update(id, { substitute_user_id: input.substituteUserId });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: input.substituteUserId ? 'responsibility.substitute_set' : 'responsibility.substitute_cleared',
    entityType: 'responsibility_assignment',
    entityId: id,
    before,
    after,
  });

  if (input.substituteUserId) {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: input.substituteUserId,
      type: 'responsibility.substitute_assigned',
      title: `You've been named substitute ${PRIVILEGE_LABELS[before.privilege_type as PrivilegeType]}`,
      link: '/movement',
    });
  }

  return after;
}

export async function listAssignments(filters: z.infer<typeof listAssignmentsQuerySchema>) {
  return repo.list(filters);
}

export async function listResidentCandidates() {
  return repo.listResidentCandidates();
}

export async function getAssignment(id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Responsibility assignment');
  return row;
}

export async function revokeAssignment(user: AuthUser, id: string, input: z.infer<typeof revokeAssignmentSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Responsibility assignment');
  if (before.status !== 'active') throw new ConflictError(`Cannot revoke an assignment in status '${before.status}'`);

  const after = await repo.update(id, { status: 'revoked', revoke_reason: input.reason });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'responsibility.revoked',
    entityType: 'responsibility_assignment',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — the assignee was
  // notified when granted this responsibility (createAssignment, above)
  // but never told when it was taken away; they'd only find out the next
  // time they tried to act on that scope and got rejected.
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.assignee_user_id,
    type: 'responsibility.revoked',
    title: `Your ${PRIVILEGE_LABELS[before.privilege_type as PrivilegeType]} assignment was revoked`,
    body: input.reason,
    link: '/movement',
  });

  return after;
}

// ============================================================================
// D17.22 item 83 — duty-roster creation, same table/repository, a
// separate schema (see validators.ts's own comment on why).
// ============================================================================

export async function createDutyAssignment(user: AuthUser, input: z.infer<typeof createDutyAssignmentSchema>) {
  const scope = await validateScope(input.scopeType, input.scopeId);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    assignee_user_id: input.assigneeUserId,
    privilege_type: input.privilegeType,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    effective_from: new Date(input.effectiveFrom),
    effective_to: new Date(input.effectiveTo),
    assigned_by: user.sub,
    substitute_user_id: input.substituteUserId ?? null,
    status: 'active',
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'responsibility.duty_assigned',
    entityType: 'responsibility_assignment',
    entityId: row.id,
    after: row,
  });

  await notify({
    orgId: user.org_id,
    campusId: scope.campus_id,
    userId: input.assigneeUserId,
    type: 'responsibility.duty_assigned',
    title: `You're on duty as ${PRIVILEGE_LABELS[input.privilegeType]} from ${new Date(input.effectiveFrom).toLocaleString()} to ${new Date(input.effectiveTo).toLocaleString()}`,
    link: '/movement',
  });
  if (input.substituteUserId) {
    await notify({
      orgId: user.org_id,
      campusId: scope.campus_id,
      userId: input.substituteUserId,
      type: 'responsibility.substitute_assigned',
      title: `You've been named backup ${PRIVILEGE_LABELS[input.privilegeType]} for the same window`,
      link: '/movement',
    });
  }

  return row;
}

// ============================================================================
// D17.22 item 84 — coverage validation + escalation-resolution chain.
// ============================================================================

export interface DutyResolution {
  privilegeType: PrivilegeType;
  resolvedUserId: string | null;
  resolvedVia: 'primary' | 'substitute' | 'head_warden_escalation' | 'unresolved';
}

/**
 * The BRD's own ladder: primary duty-holder -> their substitute -> any
 * active Head Warden (Escalation Level 2) -> a critical, staff-wide gap
 * alert if even that resolves to nobody. Returns who resolved and how,
 * rather than throwing — a caller (e.g. an emergency flow) needs to know
 * WHETHER coverage exists before deciding what to do next, not just get
 * an exception.
 */
export async function resolveDutyAuthority(
  user: AuthUser,
  privilegeType: PrivilegeType,
  scopeType: 'room' | 'floor' | 'hostel',
  scopeId: string
): Promise<DutyResolution> {
  const holder = await repo.findActiveHolder(privilegeType, scopeType, scopeId);
  if (holder?.assignee_user_id) {
    return { privilegeType, resolvedUserId: holder.assignee_user_id, resolvedVia: 'primary' };
  }
  if (holder?.substitute_user_id) {
    return { privilegeType, resolvedUserId: holder.substitute_user_id, resolvedVia: 'substitute' };
  }

  const scope = await validateScope(scopeType, scopeId);
  const headWardens = await repo.listActiveHeadWardens(scope.campus_id);
  if (headWardens.length > 0) {
    return { privilegeType, resolvedUserId: headWardens[0].user_id, resolvedVia: 'head_warden_escalation' };
  }

  await notifyCampusStaff(db, user.org_id, scope.campus_id, {
    type: 'responsibility.coverage_gap',
    title: `Critical duty coverage gap: no ${PRIVILEGE_LABELS[privilegeType]} could be resolved for this scope`,
    link: '/movement',
  });
  return { privilegeType, resolvedUserId: null, resolvedVia: 'unresolved' };
}

/**
 * Unfilled-slot detection (item 84's other half) — walks every duty role
 * in the BRD's ladder for a scope and reports which ones currently
 * resolve to nobody. A real "leave/absence conflict" check would need
 * D14's workforce roster, which doesn't exist yet — this only checks
 * what this system can actually know: is there a currently-active
 * assignment (or substitute) at all.
 */
export async function getCoverageValidation(user: AuthUser, scopeType: 'room' | 'floor' | 'hostel', scopeId: string) {
  if (!(await canManage(user))) throw new ForbiddenError('Only staff can run a coverage validation');
  const resolutions = await Promise.all(DUTY_PRIVILEGE_TYPES.map((pt) => resolveDutyAuthority(user, pt, scopeType, scopeId)));
  const gaps = resolutions.filter((r) => r.resolvedVia === 'unresolved');
  return { scopeType, scopeId, resolutions, hasGaps: gaps.length > 0 };
}

async function canManage(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'responsibility:assign');
}
