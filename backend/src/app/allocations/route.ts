import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function allocationsRouter(): Router {
  const r = Router();
  const canAllocate = requireHostelPermission('allocation:create');
  const canManageNoShow = requireHostelPermission('allocation:manage_noshow');

  r.post('/', canAllocate, controller.createAllocation);
  r.get('/', controller.listAllocations);

  // D17.03 — every specific-path route below is registered before the
  // :allocationId param route further down, same reasoning as the existing
  // /no-show-queue route: Express would otherwise try to treat e.g.
  // "waitlist" as an allocation id.
  r.get('/waitlist', canAllocate, controller.listWaitlist);
  r.get('/waitlist/mine', controller.getMyWaitlistPosition);
  r.patch('/waitlist/:entryId/priority', canAllocate, controller.updateWaitlistPriority);
  r.post('/waitlist/:entryId/withdraw', controller.withdrawFromWaitlist);

  r.post('/bed-holds', canAllocate, controller.reserveBed);
  r.post('/bed-holds/:holdId/release', canAllocate, controller.releaseBedHold);

  r.get('/no-bed-reason/:applicationId', canAllocate, controller.getNoBedReason);

  r.post('/offers', canAllocate, controller.createOffer);
  r.get('/offers', controller.listOffers);
  r.post('/offers/:offerId/accept', controller.acceptOffer);
  r.post('/offers/:offerId/decline', controller.declineOffer);
  r.post('/offers/:offerId/withdraw', canAllocate, controller.withdrawOffer);

  // Specific path registered before the :allocationId param route below, or
  // Express would try to treat "no-show-queue" as an allocation id.
  r.get('/no-show-queue', canManageNoShow, controller.listNoShowQueue);

  r.get('/:allocationId', controller.getAllocation);
  r.post('/:allocationId/no-show/release', canManageNoShow, controller.releaseNoShow);
  r.post('/:allocationId/no-show/extend', canManageNoShow, controller.extendNoShow);
  r.post('/:allocationId/no-show/defer', canManageNoShow, controller.deferNoShow);
  r.post('/:allocationId/no-show/reassign', canManageNoShow, controller.reassignNoShow);
  r.post('/:allocationId/cancel', controller.cancelAllocation);

  return r;
}
