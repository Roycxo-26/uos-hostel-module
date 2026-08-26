import { isSuperAdmin, type AuthUser } from '@uos/auth';
import { db } from '../../db';

/**
 * Not part of the template or the bundle's required-endpoints list — this
 * module's own addition, for two things nothing else exposes to a non-admin
 * caller:
 *   1. Every UI decision the frontend needs (show the Structure nav item?
 *      enable the Decide button?) depends on the caller's Hostel-module
 *      role, and the required admin endpoints (GET /api/admin/users/:userId)
 *      are org_admin-gated — a Warden can't call them to find out they're a
 *      Warden.
 *   2. Display name/email — deliberately absent from the JWT ("req.user
 *      does not include email or name... join shadow_users for display
 *      data" per uos-auth-package-README.md) — this is that join, done once
 *      for the caller's own record rather than every screen re-joining it.
 * Self-service throughout: scoped to req.user.sub, no permission gate
 * needed beyond being authenticated.
 */
export async function getMe(user: AuthUser) {
  const [profile, hostelRoles] = await Promise.all([
    db('shadow_users').where({ user_id: user.sub }).first('name', 'email'),
    db('user_roles').where({ user_id: user.sub, is_active: true }).select('campus_id', 'role'),
  ]);

  return {
    sub: user.sub,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    orgId: user.org_id,
    campusId: user.campus_id,
    campusScope: user.campus_scope,
    orgRole: user.org_role,
    isSuperAdmin: isSuperAdmin(user),
    hostelRoles: hostelRoles.map((r) => ({ campusId: r.campus_id, role: r.role })),
  };
}
