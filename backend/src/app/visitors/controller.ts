import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelVisitorRequestSchema,
  decideVisitorRequestSchema,
  hotlistCredentialSchema,
  listVisitorRequestsQuerySchema,
  recordVisitorEntrySchema,
  recordVisitorExitSchema,
  reopenVisitorRequestSchema,
  requestVisitorSchema,
  resubmitVisitorRequestSchema,
} from './validators';

export async function requestVisitor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { visitor: await service.requestVisitor(req.user, requestVisitorSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function listVisitorRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listVisitorRequestsQuerySchema.parse(req.query);
    success(res, { visitors: await service.listVisitorRequests(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getShiftHandover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getShiftHandover(req.user));
  } catch (err) {
    next(err);
  }
}

export async function getVisitorRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.getVisitorRequest(req.user, req.params.visitorId) });
  } catch (err) {
    next(err);
  }
}

export async function decideVisitorRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.decideVisitorRequest(req.user, req.params.visitorId, decideVisitorRequestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function resubmitVisitorRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.resubmitVisitorRequest(req.user, req.params.visitorId, resubmitVisitorRequestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function cancelVisitorRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.cancelVisitorRequest(req.user, req.params.visitorId, cancelVisitorRequestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function recordVisitorEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.recordVisitorEntry(req.user, req.params.visitorId, recordVisitorEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function recordVisitorExit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.recordVisitorExit(req.user, req.params.visitorId, recordVisitorExitSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function closeVisitorRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.closeVisitorRequest(req.user, req.params.visitorId) });
  } catch (err) {
    next(err);
  }
}

export async function reopenVisitorRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.reopenVisitorRequest(req.user, req.params.visitorId, reopenVisitorRequestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function hotlistCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { visitor: await service.hotlistCredential(req.user, req.params.visitorId, hotlistCredentialSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
