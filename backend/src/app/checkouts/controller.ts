import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  addCheckoutInventoryItemSchema,
  approveCheckoutSchema,
  cancelCheckoutSchema,
  disputeDamageSchema,
  inspectCheckoutSchema,
  listCheckoutsQuerySchema,
  recordClearanceSchema,
  recordContactAttemptSchema,
  reopenCheckoutSchema,
  requestCheckoutSchema,
  updatePrerequisiteChecklistSchema,
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

export async function updatePrerequisiteChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updatePrerequisiteChecklistSchema.parse(req.body);
    success(res, { checkout: await service.updatePrerequisiteChecklist(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}

export async function recordItemReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { checkout: await service.recordItemReturn(req.user, req.params.checkoutId) });
  } catch (err) {
    next(err);
  }
}

export async function finalizeDamageAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { checkout: await service.finalizeDamageAssessment(req.user, req.params.checkoutId) });
  } catch (err) {
    next(err);
  }
}

export async function markRoomReadyForReuse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { checkout: await service.markRoomReadyForReuse(req.user, req.params.checkoutId) });
  } catch (err) {
    next(err);
  }
}

export async function recordContactAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = recordContactAttemptSchema.parse(req.body);
    created(res, { attempt: await service.recordContactAttempt(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}

export async function addCheckoutInventoryItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = addCheckoutInventoryItemSchema.parse(req.body);
    created(res, { item: await service.addCheckoutInventoryItem(req.user, req.params.checkoutId, input) });
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

export async function reopenCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reopenCheckoutSchema.parse(req.body);
    success(res, { checkout: await service.reopenCheckout(req.user, req.params.checkoutId, input) });
  } catch (err) {
    next(err);
  }
}
