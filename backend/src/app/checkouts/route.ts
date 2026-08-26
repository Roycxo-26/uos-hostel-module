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
  // No route-level gate on approve — authorizeApproval (warden if clear,
  // head_warden if overriding) is the real authority.
  r.post('/:checkoutId/approve', controller.approveCheckout);
  r.post('/:checkoutId/cancel', controller.cancelCheckout); // resident-or-staff, validated in the service

  return r;
}
