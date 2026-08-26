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
  r.get('/areas', canManage, controller.listCommonAreas);
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
