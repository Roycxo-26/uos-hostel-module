import { Request, Response, NextFunction } from 'express';
import { success } from '../../utils/response';
import * as service from './service';
import { listSessionsQuerySchema, markEntrySchema, openSessionSchema } from './validators';

export async function openSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = openSessionSchema.parse(req.body);
    success(res, { session: await service.openSession(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listSessionsQuerySchema.parse(req.query);
    success(res, { sessions: await service.listSessions(query) });
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
    success(res, { session: await service.closeSession(req.user, req.params.sessionId) });
  } catch (err) {
    next(err);
  }
}

export async function listOpenIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { issues: await service.listOpenIssues() });
  } catch (err) {
    next(err);
  }
}
