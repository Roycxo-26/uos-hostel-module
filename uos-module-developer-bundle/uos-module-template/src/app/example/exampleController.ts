import { Request, Response, NextFunction } from 'express';
import { getTrx } from '@uos/auth';
import { success, created } from '../../utils/response';
import { NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import {
  createExampleSchema,
  updateExampleSchema,
  idParamSchema,
} from './exampleValidators';
import * as service from './exampleService';

export async function getItems(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // getTrx() returns the RLS-scoped transaction set by scopedRequest middleware.
    // All queries inside this transaction run as app_user with org+campus context set.
    const trx = getTrx()!;
    const items = await service.findAll(trx);
    success(res, { items });
  } catch (err) {
    next(err);
  }
}

export async function getItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const trx = getTrx()!;
    const item = await service.findById(trx, id);
    if (!item) throw new NotFoundError('item');
    success(res, { item });
  } catch (err) {
    next(err);
  }
}

export async function createItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = createExampleSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.message);

    const trx = getTrx()!;
    const item = await service.create(
      trx,
      body.data,
      req.user.org_id,
      req.user.campus_id
    );
    created(res, { item });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = updateExampleSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.message);

    const trx = getTrx()!;
    const item = await service.update(trx, id, body.data);
    if (!item) throw new NotFoundError('item');
    success(res, { item });
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const trx = getTrx()!;
    const existing = await service.findById(trx, id);
    if (!existing) throw new NotFoundError('item');
    await service.remove(trx, id);
    success(res, { message: 'Deleted successfully' });
  } catch (err) {
    next(err);
  }
}
