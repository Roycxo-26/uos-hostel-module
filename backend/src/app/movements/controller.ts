import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  addGuardianSchema,
  cancelMovementSchema,
  decideExtensionSchema,
  decideMovementSchema,
  listMovementsQuerySchema,
  recordCallConfirmationSchema,
  requestExtensionSchema,
  requestMovementSchema,
  verifyOtpSchema,
} from './validators';

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

export async function listGateQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { movements: await service.listGateQueue(req.user) });
  } catch (err) {
    next(err);
  }
}

// --- Guardians ---------------------------------------------------------

export async function addGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = addGuardianSchema.parse(req.body);
    created(res, { guardian: await service.addGuardian(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listMyGuardians(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { guardians: await service.listMyGuardians(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function verifyGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { guardian: await service.verifyGuardian(req.user, req.params.guardianId) });
  } catch (err) {
    next(err);
  }
}

export async function getGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { guardian: await service.getGuardian(req.user, req.params.guardianId) });
  } catch (err) {
    next(err);
  }
}

// --- Guardian confirmation ------------------------------------------------

export async function verifyGuardianOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = verifyOtpSchema.parse(req.body);
    success(res, { confirmation: await service.verifyGuardianOtp(req.user, req.params.movementId, input) });
  } catch (err) {
    next(err);
  }
}

export async function resendGuardianOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { confirmation: await service.resendGuardianOtp(req.user, req.params.movementId) });
  } catch (err) {
    next(err);
  }
}

export async function recordGuardianCallConfirmation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = recordCallConfirmationSchema.parse(req.body);
    created(res, { confirmation: await service.recordGuardianCallConfirmation(req.user, req.params.movementId, input) });
  } catch (err) {
    next(err);
  }
}

// --- Extensions -------------------------------------------------------

export async function requestExtension(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = requestExtensionSchema.parse(req.body);
    created(res, { extension: await service.requestExtension(req.user, req.params.movementId, input) });
  } catch (err) {
    next(err);
  }
}

export async function decideExtension(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decideExtensionSchema.parse(req.body);
    success(res, { extension: await service.decideExtension(req.user, req.params.extensionId, input) });
  } catch (err) {
    next(err);
  }
}
