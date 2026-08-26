import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.21 (TODO.md Batch 20). Raising/responding/
// appealing/withdrawing a grievance, and acknowledging/declining a policy,
// are resident-initiated — no route-level role gate (service.ts enforces
// ownership), same pattern applications/route.ts already uses for
// resubmit/withdraw. Everything else is staff-only via 'grievance:manage'.
export function grievancesRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('grievance:manage');

  // Specific paths before :grievanceId/:versionId param routes.
  r.get('/my-rights', controller.getMyRights);
  r.get('/policy-versions', controller.listPolicyVersions);
  r.post('/policy-versions', canManage, controller.publishPolicyVersion);
  r.get('/policy-versions/:versionId/acknowledgements', canManage, controller.listAcknowledgementsForVersion);
  r.post('/policy-versions/:versionId/acknowledge', controller.acknowledgePolicy);
  r.post('/policy-versions/:versionId/decline', controller.declinePolicy);

  r.post('/', controller.raiseGrievance);
  r.get('/', controller.listGrievances);
  r.get('/:grievanceId', controller.getGrievance);
  r.post('/:grievanceId/assign', canManage, controller.assignReviewer);
  r.post('/:grievanceId/return-for-information', canManage, controller.returnForInformation);
  r.post('/:grievanceId/respond', controller.respondToInformationRequest);
  r.post('/:grievanceId/interim-action', canManage, controller.setInterimAction);
  r.post('/:grievanceId/refer', canManage, controller.setReferral);
  r.post('/:grievanceId/decide', canManage, controller.issueDecision);
  r.post('/:grievanceId/appeal', controller.submitAppeal);
  r.post('/:grievanceId/assign-independent-reviewer', canManage, controller.assignIndependentReviewer);
  r.post('/:grievanceId/final-decision', canManage, controller.issueFinalDecision);
  r.post('/:grievanceId/resolve', canManage, controller.resolveGrievance);
  r.post('/:grievanceId/close', canManage, controller.closeGrievance);
  r.post('/:grievanceId/reopen', canManage, controller.reopenGrievance);
  r.post('/:grievanceId/withdraw', controller.withdrawGrievance);

  return r;
}
