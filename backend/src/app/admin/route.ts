import { Router } from 'express';
import { requireOrgRole } from '@uos/auth';
import * as controller from './controller';

// Required by @uos/auth's spec: "Every module must expose these four
// endpoints (the unified admin shell calls them)." org_admin-gated per the
// auth-server's own convention for admin-type endpoints (Users, Orgs &
// Campuses, Module access are all "org_admin / super_admin" in
// uos-auth-server-README.md) — requireOrgRole's is_super_admin bypass is
// one of the bundle's own §7 fixes (finding 6), trusted here rather than
// re-implemented.
export function adminRouter(): Router {
  const r = Router();
  r.use(requireOrgRole(['org_admin']));

  r.get('/users', controller.listUsers);
  r.get('/users/:userId', controller.getUser);
  r.post('/users/:userId/roles', controller.grantRole);
  r.delete('/users/:userId/roles/:role', controller.revokeRole);

  return r;
}
