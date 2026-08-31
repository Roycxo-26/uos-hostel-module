import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.25 (TODO.md Batch 22). All actions gated by a
// new 'closure:manage' permission (granted to warden/head_warden in the
// seed) — same staff-only reasoning as safety/roomAccess/commonAreas:
// there's no scoped Room-Head/Floor-Incharge equivalent for a bulk
// shutdown/relocation case in this BRD. decideClosureCase additionally
// requires head_warden specifically, enforced inside service.ts via
// authorizeApproval — same pattern as transfers/service.ts's decideTransfer.
export function closuresRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('closure:manage');

  r.post('/', canManage, controller.createClosureCase);
  r.get('/', canManage, controller.listClosureCases);
  r.get('/:caseId', canManage, controller.getClosureCase);
  r.post('/:caseId/decide', canManage, controller.decideClosureCase);
  r.post('/:caseId/start', canManage, controller.startClosureCase);
  r.post('/:caseId/impacts', canManage, controller.addManualImpact);
  r.post('/:caseId/reopening-checklist', canManage, controller.updateReopeningChecklist);
  r.post('/:caseId/complete', canManage, controller.completeClosureCase);
  r.post('/:caseId/cancel', canManage, controller.cancelClosureCase);
  r.post('/impacts/:impactId/resolve', canManage, controller.resolveImpact);

  return r;
}
