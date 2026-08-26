import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelDrillSchema,
  completeDrillSchema,
  markDrillEntrySchema,
  planDrillSchema,
  triggerEmergencySchema,
  updateSafetyStatusSchema,
} from './validators';

export async function updateSafetyStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateSafetyStatusSchema.parse(req.body);
    success(res, { hostel: await service.updateSafetyStatus(req.user, req.params.hostelId, input) });
  } catch (err) {
    next(err);
  }
}

export async function planDrill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = planDrillSchema.parse(req.body);
    created(res, { drill: await service.planDrill(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function triggerEmergencyMuster(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = triggerEmergencySchema.parse(req.body);
    created(res, { drill: await service.triggerEmergencyMuster(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listDrills(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const hostelId = typeof req.query.hostelId === 'string' ? req.query.hostelId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { drills: await service.listDrills({ hostelId, status }) });
  } catch (err) {
    next(err);
  }
}

export async function getDrill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { drill: await service.getDrill(req.params.drillId) });
  } catch (err) {
    next(err);
  }
}

export async function validateCoverage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { drill: await service.validateCoverage(req.user, req.params.drillId) });
  } catch (err) {
    next(err);
  }
}

export async function startDrill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { drill: await service.startDrill(req.user, req.params.drillId) });
  } catch (err) {
    next(err);
  }
}

export async function markDrillEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = markDrillEntrySchema.parse(req.body);
    success(res, { entry: await service.markDrillEntry(req.user, req.params.drillId, input) });
  } catch (err) {
    next(err);
  }
}

export async function completeDrill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = completeDrillSchema.parse(req.body);
    success(res, { drill: await service.completeDrill(req.user, req.params.drillId, input) });
  } catch (err) {
    next(err);
  }
}

export async function cancelDrill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelDrillSchema.parse(req.body);
    success(res, { drill: await service.cancelDrill(req.user, req.params.drillId, input) });
  } catch (err) {
    next(err);
  }
}
