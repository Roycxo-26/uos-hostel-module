import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.14 (TODO.md Batch 30, item 121). Campaign lifecycle management,
// staff analytics, and service-recovery case handling are all
// feedback:manage. Submitting a response is resident self-service — the
// scope/window/duplicate checks live in service.ts, not here (§22.2 is a
// resident action, not a staff one). revealIdentity is gated by its own,
// stronger permission (feedback:reveal_identity, Head Warden only) — see
// service.ts's own comment on why that's separate from feedback:manage.
export function feedbackRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('feedback:manage');
  const canReveal = requireHostelPermission('feedback:reveal_identity');

  r.post('/campaigns', canManage, controller.createCampaign);
  r.get('/campaigns', canManage, controller.listCampaigns);
  r.get('/campaigns/open', controller.listOpenCampaignsForMe);
  r.get('/campaigns/:campaignId', canManage, controller.getCampaign);
  r.post('/campaigns/:campaignId/open', canManage, controller.openCampaign);
  r.post('/campaigns/:campaignId/close', canManage, controller.closeCampaign);
  r.post('/campaigns/:campaignId/cancel', canManage, controller.cancelCampaign);
  r.post('/campaigns/:campaignId/analysis-ready', canManage, controller.markAnalysisReady);
  r.post('/campaigns/:campaignId/archive', canManage, controller.archiveCampaign);
  r.post('/campaigns/:campaignId/responses', controller.submitResponse);
  r.get('/campaigns/:campaignId/responses', canManage, controller.listResponses);
  r.get('/campaigns/:campaignId/analytics', canManage, controller.getAnalytics);

  r.post('/responses/:responseId/reveal-identity', canReveal, controller.revealIdentity);

  r.post('/cases', canManage, controller.createServiceRecoveryCase);
  r.get('/cases', canManage, controller.listServiceRecoveryCases);
  r.get('/cases/:caseId', canManage, controller.getServiceRecoveryCase);
  r.patch('/cases/:caseId', canManage, controller.updateServiceRecoveryCase);

  return r;
}
