import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function applicationsRouter(): Router {
  const r = Router();

  // flow.md §11 Approval Matrix: "Hostel application | Initiator: Student".
  // No module-role gate — any authenticated resident can apply for
  // themselves; requireAuth+scopedRequest (global in app.ts) is enough.
  r.post('/', controller.submitApplication);

  r.get('/', controller.listApplications);
  r.get('/:applicationId', controller.getApplication);

  // flow.md §11: "Approver: Warden/Admin reviewer per tenant policy".
  r.post('/:applicationId/decide', requireHostelPermission('application:decide'), controller.decideApplication);

  // BR §6 RETURNED -> resubmit loop. Student-only (enforced in the service,
  // same "owning student" check submitApplication/getApplication already
  // use) — no module-role gate needed here either.
  r.post('/:applicationId/resubmit', controller.resubmitApplication);

  // D17.02 item 51. Withdraw is student-only (service-enforced, same
  // pattern as resubmit); Cancel/Reopen are staff actions reusing
  // 'application:decide' — the same authority that can approve/reject an
  // application can also cancel or reopen one, rather than inventing a
  // second permission for what's the same reviewer role.
  r.post('/:applicationId/withdraw', controller.withdrawApplication);
  r.post('/:applicationId/cancel', requireHostelPermission('application:decide'), controller.cancelApplication);
  r.post('/:applicationId/reopen', requireHostelPermission('application:decide'), controller.reopenApplication);

  return r;
}
