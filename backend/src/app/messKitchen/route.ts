import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.16 (TODO.md Batch 30, item 123). Connection status is visible to
// anyone authenticated (§24.2 — residents need to see the same
// disconnected/stale state staff do); the outbound event log is staff
// observability only.
export function messKitchenRouter(): Router {
  const r = Router();
  const canViewEvents = requireHostelPermission('mess_kitchen:view_events');

  r.get('/status', controller.getConnectionStatus);
  r.get('/events', canViewEvents, controller.listEvents);

  return r;
}
