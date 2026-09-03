import { Request, Response, NextFunction } from 'express';
import { success } from '../../utils/response';
import * as service from './service';

export function getConnectionStatus(req: Request, res: Response): void {
  success(res, service.getConnectionStatus());
}

export async function listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    success(res, { events: await service.listEvents(req.user, { eventType, studentId }) });
  } catch (err) {
    next(err);
  }
}
