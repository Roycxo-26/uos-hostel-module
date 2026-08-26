import type { AuthUser } from '@uos/auth';
import { isSuperAdmin, hasOrgRole } from '@uos/auth';
import { db } from '../db';
import { ForbiddenError } from '../middlewares/errorHandler';

/**
 * UOS HOSTEL BR.md §5.2 / flow.md §5A — the missing-approver delegation/
 * escalation/bypass framework. Shared by every future approval-gated
 * workflow (Transfer, Gate Pass, Complaints, Checkout — none built yet) so
 * this is written once, not reinvented per workflow. See
 * middlewares/requireHostelPermission.ts for how a route opts into this.
 *
 * NOT yet wired into any already-built endpoint (decideApplication,
 * createAllocation) in this pass — retrofitting a live, working approval
 * point is a deliberate, separate decision, not something to bundle
 * silently into building this framework. TODO.md Batch 3 (Transfer) is the
 * first real consumer and the first place this gets genuinely proven, the
 * same way Batch 1's schema changes weren't "done" until migrate:latest
 * actually ran.
 */

export type ApprovalMode = 'NORMAL' | 'DELEGATED' | 'ESCALATED' | 'BYPASS';

export interface ApprovalResolution {
  mode: ApprovalMode;
  /** Null for DELEGATED/ESCALATED — a role-pool resolution has no single
   * named person who was "supposed to" approve. Always the actor for
   * NORMAL; always the actor for BYPASS too (there's no "planned" approver
   * in an emergency-bypass path by definition). */
  plannedApproverUserId: string | null;
  governingRule: string;
}

/** hostel.role_levels' own numeric ordering (see migration 3: "higher =
 * more privileged"). Used only to decide ESCALATED — whether the actor
 * holds a role ranked above the one the action actually requires — not to
 * duplicate the permission check itself (getPermissions/hasPermission via
 * requireHostelPermission still owns that). */
async function getUserHighestRoleLevel(userId: string, campusId: string): Promise<number | null> {
  const row = await db('user_roles')
    .join('role_levels', 'role_levels.role', 'user_roles.role')
    .where({ 'user_roles.user_id': userId, 'user_roles.campus_id': campusId, 'user_roles.is_active': true })
    .orderBy('role_levels.level', 'desc')
    .first('role_levels.level');
  return row?.level ?? null;
}

async function getRoleLevel(role: string): Promise<number | null> {
  const row = await db('role_levels').where({ role }).first('level');
  return row?.level ?? null;
}

async function hasActiveDelegation(userId: string, role: string, campusId: string): Promise<boolean> {
  const row = await db('approver_delegations')
    .where({ delegate_user_id: userId, role, campus_id: campusId, active: true })
    .andWhere('effective_from', '<=', db.fn.now())
    .andWhere('effective_to', '>=', db.fn.now())
    .first('id');
  return Boolean(row);
}

/**
 * Route resolution order per flow.md §5A: assigned approver -> active
 * delegate -> configured role pool -> escalation authority -> permitted
 * emergency bypass. "Configured role pool" isn't a separate branch here —
 * a user directly holding `requiredRole` (or higher) at the campus already
 * covers "assigned approver" and "role pool" together, since this module
 * has no notion of one single named "the" approver per record, only a role.
 *
 * Throws ForbiddenError if nothing resolves — callers should let that
 * propagate (matches every other guard in this codebase).
 */
export async function authorizeApproval(
  user: AuthUser,
  params: {
    requiredRole: string;
    campusId: string;
    allowBypass?: boolean;
    bypassReason?: string;
  }
): Promise<ApprovalResolution> {
  const { requiredRole, campusId, allowBypass, bypassReason } = params;

  // Platform admin bypass (org_admin/is_super_admin) is deliberately NOT
  // checked here — BR §5.2: "SYSTEM_ADMIN cannot bypass a business approval
  // merely because the user manages the platform." requireHostelPermission
  // already grants platform admins access at the route level for its own
  // reasons (flow.md §5.1's "full tenant control" tier); this function is
  // only ever reached for THIS module's own role-based resolution, so it
  // correctly never sees a pure-platform-admin caller with no module role.

  const requiredLevel = await getRoleLevel(requiredRole);
  const actorLevel = await getUserHighestRoleLevel(user.sub, campusId);

  if (actorLevel !== null && requiredLevel !== null) {
    if (actorLevel === requiredLevel) {
      return { mode: 'NORMAL', plannedApproverUserId: user.sub, governingRule: `holds ${requiredRole} at campus` };
    }
    if (actorLevel > requiredLevel) {
      return {
        mode: 'ESCALATED',
        plannedApproverUserId: null,
        governingRule: `higher-ranked role (level ${actorLevel}) acting for required role ${requiredRole} (level ${requiredLevel})`,
      };
    }
  }

  if (await hasActiveDelegation(user.sub, requiredRole, campusId)) {
    return { mode: 'DELEGATED', plannedApproverUserId: null, governingRule: `active delegation for ${requiredRole} at campus` };
  }

  // BYPASS is opt-in per call site (allowBypass), never inferred — BR §5.2:
  // "Bypass is allowed only for configured transaction types... routine
  // requests use delegation/escalation." A caller that never passes
  // allowBypass:true has decided this action type is never bypassable.
  if (allowBypass && bypassReason) {
    return { mode: 'BYPASS', plannedApproverUserId: null, governingRule: `emergency bypass: ${bypassReason}` };
  }

  throw new ForbiddenError(
    `No valid approval path for role '${requiredRole}' — not directly held, no active delegation, and bypass ${
      allowBypass ? 'requires a reason' : 'is not permitted for this action'
    }`
  );
}

/** Persists the resolution — call after the underlying business action
 * succeeds, same "audit what actually happened" pattern as utils/audit.ts. */
export async function recordApprovalResolution(params: {
  orgId: string;
  campusId: string;
  entityType: string;
  entityId: string;
  requiredRole: string;
  resolution: ApprovalResolution;
  actualApproverUserId: string;
  reason?: string;
  evidence?: unknown[];
}): Promise<void> {
  await db('approval_resolutions').insert({
    org_id: params.orgId,
    campus_id: params.campusId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    required_role: params.requiredRole,
    planned_approver_user_id: params.resolution.plannedApproverUserId,
    actual_approver_user_id: params.actualApproverUserId,
    mode: params.resolution.mode,
    governing_rule: params.resolution.governingRule,
    reason: params.reason ?? null,
    evidence: JSON.stringify(params.evidence ?? []),
  });
}

/** BR §5.2: "Emergency bypass produces a provisional decision where policy
 * requires later ratification." Called separately, once a reviewer
 * confirms/amends/reverses a BYPASS-mode resolution. Not yet called from
 * anywhere — no workflow produces a BYPASS resolution yet either. */
export async function ratifyBypass(
  resolutionId: string,
  reviewerUserId: string,
  outcome: 'confirmed' | 'amended' | 'reversed'
): Promise<void> {
  await db('approval_resolutions')
    .where({ id: resolutionId, mode: 'BYPASS' })
    .update({
      retrospective_reviewer_user_id: reviewerUserId,
      retrospective_reviewed_at: db.fn.now(),
      retrospective_outcome: outcome,
    });
}

// Re-exported for call sites that need to distinguish platform-admin bypass
// from this module's own role-based flow without importing @uos/auth twice.
export { isSuperAdmin, hasOrgRole };
