import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { publishNoticeSchema } from './validators';

export async function publishNotice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { notice: await service.publishNotice(req.user, publishNoticeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function listNotices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scopeType = typeof req.query.scopeType === 'string' ? req.query.scopeType : undefined;
    const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : undefined;
    success(res, { notices: await service.listNotices({ scopeType, scopeId }) });
  } catch (err) {
    next(err);
  }
}

export async function getNotice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { notice: await service.getNotice(req.user, req.params.noticeId) });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeNotice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { acknowledgement: await service.acknowledgeNotice(req.user, req.params.noticeId) });
  } catch (err) {
    next(err);
  }
}

export async function listMyNotices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { notices: await service.listMyNotices(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function getResidentEmergencyCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getResidentEmergencyCard(req.user, req.params.studentId));
  } catch (err) {
    next(err);
  }
}
