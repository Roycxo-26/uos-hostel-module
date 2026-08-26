import { assertCanGrant, hasOrgRole, invalidatePermissions, isSuperAdmin, type AdminUserRole, type AuthUser } from '@uos/auth';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { redis } from '../../redis';

/**
 * Confirmed against the real @uos/auth package (types.d.ts) once collaborator
 * access was granted: `AdminUserRole` is `{ userId, name, email, role,
 * campusId, grantedAt, active }` — our earlier best-effort inference had this
 * as `isActive` (should be `active`) and was missing `grantedAt` entirely.
 * `grantedAt` maps to `user_roles.updated_at`, not `created_at`: grantRole()'s
 * onConflict().merge(['role', 'is_active', 'updated_at']) bumps updated_at on
 * every grant/re-grant, so it reflects when the CURRENTLY active role was
 * granted — created_at would stay frozen at the very first grant even after
 * a later role change.
 */
function toAdminUserRole(row: {
  user_id: string;
  name: string;
  email: string;
  campus_id: string;
  role: string;
  is_active: boolean;
  updated_at: Date;
}): AdminUserRole {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    campusId: row.campus_id,
    role: row.role,
    grantedAt: row.updated_at.toISOString(),
    active: row.is_active,
  };
}

function baseQuery() {
  return db('user_roles')
    .join('shadow_users', 'shadow_users.user_id', 'user_roles.user_id')
    .select(
      'user_roles.user_id',
      'shadow_users.name',
      'shadow_users.email',
      'user_roles.campus_id',
      'user_roles.role',
      'user_roles.is_active',
      'user_roles.updated_at'
    );
}

export async function listUsers(): Promise<AdminUserRole[]> {
  const rows = await baseQuery().orderBy('shadow_users.name');
  return rows.map(toAdminUserRole);
}

export async function getUser(userId: string): Promise<AdminUserRole[]> {
  const rows = await baseQuery().where('user_roles.user_id', userId);
  return rows.map(toAdminUserRole);
}

export async function grantRole(actor: AuthUser, targetUserId: string, input: { role: string; campusId: string }): Promise<AdminUserRole[]> {
  // flow.md §5.1: Super Admin/Admin (org_admin) have platform-level
  // authority over this module, not a hostel.role_levels entry — assertCanGrant
  // compares the GRANTER's own module-role level against the target's, which
  // doesn't apply to an authority that sits above the module's role table
  // entirely. Everyone else goes through the real escalation check, per the
  // "Never skip assertCanGrant" rule.
  const actorIsPlatformAdmin = isSuperAdmin(actor) || hasOrgRole(actor, ['org_admin']);
  if (!actorIsPlatformAdmin) {
    await assertCanGrant({
      granterId: actor.sub,
      campusId: input.campusId,
      targetRole: input.role,
      module: MODULE,
      db,
    });
  }

  await db('user_roles')
    .insert({
      user_id: targetUserId,
      campus_id: input.campusId,
      role: input.role,
      is_active: true,
    })
    .onConflict(['user_id', 'campus_id'])
    .merge(['role', 'is_active', 'updated_at']);

  await invalidatePermissions(targetUserId, MODULE, redis, input.campusId);

  return getUser(targetUserId);
}

export async function revokeRole(targetUserId: string, role: string, campusId?: string): Promise<AdminUserRole[]> {
  const query = db('user_roles').where({ user_id: targetUserId, role });
  if (campusId) query.andWhere({ campus_id: campusId });

  const affected: Array<{ campus_id: string }> = await query.clone().select('campus_id');
  await query.delete();

  // "Always pass campusId — without it, expired Redis keys leave stale LRU
  // entries live for up to 30s." One call per affected campus, not a single
  // scan-based call, since a revoke can span more than one campus_id row.
  for (const row of affected) {
    await invalidatePermissions(targetUserId, MODULE, redis, row.campus_id);
  }

  return getUser(targetUserId);
}
