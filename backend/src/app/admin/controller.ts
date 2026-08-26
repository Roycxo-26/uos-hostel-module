import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { success } from '../../utils/response';
import * as service from './service';
import { grantRoleSchema } from './validators';

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.listUsers());
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getUser(req.params.userId));
  } catch (err) {
    next(err);
  }
}

export async function grantRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = grantRoleSchema.parse(req.body);
    success(res, await service.grantRole(req.user, req.params.userId, input), 201);
  } catch (err) {
    next(err);
  }
}

const revokeQuerySchema = z.object({ campusId: z.string().uuid().optional() });

export async function revokeRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { campusId } = revokeQuerySchema.parse(req.query);
    success(res, await service.revokeRole(req.params.userId, req.params.role, campusId));
  } catch (err) {
    next(err);
  }
}
