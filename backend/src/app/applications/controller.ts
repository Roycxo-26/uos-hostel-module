import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelApplicationSchema,
  decideApplicationSchema,
  listApplicationsQuerySchema,
  reopenApplicationSchema,
  resubmitApplicationSchema,
  submitApplicationSchema,
  withdrawApplicationSchema,
} from './validators';

export async function submitApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = submitApplicationSchema.parse(req.body);
    created(res, { application: await service.submitApplication(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listApplicationsQuerySchema.parse(req.query);
    success(res, { applications: await service.listApplications(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { application: await service.getApplication(req.user, req.params.applicationId) });
  } catch (err) {
    next(err);
  }
}

export async function decideApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decideApplicationSchema.parse(req.body);
    success(res, { application: await service.decideApplication(req.user, req.params.applicationId, input) });
  } catch (err) {
    next(err);
  }
}

export async function resubmitApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = resubmitApplicationSchema.parse(req.body);
    success(res, { application: await service.resubmitApplication(req.user, req.params.applicationId, input) });
  } catch (err) {
    next(err);
  }
}

export async function withdrawApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = withdrawApplicationSchema.parse(req.body);
    success(res, { application: await service.withdrawApplication(req.user, req.params.applicationId, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelApplicationSchema.parse(req.body);
    success(res, { application: await service.cancelApplication(req.user, req.params.applicationId, input) });
  } catch (err) {
    next(err);
  }
}

export async function reopenApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reopenApplicationSchema.parse(req.body);
    success(res, { application: await service.reopenApplication(req.user, req.params.applicationId, input) });
  } catch (err) {
    next(err);
  }
}
