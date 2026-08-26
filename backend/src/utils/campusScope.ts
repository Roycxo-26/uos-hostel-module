import type { AuthUser } from '@uos/auth';
import { ForbiddenError, ValidationError } from '../middlewares/errorHandler';

/**
 * Resolves which campus_id a write should target. Real bug this guards
 * against — uos-module-developer-bundle/FOR_YOUR_CLAUDE_CODE.md §7 finding
 * 4 (cross-org IDOR): "a URL path param was trusted directly with no check
 * it matched the caller's own org... verify it matches the caller, don't
 * assume requireRole/requireOrgRole alone covers this." Same principle
 * applied to a body-supplied campusId here.
 *
 * - campus_scope 'SINGLE' or 'PARTIAL': the token is bound to exactly one
 *   campus_id for this session (AuthUser's own documented shape — PARTIAL's
 *   `campus_id` is "the campus selected at login", not a list). A caller
 *   cannot write to a different campus by passing one in the body — RLS's
 *   WITH CHECK would reject the actual insert anyway (campus_id must match
 *   current_setting('app.current_campus_id')), but rejecting it here first
 *   gives a clear 403 instead of an opaque Postgres error.
 * - campus_scope 'ALL' (org_admin/super_admin): no campus is pinned to the
 *   session, so the caller must specify which campus a new hostel/etc.
 *   belongs to.
 */
export function resolveCampusId(user: AuthUser, requestedCampusId?: string): string {
  if (user.campus_scope === 'ALL') {
    if (!requestedCampusId) {
      throw new ValidationError('campusId is required when acting with campus_scope=ALL');
    }
    return requestedCampusId;
  }

  if (requestedCampusId && requestedCampusId !== user.campus_id) {
    throw new ForbiddenError('campusId does not match your assigned campus for this session');
  }

  return user.campus_id;
}
