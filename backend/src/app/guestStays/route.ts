import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.25 item 89 (TODO.md Batch 22). Staff-only
// throughout — a guest/parent short-stay has no resident/system-user
// counterpart to act on their own behalf.
export function guestStaysRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('guest_stay:manage');

  r.post('/', canManage, controller.createGuestStay);
  r.get('/', canManage, controller.listGuestStays);
  r.get('/:id', canManage, controller.getGuestStay);
  r.post('/:id/check-in', canManage, controller.checkInGuestStay);
  r.post('/:id/check-out', canManage, controller.checkOutGuestStay);
  r.post('/:id/cancel', canManage, controller.cancelGuestStay);

  return r;
}
