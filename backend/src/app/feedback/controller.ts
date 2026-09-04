import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelCampaignSchema,
  createCampaignSchema,
  createServiceRecoveryCaseSchema,
  listCampaignsQuerySchema,
  listCasesQuerySchema,
  submitResponseSchema,
  updateServiceRecoveryCaseSchema,
} from './validators';

export async function createCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { campaign: await service.createCampaign(req.user, createCampaignSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function openCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaign: await service.openCampaign(req.user, req.params.campaignId) });
  } catch (err) {
    next(err);
  }
}

export async function closeCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaign: await service.closeCampaign(req.user, req.params.campaignId) });
  } catch (err) {
    next(err);
  }
}

export async function cancelCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaign: await service.cancelCampaign(req.user, req.params.campaignId, cancelCampaignSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function markAnalysisReady(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaign: await service.markAnalysisReady(req.user, req.params.campaignId) });
  } catch (err) {
    next(err);
  }
}

export async function archiveCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaign: await service.archiveCampaign(req.user, req.params.campaignId) });
  } catch (err) {
    next(err);
  }
}

export async function listCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaigns: await service.listCampaigns(req.user, listCampaignsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}

export async function listOpenCampaignsForMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaigns: await service.listOpenCampaignsForMe(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { campaign: await service.getCampaign(req.user, req.params.campaignId) });
  } catch (err) {
    next(err);
  }
}

export async function submitResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { response: await service.submitResponse(req.user, req.params.campaignId, submitResponseSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function listResponses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { responses: await service.listResponses(req.user, req.params.campaignId) });
  } catch (err) {
    next(err);
  }
}

export async function revealIdentity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.revealIdentity(req.user, req.params.responseId));
  } catch (err) {
    next(err);
  }
}

export async function getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getAnalytics(req.user, req.params.campaignId));
  } catch (err) {
    next(err);
  }
}

export async function createServiceRecoveryCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { case: await service.createServiceRecoveryCase(req.user, createServiceRecoveryCaseSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function listServiceRecoveryCases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { cases: await service.listServiceRecoveryCases(req.user, listCasesQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}

export async function getServiceRecoveryCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { case: await service.getServiceRecoveryCase(req.user, req.params.caseId) });
  } catch (err) {
    next(err);
  }
}

export async function updateServiceRecoveryCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { case: await service.updateServiceRecoveryCase(req.user, req.params.caseId, updateServiceRecoveryCaseSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
