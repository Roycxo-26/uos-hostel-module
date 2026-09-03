import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { listRequestsQuerySchema, requestRoommateSchema, respondToRequestSchema, revokeRequestSchema } from './validators';

export async function requestRoommate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { request: await service.requestRoommate(req.user, requestRoommateSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function listMyRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = listRequestsQuerySchema.parse(req.query);
    success(res, { requests: await service.listMyRequests(req.user, { status }) });
  } catch (err) {
    next(err);
  }
}

export async function listAllRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { requests: await service.listAllRequests(req.user, listRequestsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}

export async function getRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { request: await service.getRequest(req.user, req.params.requestId) });
  } catch (err) {
    next(err);
  }
}

export async function respondToRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { request: await service.respondToRequest(req.user, req.params.requestId, respondToRequestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function revokeRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { request: await service.revokeRequest(req.user, req.params.requestId, revokeRequestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function getCompatibilityRecommendation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const term = typeof req.query.term === 'string' ? req.query.term : '';
    success(res, await service.getCompatibilityRecommendation(req.user, req.params.studentId, term));
  } catch (err) {
    next(err);
  }
}
