import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.26 (TODO.md Batch 30, item 126). The whole mutual-consent flow —
// request/respond/revoke — is resident self-service, validated in the
// service (§24J.1: this is a consent workflow, not a staff-run one).
// Only oversight (listing everyone's requests) and the allocation-time
// compatibility recommendation are staff-gated.
export function roommateRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('roommate:manage');

  r.post('/requests', controller.requestRoommate);
  r.get('/requests', controller.listMyRequests);
  r.get('/requests/all', canManage, controller.listAllRequests);
  r.get('/requests/:requestId', controller.getRequest);
  r.post('/requests/:requestId/respond', controller.respondToRequest);
  r.post('/requests/:requestId/revoke', controller.revokeRequest);

  r.get('/compatibility/:studentId', canManage, controller.getCompatibilityRecommendation);

  return r;
}
