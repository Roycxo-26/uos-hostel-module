import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import type { PrivilegeType } from './types';
import { createAssignmentSchema, createDutyAssignmentSchema, listAssignmentsQuerySchema, revokeAssignmentSchema, setSubstituteSchema } from './validators';

export async function createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createAssignmentSchema.parse(req.body);
    created(res, { assignment: await service.createAssignment(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listAssignmentsQuerySchema.parse(req.query);
    success(res, { assignments: await service.listAssignments(query) });
  } catch (err) {
    next(err);
  }
}

export async function listResidentCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { candidates: await service.listResidentCandidates() });
  } catch (err) {
    next(err);
  }
}

export async function getAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { assignment: await service.getAssignment(req.params.assignmentId) });
  } catch (err) {
    next(err);
  }
}

export async function revokeAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = revokeAssignmentSchema.parse(req.body);
    success(res, { assignment: await service.revokeAssignment(req.user, req.params.assignmentId, input) });
  } catch (err) {
    next(err);
  }
}

export async function setSubstitute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = setSubstituteSchema.parse(req.body);
    success(res, { assignment: await service.setSubstitute(req.user, req.params.assignmentId, input) });
  } catch (err) {
    next(err);
  }
}

// D17.22 (TODO.md Batch 21).
export async function createDutyAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createDutyAssignmentSchema.parse(req.body);
    created(res, { assignment: await service.createDutyAssignment(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function getCoverageValidation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scopeType = req.query.scopeType as 'room' | 'floor' | 'hostel';
    const scopeId = String(req.query.scopeId ?? '');
    success(res, await service.getCoverageValidation(req.user, scopeType, scopeId));
  } catch (err) {
    next(err);
  }
}

export async function resolveDutyAuthority(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const privilegeType = req.params.privilegeType as PrivilegeType;
    const scopeType = req.query.scopeType as 'room' | 'floor' | 'hostel';
    const scopeId = String(req.query.scopeId ?? '');
    success(res, { resolution: await service.resolveDutyAuthority(req.user, privilegeType, scopeType, scopeId) });
  } catch (err) {
    next(err);
  }
}
