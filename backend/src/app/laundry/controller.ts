import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  acknowledgeReturnSchema,
  cancelOrderSchema,
  linkComplaintSchema,
  listOrdersQuerySchema,
  markUnclaimedSchema,
  recordPickupSchema,
  recordReturnSchema,
  reopenOrderSchema,
  reportExceptionSchema,
  requestOrderSchema,
  resolveExceptionSchema,
} from './validators';

export async function requestOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { order: await service.requestOrder(req.user, requestOrderSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { orders: await service.listOrders(req.user, listOrdersQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.getOrder(req.user, req.params.orderId) });
  } catch (err) {
    next(err);
  }
}
export async function acceptOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.acceptOrder(req.user, req.params.orderId) });
  } catch (err) {
    next(err);
  }
}
export async function recordPickup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.recordPickup(req.user, req.params.orderId, recordPickupSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function startProcessing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.startProcessing(req.user, req.params.orderId) });
  } catch (err) {
    next(err);
  }
}
export async function markReadyForReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.markReadyForReturn(req.user, req.params.orderId) });
  } catch (err) {
    next(err);
  }
}
export async function recordReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.recordReturn(req.user, req.params.orderId, recordReturnSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function acknowledgeReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.acknowledgeReturn(req.user, req.params.orderId, acknowledgeReturnSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function closeOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.closeOrder(req.user, req.params.orderId) });
  } catch (err) {
    next(err);
  }
}
export async function disputeCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.disputeCount(req.user, req.params.orderId, reportExceptionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function reportLostItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.reportLostItem(req.user, req.params.orderId, reportExceptionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function reportDamagedItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.reportDamagedItem(req.user, req.params.orderId, reportExceptionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function resolveException(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.resolveException(req.user, req.params.orderId, resolveExceptionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function markUnclaimed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.markUnclaimed(req.user, req.params.orderId, markUnclaimedSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.cancelOrder(req.user, req.params.orderId, cancelOrderSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function reopenOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.reopenOrder(req.user, req.params.orderId, reopenOrderSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function linkComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { order: await service.linkComplaint(req.user, req.params.orderId, linkComplaintSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
