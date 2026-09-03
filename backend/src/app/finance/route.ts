import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.05 (TODO.md Batch 27). Raising/reversing an event is staff-only
// (finance_event:manage); listing/viewing is open at the route level and
// filtered to "your own" inside the service for a resident, same pattern
// as checkouts/cases. Confirm and dispute are deliberately NOT gated by
// requireHostelPermission here — same reasoning as checkouts' own approve
// route: confirm's real authority (Head Warden or a standing Finance
// Officer) and dispute's real authority (the resident the event belongs
// to) are both business rules the service layer alone can evaluate.
export function financeRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('finance_event:manage');

  r.post('/', canManage, controller.raiseFinancialEvent);
  r.get('/', controller.listFinancialEvents);
  r.get('/summary/:studentId', controller.getResidentFinancialSummary);
  r.get('/:eventId', controller.getFinancialEvent);
  r.post('/:eventId/confirm', controller.confirmFinancialEvent);
  r.post('/:eventId/dispute', controller.disputeFinancialEvent);
  r.post('/:eventId/reverse', canManage, controller.reverseFinancialEvent);

  return r;
}
