import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { createCheckInSchema } from './validators';

export async function createCheckIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createCheckInSchema.parse(req.body);
    created(res, { checkin: await service.createCheckIn(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function getCheckInByAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { checkin: await service.getCheckInByAllocation(req.params.allocationId) ?? null });
  } catch (err) {
    next(err);
  }
}
