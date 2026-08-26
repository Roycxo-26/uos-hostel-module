import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  appealCaseSchema,
  decideCaseSchema,
  investigateCaseSchema,
  issueNoticeSchema,
  listCasesQuerySchema,
  reopenCaseSchema,
  reportCaseSchema,
  resolveCaseSchema,
  triageCaseSchema,
} from './validators';

export async function reportCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reportCaseSchema.parse(req.body);
    created(res, { case: await service.reportCase(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listResidentDirectory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { residents: await service.listResidentDirectory(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function listCaseStaffDirectory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { staff: await service.listCaseStaffDirectory(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function listCases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listCasesQuerySchema.parse(req.query);
    success(res, { cases: await service.listCases(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { case: await service.getCase(req.user, req.params.caseId) });
  } catch (err) {
    next(err);
  }
}

export async function triageCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = triageCaseSchema.parse(req.body);
    success(res, { case: await service.triageCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function investigateCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = investigateCaseSchema.parse(req.body);
    success(res, { case: await service.investigateCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function resolveCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = resolveCaseSchema.parse(req.body);
    success(res, { case: await service.resolveCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function issueNotice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = issueNoticeSchema.parse(req.body);
    success(res, { case: await service.issueNotice(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function decideCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = decideCaseSchema.parse(req.body);
    success(res, { case: await service.decideCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function appealCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = appealCaseSchema.parse(req.body);
    success(res, { case: await service.appealCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function closeCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { case: await service.closeCase(req.user, req.params.caseId) });
  } catch (err) {
    next(err);
  }
}

export async function reopenCase(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reopenCaseSchema.parse(req.body);
    success(res, { case: await service.reopenCase(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}
