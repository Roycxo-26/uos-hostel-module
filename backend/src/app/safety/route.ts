import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.11 + D17.17 (TODO.md Batch 16). All actions
// gated by a new 'safety:manage' permission (granted to warden/head_warden
// in the seed) — safety findings and drills are a staff-authority action
// throughout, unlike Headcount, which a scoped Room-Head/Floor-Incharge can
// also act on. No equivalent scoped role exists for safety in this BRD.
export function safetyRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('safety:manage');

  r.patch('/hostels/:hostelId/status', canManage, controller.updateSafetyStatus);

  r.post('/drills', canManage, controller.planDrill);
  r.post('/drills/emergency', canManage, controller.triggerEmergencyMuster);
  r.get('/drills', controller.listDrills);
  r.get('/drills/:drillId', controller.getDrill);
  r.post('/drills/:drillId/validate-coverage', canManage, controller.validateCoverage);
  r.post('/drills/:drillId/start', canManage, controller.startDrill);
  r.post('/drills/:drillId/entries', canManage, controller.markDrillEntry);
  r.post('/drills/:drillId/complete', canManage, controller.completeDrill);
  r.post('/drills/:drillId/cancel', canManage, controller.cancelDrill);

  return r;
}
