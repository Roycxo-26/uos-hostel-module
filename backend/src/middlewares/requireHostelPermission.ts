import type { NextFunction, Request, Response } from 'express';
import { hasOrgRole, isSuperAdmin, requirePermission } from '@uos/auth';
import { MODULE } from '../constants';
import { redis } from '../redis';

/**
 * flow.md §5.1: "Super Admin has full tenant Hostel control. Admin has full
 * control within assigned university/campus scope." Both are PLATFORM-level
 * facts (is_super_admin / org_role === 'org_admin'), not this module's own
 * roles — per uos-auth-package-README.md's own warning: "req.user.org_role
 * is a platform role — use requireOrgRole for admin-only routes. For
 * feature-level permissions use your module's own role system, not org_role
 * alone." So they bypass this module's permission grants entirely rather
 * than needing a hostel.user_roles row; everyone else (Head Warden/Warden/
 * Student — see database/migrations' permission-tables migration) is
 * checked against this module's own role_permissions via requirePermission.
 *
 * Deliberately NOT delegation-aware: UOS HOSTEL BR.md §5.2 / flow.md §5A's
 * missing-approver framework (utils/approvalResolution.ts) lives at the
 * SERVICE layer, not here. A route-level permission string ("can this
 * caller reach this endpoint at all") and a specific record's approval
 * resolution ("who actually approved THIS Transfer/Gate Pass/etc., and
 * under what mode") are different questions — collapsing them into one
 * middleware would mean two places independently deciding delegation, or
 * this middleware silently becoming the only source of truth for something
 * that also has to be recorded per-record (approval_resolutions). Every
 * future approval-gated workflow should call authorizeApproval() itself
 * inside its own service function, after whatever coarse route-level gate
 * (if any) makes sense here.
 */
export function requireHostelPermission(permission: string) {
  const delegate = requirePermission(permission, { module: MODULE, redis });
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isSuperAdmin(req.user) || hasOrgRole(req.user, ['org_admin'])) {
      next();
      return;
    }
    delegate(req, res, next);
  };
}
