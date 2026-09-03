import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.23 (TODO.md Batch 30, item 124). One permission ('laundry:manage')
// gates every staff action, same shape as every other module this
// session. Requesting/acknowledging/disputing/cancelling stay
// self-service by the resident, validated in the service.
export function laundryRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('laundry:manage');

  r.post('/', controller.requestOrder);
  r.get('/', controller.listOrders);
  r.get('/:orderId', controller.getOrder);
  r.post('/:orderId/accept', canManage, controller.acceptOrder);
  r.post('/:orderId/pickup', canManage, controller.recordPickup);
  r.post('/:orderId/start-processing', canManage, controller.startProcessing);
  r.post('/:orderId/ready', canManage, controller.markReadyForReturn);
  r.post('/:orderId/return', canManage, controller.recordReturn);
  r.post('/:orderId/acknowledge', controller.acknowledgeReturn);
  r.post('/:orderId/close', canManage, controller.closeOrder);
  r.post('/:orderId/dispute-count', controller.disputeCount);
  r.post('/:orderId/report-lost', controller.reportLostItem);
  r.post('/:orderId/report-damaged', controller.reportDamagedItem);
  r.post('/:orderId/resolve-exception', canManage, controller.resolveException);
  r.post('/:orderId/mark-unclaimed', canManage, controller.markUnclaimed);
  r.post('/:orderId/cancel', controller.cancelOrder);
  r.post('/:orderId/reopen', canManage, controller.reopenOrder);
  r.post('/:orderId/link-complaint', canManage, controller.linkComplaint);

  return r;
}
