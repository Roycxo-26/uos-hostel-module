import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.07 item 100 (TODO.md Batch 25). Staff-initiated throughout — see
// service.ts's own comment on why there's no resident self-service submit
// path here, unlike applications/transfers/movements. Acknowledge is the
// one resident-initiated action (self-validated in the service).
export function privilegeChangesRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('privilege_change:manage');

  r.post('/', canManage, controller.requestPrivilegeChange);
  r.get('/', controller.listPrivilegeChanges);
  r.get('/:privilegeChangeId', controller.getPrivilegeChange);
  r.post('/:privilegeChangeId/decide', canManage, controller.decidePrivilegeChange);
  r.post('/:privilegeChangeId/acknowledge', controller.acknowledgePrivilegeChange);
  r.post('/:privilegeChangeId/reverse', canManage, controller.reversePrivilegeChange);
  r.post('/:privilegeChangeId/cancel', controller.cancelPrivilegeChange);

  return r;
}
