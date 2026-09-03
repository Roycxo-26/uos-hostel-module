import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.06 (TODO.md Batch 28). Requesting/resubmitting/cancelling is
// self-service by the host (validated in the service); everything else —
// deciding, entering/exiting, closing, reopening, hotlisting, the shift
// handover — is staff-only via visitor:manage.
export function visitorsRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('visitor:manage');

  r.post('/', controller.requestVisitor);
  r.get('/', controller.listVisitorRequests);
  // Specific path before the :visitorId param route below.
  r.get('/shift-handover', canManage, controller.getShiftHandover);
  r.get('/:visitorId', controller.getVisitorRequest);
  r.post('/:visitorId/decide', canManage, controller.decideVisitorRequest);
  r.post('/:visitorId/resubmit', controller.resubmitVisitorRequest);
  r.post('/:visitorId/cancel', controller.cancelVisitorRequest);
  r.post('/:visitorId/enter', canManage, controller.recordVisitorEntry);
  r.post('/:visitorId/exit', canManage, controller.recordVisitorExit);
  r.post('/:visitorId/close', canManage, controller.closeVisitorRequest);
  r.post('/:visitorId/reopen', canManage, controller.reopenVisitorRequest);
  r.post('/:visitorId/hotlist', canManage, controller.hotlistCredential);

  return r;
}
