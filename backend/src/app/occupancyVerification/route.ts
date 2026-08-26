import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.18 (TODO.md Batch 17). Staff-only throughout —
// same reasoning as safety/route.ts: no scoped Room-Head/Floor-Incharge
// equivalent exists for occupancy verification in this BRD.
export function occupancyVerificationRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('occupancy_verification:manage');

  r.post('/sessions', canManage, controller.openSession);
  r.get('/sessions', canManage, controller.listSessions);

  // Specific path before the :sessionId param route, same reasoning as
  // allocations/route.ts's no-show-queue.
  r.get('/sessions/mismatches', canManage, controller.listUnresolvedMismatches);

  r.get('/sessions/:sessionId', canManage, controller.getSession);
  r.post('/sessions/:sessionId/entries', canManage, controller.markEntry);
  r.post('/sessions/:sessionId/close', canManage, controller.closeSession);

  r.post('/entries/:entryId/refer-to-transfer', canManage, controller.markReferredToTransfer);

  return r;
}
