import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  acknowledgePrivilegeChangeSchema,
  cancelPrivilegeChangeSchema,
  decidePrivilegeChangeSchema,
  listPrivilegeChangesQuerySchema,
  requestPrivilegeChangeSchema,
  reversePrivilegeChangeSchema,
} from './validators';

export async function requestPrivilegeChange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = requestPrivilegeChangeSchema.parse(req.body);
    created(res, { privilegeChange: await service.requestPrivilegeChange(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listPrivilegeChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listPrivilegeChangesQuerySchema.parse(req.query);
    success(res, { privilegeChanges: await service.listPrivilegeChanges(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getPrivilegeChange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { privilegeChange: await service.getPrivilegeChange(req.user, req.params.privilegeChangeId) });
  } catch (err) {
    next(err);
  }
}

export async function decidePrivilegeChange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decidePrivilegeChangeSchema.parse(req.body);
    success(res, { privilegeChange: await service.decidePrivilegeChange(req.user, req.params.privilegeChangeId, input) });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgePrivilegeChange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = acknowledgePrivilegeChangeSchema.parse(req.body);
    success(res, { privilegeChange: await service.acknowledgePrivilegeChange(req.user, req.params.privilegeChangeId, input) });
  } catch (err) {
    next(err);
  }
}

export async function reversePrivilegeChange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reversePrivilegeChangeSchema.parse(req.body);
    created(res, { privilegeChange: await service.reversePrivilegeChange(req.user, req.params.privilegeChangeId, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelPrivilegeChange(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelPrivilegeChangeSchema.parse(req.body);
    success(res, { privilegeChange: await service.cancelPrivilegeChange(req.user, req.params.privilegeChangeId, input) });
  } catch (err) {
    next(err);
  }
}
