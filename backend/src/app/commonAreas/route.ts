import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// HOSTEL-GAP-ANALYSIS.md D17.19 (TODO.md Batch 19). One permission
// ('common_area:manage') gates all four sub-areas, same reasoning as
// roomAccess.ts's single-permission shape.
export function commonAreasRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('common_area:manage');

  // Specific paths before :areaId/:outageId/:treatmentId param routes.
  r.get('/inspections/pending-reinspection', canManage, controller.listPendingReinspections);

  r.post('/areas', canManage, controller.createCommonArea);
  // Real gap found live via SELF-TEST-GUIDE.md Batch 23 (found while
  // testing a different page): this list was staff-only, but Batch 30's
  // Residence Life page — resident-facing, "which facility can I book" —
  // needs it too, just names/types/status, nothing staff-sensitive. Same
  // shape as cases/route.ts's own staff-directory fix. getCommonArea
  // right below stays staff-only — it also returns full inspection
  // history, which a resident has no reason to see.
  r.get('/areas', controller.listCommonAreas);
  r.get('/areas/:areaId', canManage, controller.getCommonArea);
  r.patch('/areas/:areaId/status', canManage, controller.updateCommonAreaStatus);

  r.post('/inspections', canManage, controller.recordInspection);

  r.post('/outages', canManage, controller.reportOutage);
  r.get('/outages', canManage, controller.listOutages);
  r.get('/outages/:outageId', canManage, controller.getOutage);
  r.patch('/outages/:outageId/eta', canManage, controller.updateOutageEta);
  r.post('/outages/:outageId/alternative-arrangement', canManage, controller.setAlternativeArrangement);
  r.post('/outages/:outageId/restore', canManage, controller.restoreOutage);
  r.post('/outages/:outageId/verify', canManage, controller.verifyOutage);
  r.post('/outages/:outageId/close', canManage, controller.closeOutage);

  r.post('/pest-treatments', canManage, controller.reportPestFinding);
  r.get('/pest-treatments', canManage, controller.listPestTreatments);
  r.get('/pest-treatments/:treatmentId', canManage, controller.getPestTreatment);
  r.post('/pest-treatments/:treatmentId/schedule', canManage, controller.schedulePestTreatment);
  r.post('/pest-treatments/:treatmentId/notify-residents', canManage, controller.notifyResidentsForPest);
  r.post('/pest-treatments/:treatmentId/treat', canManage, controller.recordPestTreatment);
  r.post('/pest-treatments/:treatmentId/reinspect', canManage, controller.reinspectPest);

  return r;
}
