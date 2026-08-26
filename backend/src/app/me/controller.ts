import { Request, Response, NextFunction } from 'express';
import { success } from '../../utils/response';
import * as service from './service';

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getMe(req.user));
  } catch (err) {
    next(err);
  }
}
