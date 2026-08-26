import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  approveCheckoutSchema,
  cancelCheckoutSchema,
  disputeDamageSchema,
  inspectCheckoutSchema,
  listCheckoutsQuerySchema,
  recordClearanceSchema,
  requestCheckoutSchema,
} from './validators';

export async function requestCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = requestCheckoutSchema.parse(req.body);
    created(res, { checkout: await service.requestCheckout(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listCheckouts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listCheckoutsQuerySchema.parse(req.query);
    success(res, { checkouts: await service.listCheckouts(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { checkout: await service.getCheckout(req.user, req.params.checkoutId) });
  } catch (err) {
    next(err);
  }
}

export async function inspectCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = inspectCheckoutSchema.parse(req.body);
    success(res, { checkout: await service.inspectCheckout(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}

export async function disputeDamage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = disputeDamageSchema.parse(req.body);
    success(res, { checkout: await service.disputeDamage(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}

export async function recordClearance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = recordClearanceSchema.parse(req.body);
    success(res, { checkout: await service.recordClearance(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}

export async function approveCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = approveCheckoutSchema.parse(req.body);
    success(res, { checkout: await service.approveCheckout(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelCheckoutSchema.parse(req.body);
    success(res, { checkout: await service.cancelCheckout(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}
