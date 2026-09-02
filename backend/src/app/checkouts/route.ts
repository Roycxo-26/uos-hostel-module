import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function checkoutsRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('checkout:manage');

  // ux-flow.md §3.3: "Initiate checkout" — self-service, same pattern as
  // transfers/movements/cases.
  r.post('/', controller.requestCheckout);
  r.get('/', controller.listCheckouts);
  r.get('/:checkoutId', controller.getCheckout);

  r.post('/:checkoutId/inspect', canManage, controller.inspectCheckout);
  r.post('/:checkoutId/dispute-damage', controller.disputeDamage); // resident-only, validated in the service
  r.post('/:checkoutId/record-clearance', canManage, controller.recordClearance);
  // D17.12 item 103.
  r.post('/:checkoutId/prerequisite-checklist', canManage, controller.updatePrerequisiteChecklist);
  // D17.12 item 104 — the three new milestones.
  r.post('/:checkoutId/verify-item-return', canManage, controller.recordItemReturn);
  r.post('/:checkoutId/finalize-damage-assessment', canManage, controller.finalizeDamageAssessment);
  r.post('/:checkoutId/mark-room-ready', canManage, controller.markRoomReadyForReuse);
  // D17.12 item 106.
  r.post('/:checkoutId/contact-attempts', canManage, controller.recordContactAttempt);
  // D17.12 item 107.
  r.post('/:checkoutId/inventory-items', canManage, controller.addCheckoutInventoryItem);
  // No route-level gate on approve — authorizeApproval (warden if clear,
  // head_warden if overriding) is the real authority.
  r.post('/:checkoutId/approve', controller.approveCheckout);
  r.post('/:checkoutId/cancel', controller.cancelCheckout); // resident-or-staff, validated in the service
  // D17.12 item 105.
  r.post('/:checkoutId/reopen', canManage, controller.reopenCheckout);

  return r;
}
