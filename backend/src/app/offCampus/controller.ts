import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelPlacementSchema,
  confirmExitSchema,
  confirmOccupancySchema,
  createProviderSchema,
  decidePlacementSchema,
  decideProviderComplianceSchema,
  linkIssueHandoffSchema,
  listPlacementsQuerySchema,
  listProvidersQuerySchema,
  requestExitSchema,
  requestPlacementSchema,
} from './validators';

export async function createProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { provider: await service.createProvider(req.user, createProviderSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listProviders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { providers: await service.listProviders(listProvidersQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { provider: await service.getProvider(req.params.providerId) });
  } catch (err) {
    next(err);
  }
}
export async function decideProviderCompliance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { provider: await service.decideProviderCompliance(req.user, req.params.providerId, decideProviderComplianceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function requestPlacement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { placement: await service.requestPlacement(req.user, requestPlacementSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listPlacements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placements: await service.listPlacements(req.user, listPlacementsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getPlacement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.getPlacement(req.user, req.params.placementId) });
  } catch (err) {
    next(err);
  }
}
export async function decidePlacement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.decidePlacement(req.user, req.params.placementId, decidePlacementSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function confirmOccupancy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.confirmOccupancy(req.user, req.params.placementId, confirmOccupancySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function requestExit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.requestExit(req.user, req.params.placementId, requestExitSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function confirmExit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.confirmExit(req.user, req.params.placementId, confirmExitSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function cancelPlacement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.cancelPlacement(req.user, req.params.placementId, cancelPlacementSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function linkIssueHandoff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { placement: await service.linkIssueHandoff(req.user, req.params.placementId, linkIssueHandoffSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
