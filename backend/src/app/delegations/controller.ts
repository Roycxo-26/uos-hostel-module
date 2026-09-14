import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import { createDelegationSchema, listDelegationsQuerySchema, listStaffCandidatesQuerySchema, revokeDelegationSchema } from './validators';

export async function createDelegation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createDelegationSchema.parse(req.body);
    created(res, { delegation: await service.createDelegation(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listDelegations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = listDelegationsQuerySchema.parse(req.query);
    success(res, { delegations: await service.listDelegations(filters) });
  } catch (err) {
    next(err);
  }
}

export async function listStaffCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { campusId } = listStaffCandidatesQuerySchema.parse(req.query);
    success(res, { candidates: await service.listStaffCandidates(campusId) });
  } catch (err) {
    next(err);
  }
}

export async function revokeDelegation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = revokeDelegationSchema.parse(req.body);
    success(res, { delegation: await service.revokeDelegation(req.user, req.params.delegationId, input) });
  } catch (err) {
    next(err);
  }
}
