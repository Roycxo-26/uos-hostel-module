import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function checkinsRouter(): Router {
  const r = Router();

  // flow.md §11 Approval Matrix: "Check-in/out | Initiator: Warden + Student".
  // Recorded as a Warden-performed action (student physically present)
  // rather than a two-call request/approve pair — HST-WF-04 describes it as
  // one combined moment, not a request/approve pair.
  r.post('/', requireHostelPermission('checkin:create'), controller.createCheckIn);
  r.get('/by-allocation/:allocationId', controller.getCheckInByAllocation);

  return r;
}
