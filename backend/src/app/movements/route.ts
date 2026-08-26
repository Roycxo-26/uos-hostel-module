import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function movementsRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('movement:manage');

  // BR §8: "Residents shall request leave/gate pass" — self-service.
  r.post('/', controller.requestMovement);
  r.get('/', controller.listMovements);
  r.get('/:movementId', controller.getMovement);

  r.post('/:movementId/decide', canManage, controller.decideMovement);
  r.post('/:movementId/cancel', controller.cancelMovement); // requester-or-staff validated in the service
  r.post('/:movementId/record-exit', canManage, controller.recordExit);
  r.post('/:movementId/record-return', canManage, controller.recordReturn);

  return r;
}
