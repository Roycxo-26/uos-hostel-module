import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  acknowledgePolicySchema,
  assignIndependentReviewerSchema,
  assignReviewerSchema,
  closeGrievanceSchema,
  declinePolicySchema,
  issueDecisionSchema,
  issueFinalDecisionSchema,
  publishPolicyVersionSchema,
  raiseGrievanceSchema,
  reopenGrievanceSchema,
  resolveGrievanceSchema,
  respondToInformationRequestSchema,
  returnForInformationSchema,
  setInterimActionSchema,
  setReferralSchema,
  submitAppealSchema,
  withdrawGrievanceSchema,
} from './validators';

export async function raiseGrievance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { grievance: await service.raiseGrievance(req.user, raiseGrievanceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listGrievances(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { grievances: await service.listGrievances(req.user, { status }) });
  } catch (err) {
    next(err);
  }
}
export async function getGrievance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.getGrievance(req.user, req.params.grievanceId) });
  } catch (err) {
    next(err);
  }
}
export async function assignReviewer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.assignReviewer(req.user, req.params.grievanceId, assignReviewerSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function returnForInformation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.returnForInformation(req.user, req.params.grievanceId, returnForInformationSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function respondToInformationRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, {
      grievance: await service.respondToInformationRequest(req.user, req.params.grievanceId, respondToInformationRequestSchema.parse(req.body)),
    });
  } catch (err) {
    next(err);
  }
}
export async function setInterimAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.setInterimAction(req.user, req.params.grievanceId, setInterimActionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function setReferral(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.setReferral(req.user, req.params.grievanceId, setReferralSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function issueDecision(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.issueDecision(req.user, req.params.grievanceId, issueDecisionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function submitAppeal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.submitAppeal(req.user, req.params.grievanceId, submitAppealSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function assignIndependentReviewer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, {
      grievance: await service.assignIndependentReviewer(req.user, req.params.grievanceId, assignIndependentReviewerSchema.parse(req.body)),
    });
  } catch (err) {
    next(err);
  }
}
export async function issueFinalDecision(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.issueFinalDecision(req.user, req.params.grievanceId, issueFinalDecisionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function resolveGrievance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.resolveGrievance(req.user, req.params.grievanceId, resolveGrievanceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function closeGrievance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.closeGrievance(req.user, req.params.grievanceId, closeGrievanceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function reopenGrievance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.reopenGrievance(req.user, req.params.grievanceId, reopenGrievanceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function withdrawGrievance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { grievance: await service.withdrawGrievance(req.user, req.params.grievanceId, withdrawGrievanceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Policy versions / acknowledgement / rights view ---
export async function publishPolicyVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { version: await service.publishPolicyVersion(req.user, publishPolicyVersionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listPolicyVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const documentKey = typeof req.query.documentKey === 'string' ? req.query.documentKey : undefined;
    success(res, { versions: await service.listPolicyVersions(documentKey) });
  } catch (err) {
    next(err);
  }
}
export async function acknowledgePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { acknowledgement: await service.acknowledgePolicy(req.user, req.params.versionId, acknowledgePolicySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function declinePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { acknowledgement: await service.declinePolicy(req.user, req.params.versionId, declinePolicySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listAcknowledgementsForVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { acknowledgements: await service.listAcknowledgementsForVersion(req.user, req.params.versionId) });
  } catch (err) {
    next(err);
  }
}
export async function getMyRights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getMyRights(req.user));
  } catch (err) {
    next(err);
  }
}
