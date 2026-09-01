import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function movementsRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('movement:manage');

  // D17.10 item 90 — a student manages their own guardian contacts;
  // verifying one is staff-only (canManage), same split as the request
  // itself (self-service submit, staff-only decide).
  r.post('/guardians', controller.addGuardian);
  r.get('/guardians', controller.listMyGuardians);
  r.get('/guardians/:guardianId', controller.getGuardian); // self-or-staff, validated in the service
  r.post('/guardians/:guardianId/verify', canManage, controller.verifyGuardian);

  // D17.10 item 94 — the Gate console's own minimal-disclosure queue, ahead
  // of /:movementId so it isn't swallowed by that param route.
  r.get('/gate-queue', canManage, controller.listGateQueue);

  // BR §8: "Residents shall request leave/gate pass" — self-service.
  r.post('/', controller.requestMovement);
  r.get('/', controller.listMovements);
  r.get('/:movementId', controller.getMovement);

  r.post('/:movementId/decide', canManage, controller.decideMovement);
  r.post('/:movementId/cancel', controller.cancelMovement); // requester-or-staff validated in the service
  r.post('/:movementId/record-exit', canManage, controller.recordExit);
  r.post('/:movementId/record-return', canManage, controller.recordReturn);

  // D17.10 item 90 — guardian confirmation. Both Warden-only: the student
  // never gets an OTP-entry route at all (policy: "the student must not be
  // able to enter the OTP through the student application").
  r.post('/:movementId/guardian-otp/verify', canManage, controller.verifyGuardianOtp);
  r.post('/:movementId/guardian-otp/resend', canManage, controller.resendGuardianOtp);
  r.post('/:movementId/guardian-call-confirmation', canManage, controller.recordGuardianCallConfirmation);

  // D17.10 item 93 — extension requests. Submit is self-service-or-staff
  // (matches cancel's own split, enforced in service.ts); decide is
  // staff-only.
  r.post('/:movementId/extensions', controller.requestExtension);
  r.post('/extensions/:extensionId/decide', canManage, controller.decideExtension);

  return r;
}
