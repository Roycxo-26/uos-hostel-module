import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { cancelTransferSchema, decideTransferSchema, executeTransferSchema, requestTransferSchema } from './validators';

export async function requestTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = requestTransferSchema.parse(req.body);
    created(res, { transfer: await service.requestTransfer(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listTransfers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { transfers: await service.listTransfers(req.user, { status }) });
  } catch (err) {
    next(err);
  }
}

export async function getTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { transfer: await service.getTransfer(req.user, req.params.transferId) });
  } catch (err) {
    next(err);
  }
}

export async function decideTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decideTransferSchema.parse(req.body);
    success(res, { transfer: await service.decideTransfer(req.user, req.params.transferId, input) });
  } catch (err) {
    next(err);
  }
}

export async function executeTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = executeTransferSchema.parse(req.body);
    success(res, { transfer: await service.executeTransfer(req.user, req.params.transferId, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelTransferSchema.parse(req.body);
    success(res, { transfer: await service.cancelTransfer(req.user, req.params.transferId, input) });
  } catch (err) {
    next(err);
  }
}
