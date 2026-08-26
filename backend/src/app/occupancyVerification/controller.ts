import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { closeSessionSchema, markEntrySchema, openSessionSchema } from './validators';

export async function openSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = openSessionSchema.parse(req.body);
    created(res, { session: await service.openSession(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const scopeType = typeof req.query.scopeType === 'string' ? req.query.scopeType : undefined;
    const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : undefined;
    success(res, { sessions: await service.listSessions({ status, scopeType, scopeId }) });
  } catch (err) {
    next(err);
  }
}

export async function listUnresolvedMismatches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entries: await service.listUnresolvedMismatches() });
  } catch (err) {
    next(err);
  }
}

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { session: await service.getSession(req.params.sessionId) });
  } catch (err) {
    next(err);
  }
}

export async function markEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = markEntrySchema.parse(req.body);
    success(res, { entry: await service.markEntry(req.user, req.params.sessionId, input) });
  } catch (err) {
    next(err);
  }
}

export async function closeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = closeSessionSchema.parse(req.body);
    success(res, { session: await service.closeSession(req.user, req.params.sessionId, input) });
  } catch (err) {
    next(err);
  }
}

export async function markReferredToTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.markReferredToTransfer(req.user, req.params.entryId) });
  } catch (err) {
    next(err);
  }
}
