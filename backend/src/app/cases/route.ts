import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function casesRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('case:manage');

  // BR §9: "Any affected user" can raise a complaint/incident —
  // self-service, same reasoning as applications/transfers/movements.
  r.post('/', controller.reportCase);
  r.get('/', controller.listCases);
  // Must be registered before '/:caseId' — otherwise Express would swallow
  // this literal path as a caseId param match, same routing-order pitfall
  // as any other static-vs-param route pair in this codebase.
  r.get('/resident-directory', controller.listResidentDirectory);
  r.get('/staff-directory', canManage, controller.listCaseStaffDirectory);
  r.get('/:caseId', controller.getCase);

  r.post('/:caseId/triage', canManage, controller.triageCase);
  r.post('/:caseId/investigate', canManage, controller.investigateCase);
  r.post('/:caseId/resolve', canManage, controller.resolveCase);
  r.post('/:caseId/issue-notice', canManage, controller.issueNotice);
  // No route-level gate on decide — authorizeApproval (head_warden required,
  // with delegation/escalation fallback) is the real authority, same
  // reasoning as decideTransfer/decideMovement.
  r.post('/:caseId/decide', controller.decideCase);
  // Reporter-or-staff validated inside the service for these three.
  r.post('/:caseId/appeal', controller.appealCase);
  r.post('/:caseId/close', controller.closeCase);
  r.post('/:caseId/reopen', controller.reopenCase);

  return r;
}
