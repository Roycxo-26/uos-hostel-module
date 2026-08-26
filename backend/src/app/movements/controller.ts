import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { cancelMovementSchema, decideMovementSchema, listMovementsQuerySchema, requestMovementSchema } from './validators';

export async function requestMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = requestMovementSchema.parse(req.body);
    created(res, { movement: await service.requestMovement(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listMovementsQuerySchema.parse(req.query);
    success(res, { movements: await service.listMovements(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { movement: await service.getMovement(req.user, req.params.movementId) });
  } catch (err) {
    next(err);
  }
}

export async function decideMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decideMovementSchema.parse(req.body);
    success(res, { movement: await service.decideMovement(req.user, req.params.movementId, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelMovementSchema.parse(req.body);
    success(res, { movement: await service.cancelMovement(req.user, req.params.movementId, input) });
  } catch (err) {
    next(err);
  }
}

export async function recordExit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { movement: await service.recordExit(req.user, req.params.movementId) });
  } catch (err) {
    next(err);
  }
}

export async function recordReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { movement: await service.recordReturn(req.user, req.params.movementId) });
  } catch (err) {
    next(err);
  }
}
