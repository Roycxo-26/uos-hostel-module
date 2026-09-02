import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function transfersRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('transfer:decide');

  // BR §7: "Residents shall request room/bed transfer" — self-service, no
  // module-role gate, same reasoning as applications' submitApplication.
  // Staff requesting on a resident's behalf (or an emergency relocation) is
  // validated inside the service (requestTransfer), not here.
  r.post('/', controller.requestTransfer);

  // D17.07 item 101 — before '/:transferId' so it isn't swallowed as a
  // param match, same ordering rule every other module's own static-path-
  // first routes already follow.
  r.get('/campuses', canManage, controller.listDestinationCampuses);

  r.get('/', controller.listTransfers);
  r.get('/:transferId', controller.getTransfer);

  r.post('/:transferId/decide', canManage, controller.decideTransfer);
  // D17.07 item 101 — the destination campus's own acceptance step.
  // canManage here is the SAME 'transfer:decide' permission, just checked
  // (and, inside authorizeApproval, role-resolved) against the destination
  // campus's session — see service.ts's own comment.
  r.post('/:transferId/accept-destination', canManage, controller.acceptDestinationTransfer);
  r.post('/:transferId/execute', canManage, controller.executeTransfer);

  // Cancel: requester or staff — validated inside the service, same
  // reasoning as decide above.
  r.post('/:transferId/cancel', controller.cancelTransfer);

  return r;
}
