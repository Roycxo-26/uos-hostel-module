import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.22 item 86 (TODO.md Batch 21). Publishing and
// the emergency card are staff-only; listing/acknowledging a notice is any
// authenticated resident acting on their own delivered rows (service.ts
// enforces "was this notice actually addressed to you").
export function operationalNoticesRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('operational_notice:manage');

  r.post('/', canManage, controller.publishNotice);
  r.get('/', canManage, controller.listNotices);
  r.get('/mine', controller.listMyNotices);
  r.get('/:noticeId', controller.getNotice);
  r.post('/:noticeId/acknowledge', controller.acknowledgeNotice);

  r.get('/emergency-card/:studentId', canManage, controller.getResidentEmergencyCard);

  return r;
}
