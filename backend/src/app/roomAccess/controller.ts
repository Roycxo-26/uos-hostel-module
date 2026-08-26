import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  addNoticeAttemptSchema,
  approveEntrySchema,
  cancelEntrySchema,
  createEvidenceReferenceSchema,
  disposeCustodySchema,
  issueKeySchema,
  recordCustodySchema,
  recordEntrySchema,
  recordExitSchema,
  releaseCustodySchema,
  reportKeyLostSchema,
  requestEntrySchema,
  transferCustodyToSecuritySchema,
  updateLegalHoldSchema,
} from './validators';

// --- Room entries ---
export async function requestEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { entry: await service.requestEntry(req.user, requestEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { entries: await service.listEntries({ roomId, status }) });
  } catch (err) {
    next(err);
  }
}
export async function getEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.getEntry(req.params.entryId) });
  } catch (err) {
    next(err);
  }
}
export async function approveEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.approveEntry(req.user, req.params.entryId, approveEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function markNotified(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.markNotified(req.user, req.params.entryId) });
  } catch (err) {
    next(err);
  }
}
export async function recordEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.recordEntry(req.user, req.params.entryId, recordEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function recordExit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.recordExit(req.user, req.params.entryId, recordExitSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function cancelEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.cancelEntry(req.user, req.params.entryId, cancelEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Master key ---
export async function issueKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { key: await service.issueKey(req.user, issueKeySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function returnKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { key: await service.returnKey(req.user, req.params.keyLogId) });
  } catch (err) {
    next(err);
  }
}
export async function reportKeyLost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { key: await service.reportKeyLost(req.user, req.params.keyLogId, reportKeyLostSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listKeyLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const keyIdentifier = typeof req.query.keyIdentifier === 'string' ? req.query.keyIdentifier : undefined;
    success(res, { keys: await service.listKeyLogs({ status, keyIdentifier }) });
  } catch (err) {
    next(err);
  }
}
export async function auditKeyFrequency(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sinceDays = typeof req.query.sinceDays === 'string' ? Number(req.query.sinceDays) : undefined;
    success(res, await service.auditKeyFrequency(req.params.keyIdentifier, sinceDays));
  } catch (err) {
    next(err);
  }
}

// --- Property custody ---
export async function recordCustody(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { custody: await service.recordCustody(req.user, recordCustodySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listCustody(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    success(res, { custody: await service.listCustody({ status, studentId }) });
  } catch (err) {
    next(err);
  }
}
export async function addNoticeAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { custody: await service.addNoticeAttempt(req.user, req.params.custodyId, addNoticeAttemptSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function releaseCustody(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { custody: await service.releaseCustody(req.user, req.params.custodyId, releaseCustodySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function transferCustodyToSecurity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { custody: await service.transferCustodyToSecurity(req.user, req.params.custodyId, transferCustodyToSecuritySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function disposeCustody(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { custody: await service.disposeCustody(req.user, req.params.custodyId, disposeCustodySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Security evidence references ---
export async function createEvidenceReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { reference: await service.createEvidenceReference(req.user, createEvidenceReferenceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listEvidenceReferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const linkedEntityType = typeof req.query.linkedEntityType === 'string' ? req.query.linkedEntityType : undefined;
    const linkedEntityId = typeof req.query.linkedEntityId === 'string' ? req.query.linkedEntityId : undefined;
    success(res, { references: await service.listEvidenceReferences({ linkedEntityType, linkedEntityId }) });
  } catch (err) {
    next(err);
  }
}
export async function updateLegalHold(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { reference: await service.updateLegalHold(req.user, req.params.referenceId, updateLegalHoldSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
