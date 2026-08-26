import { Request, Response, NextFunction } from 'express';
import { success } from '../../utils/response';
import * as service from './service';

export async function listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    success(res, { notifications: await service.listNotifications(req.user, { unreadOnly }) });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { count: await service.getUnreadCount(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { notification: await service.markRead(req.user, req.params.notificationId) });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.markAllRead(req.user);
    success(res, { ok: true });
  } catch (err) {
    next(err);
  }
}
