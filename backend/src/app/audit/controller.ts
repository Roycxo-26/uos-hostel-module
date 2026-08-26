import { Request, Response, NextFunction } from 'express';
import { success } from '../../utils/response';
import * as service from './service';

export async function listAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    success(res, { entries: await service.listAuditLog(req.user, { entityType, action, limit }) });
  } catch (err) {
    next(err);
  }
}
