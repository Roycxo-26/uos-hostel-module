import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.13 (TODO.md Batch 30). One permission ('off_campus:manage') gates
// every staff action. Requesting/confirming occupancy/requesting exit/
// cancelling stay self-service by the resident (validated in the
// service) — the same self-vs-staff shape as every other module this
// session.
export function offCampusRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('off_campus:manage');

  r.post('/providers', canManage, controller.createProvider);
  r.get('/providers', controller.listProviders);
  r.get('/providers/:providerId', controller.getProvider);
  r.post('/providers/:providerId/decide-compliance', canManage, controller.decideProviderCompliance);

  r.post('/placements', controller.requestPlacement);
  r.get('/placements', controller.listPlacements);
  r.get('/placements/:placementId', controller.getPlacement);
  r.post('/placements/:placementId/decide', canManage, controller.decidePlacement);
  r.post('/placements/:placementId/confirm-occupancy', controller.confirmOccupancy);
  r.post('/placements/:placementId/request-exit', controller.requestExit);
  r.post('/placements/:placementId/confirm-exit', canManage, controller.confirmExit);
  r.post('/placements/:placementId/cancel', controller.cancelPlacement);
  r.post('/placements/:placementId/link-issue', canManage, controller.linkIssueHandoff);

  return r;
}
