import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.20 (TODO.md Batch 18). One permission
// ('room_access:manage') gates all four sub-areas — entries, keys,
// custody, evidence references — same single-permission-per-module shape
// Batches 16/17 already used, since this BRD has no scoped role split for
// any of them either.
export function roomAccessRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('room_access:manage');

  // Specific paths before :entryId/:keyLogId/:custodyId param routes.
  r.get('/keys/audit/:keyIdentifier', canManage, controller.auditKeyFrequency);

  r.post('/entries', canManage, controller.requestEntry);
  r.get('/entries', canManage, controller.listEntries);
  r.get('/entries/:entryId', canManage, controller.getEntry);
  r.post('/entries/:entryId/approve', canManage, controller.approveEntry);
  r.post('/entries/:entryId/notify', canManage, controller.markNotified);
  r.post('/entries/:entryId/enter', canManage, controller.recordEntry);
  r.post('/entries/:entryId/exit', canManage, controller.recordExit);
  r.post('/entries/:entryId/cancel', canManage, controller.cancelEntry);

  r.post('/keys', canManage, controller.issueKey);
  r.get('/keys', canManage, controller.listKeyLogs);
  r.post('/keys/:keyLogId/return', canManage, controller.returnKey);
  r.post('/keys/:keyLogId/lost', canManage, controller.reportKeyLost);

  r.post('/custody', canManage, controller.recordCustody);
  r.get('/custody', canManage, controller.listCustody);
  r.post('/custody/:custodyId/notice', canManage, controller.addNoticeAttempt);
  r.post('/custody/:custodyId/release', canManage, controller.releaseCustody);
  r.post('/custody/:custodyId/transfer-to-security', canManage, controller.transferCustodyToSecurity);
  r.post('/custody/:custodyId/dispose', canManage, controller.disposeCustody);

  r.post('/evidence-references', canManage, controller.createEvidenceReference);
  r.get('/evidence-references', canManage, controller.listEvidenceReferences);
  r.patch('/evidence-references/:referenceId/legal-hold', canManage, controller.updateLegalHold);

  return r;
}
