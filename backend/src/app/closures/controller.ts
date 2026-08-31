import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelClosureCaseSchema,
  createClosureCaseSchema,
  decideClosureCaseSchema,
  resolveImpactSchema,
  updateReopeningChecklistSchema,
} from './validators';
import { z } from 'zod';

export async function createClosureCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createClosureCaseSchema.parse(req.body);
    created(res, { closureCase: await service.createClosureCase(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listClosureCases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const hostelId = typeof req.query.hostelId === 'string' ? req.query.hostelId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { closureCases: await service.listClosureCases({ hostelId, status }) });
  } catch (err) {
    next(err);
  }
}

export async function getClosureCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { closureCase: await service.getClosureCase(req.params.caseId) });
  } catch (err) {
    next(err);
  }
}

export async function decideClosureCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decideClosureCaseSchema.parse(req.body);
    success(res, { closureCase: await service.decideClosureCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function startClosureCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { closureCase: await service.startClosureCase(req.user, req.params.caseId) });
  } catch (err) {
    next(err);
  }
}

export async function addManualImpact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.body);
    created(res, { impact: await service.addManualImpact(req.user, req.params.caseId, studentId) });
  } catch (err) {
    next(err);
  }
}

export async function resolveImpact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = resolveImpactSchema.parse(req.body);
    success(res, { impact: await service.resolveImpact(req.user, req.params.impactId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateReopeningChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateReopeningChecklistSchema.parse(req.body);
    success(res, { closureCase: await service.updateReopeningChecklist(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function completeClosureCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { closureCase: await service.completeClosureCase(req.user, req.params.caseId) });
  } catch (err) {
    next(err);
  }
}

export async function cancelClosureCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = cancelClosureCaseSchema.parse(req.body);
    success(res, { closureCase: await service.cancelClosureCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}
