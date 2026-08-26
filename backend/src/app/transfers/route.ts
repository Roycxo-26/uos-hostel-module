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

  r.get('/', controller.listTransfers);
  r.get('/:transferId', controller.getTransfer);

  r.post('/:transferId/decide', canManage, controller.decideTransfer);
  r.post('/:transferId/execute', canManage, controller.executeTransfer);

  // Cancel: requester or staff — validated inside the service, same
  // reasoning as decide above.
  r.post('/:transferId/cancel', controller.cancelTransfer);

  return r;
}
