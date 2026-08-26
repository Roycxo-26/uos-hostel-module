import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function headcountRouter(): Router {
  const r = Router();

  // No route-level permission gate on open/list/get/mark/close — a plain
  // Student with an active Room Head/Floor In-charge assignment must be
  // able to reach these (flow.md §5.2's core rule: a title alone grants
  // nothing, but an active assignment does, and it's checked in the
  // service, not by role membership here). See headcount/service.ts's
  // canActOnScope for the real authorization.
  r.post('/sessions', controller.openSession);
  r.get('/sessions', controller.listSessions);

  // Specific path before the :sessionId param route, same reasoning as
  // allocations/route.ts's no-show-queue.
  r.get('/sessions/reconciliation', requireHostelPermission('headcount:manage'), controller.listOpenIssues);

  r.get('/sessions/:sessionId', controller.getSession);
  r.post('/sessions/:sessionId/entries', controller.markEntry);
  r.post('/sessions/:sessionId/close', controller.closeSession);

  return r;
}
