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
  // Was staff-only (canManage) — real bug, found live via SELF-TEST-GUIDE.md
  // Batch 20: Grievances.tsx's "Raise a grievance" form (resident-facing,
  // any Student) reuses this same endpoint to populate its "which staff
  // member does this concern" picker, and a 403 there just silently leaves
  // the dropdown empty (the fetch has no .catch — see that component). Just
  // names/roles of Warden/Head Warden, same sensitivity as the already-
  // ungated resident-directory above; assignment/triage/decide actions
  // themselves stay canManage-gated below, only the listing opened up.
  r.get('/staff-directory', controller.listCaseStaffDirectory);
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

  // D17.09 depth (TODO.md Batch 24) — no route-level canManage gate on any
  // of these: the restricted-tier check (canManageWelfareCase, standing
  // safeguarding role or an active case-specific grant) is genuinely
  // narrower than the ordinary case:manage permission and lives entirely
  // in service.ts, same reasoning as decide's own missing gate above.
  r.post('/:caseId/access-grants', controller.grantCaseAccess);
  r.post('/access-grants/:grantId/revoke', controller.revokeCaseAccess);
  r.post('/:caseId/missing-resident-checklist', controller.updateMissingResidentChecklist);
  r.post('/:caseId/emergency-restriction', controller.imposeEmergencyRestriction);
  r.post('/:caseId/emergency-restriction/review', controller.reviewEmergencyRestriction);

  return r;
}
