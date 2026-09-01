import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  appealCaseSchema,
  decideCaseSchema,
  grantCaseAccessSchema,
  imposeEmergencyRestrictionSchema,
  investigateCaseSchema,
  issueNoticeSchema,
  listCasesQuerySchema,
  reopenCaseSchema,
  reportCaseSchema,
  resolveCaseSchema,
  reviewEmergencyRestrictionSchema,
  revokeCaseAccessSchema,
  triageCaseSchema,
  updateMissingResidentChecklistSchema,
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

// --- D17.09 items 96/99 — case-specific access grants ---------------------

export async function grantCaseAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = grantCaseAccessSchema.parse(req.body);
    created(res, { grant: await service.grantCaseAccess(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function revokeCaseAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = revokeCaseAccessSchema.parse(req.body);
    success(res, { grant: await service.revokeCaseAccess(req.user, req.params.grantId, input) });
  } catch (err) {
    next(err);
  }
}

// --- D17.09 item 98 — missing-resident checklist ---------------------------

export async function updateMissingResidentChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateMissingResidentChecklistSchema.parse(req.body);
    success(res, { case: await service.updateMissingResidentChecklist(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

// --- D17.09 item 99 — emergency privilege restriction ----------------------

export async function imposeEmergencyRestriction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = imposeEmergencyRestrictionSchema.parse(req.body);
    success(res, { case: await service.imposeEmergencyRestriction(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}

export async function reviewEmergencyRestriction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reviewEmergencyRestrictionSchema.parse(req.body);
    success(res, { case: await service.reviewEmergencyRestriction(req.user, req.params.caseId, input) });
  } catch (err) {
    next(err);
  }
}
