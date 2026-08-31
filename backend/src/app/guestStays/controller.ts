import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { cancelGuestStaySchema, checkInGuestStaySchema, checkOutGuestStaySchema, createGuestStaySchema } from './validators';

export async function createGuestStay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createGuestStaySchema.parse(req.body);
    created(res, { guestStay: await service.createGuestStay(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listGuestStays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const bedId = typeof req.query.bedId === 'string' ? req.query.bedId : undefined;
    success(res, { guestStays: await service.listGuestStays({ status, bedId }) });
  } catch (err) {
    next(err);
  }
}

export async function getGuestStay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { guestStay: await service.getGuestStay(req.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function checkInGuestStay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = checkInGuestStaySchema.parse(req.body);
    success(res, { guestStay: await service.checkInGuestStay(req.user, req.params.id, input) });
  } catch (err) {
    next(err);
  }
}

export async function checkOutGuestStay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = checkOutGuestStaySchema.parse(req.body);
    success(res, { guestStay: await service.checkOutGuestStay(req.user, req.params.id, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelGuestStay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelGuestStaySchema.parse(req.body);
    success(res, { guestStay: await service.cancelGuestStay(req.user, req.params.id, input) });
  } catch (err) {
    next(err);
  }
}
