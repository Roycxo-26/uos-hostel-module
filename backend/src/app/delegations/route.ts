import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// UOS_Final.docx audit (12 Sep 2026), section 6.4 — who can act on someone
// else's behalf while they're away. Gated the same way responsibility
// assignment is (both Warden and Head Warden hold the route permission);
// service.ts's own role-level check is what actually stops a Warden from
// delegating Head-Warden-level authority, same split of responsibility as
// every other ABAC-shaped check in this codebase.
export function delegationsRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('delegation:manage');

  r.post('/', canManage, controller.createDelegation);
  r.get('/', canManage, controller.listDelegations);
  r.get('/candidates', canManage, controller.listStaffCandidates);
  r.post('/:delegationId/revoke', canManage, controller.revokeDelegation);

  return r;
}
