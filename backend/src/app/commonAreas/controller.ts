import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  closeOutageSchema,
  createCommonAreaSchema,
  notifyResidentsPestSchema,
  recordInspectionSchema,
  recordPestTreatmentSchema,
  reinspectPestSchema,
  reportOutageSchema,
  reportPestFindingSchema,
  restoreOutageSchema,
  schedulePestTreatmentSchema,
  setAlternativeArrangementSchema,
  updateCommonAreaStatusSchema,
  updateOutageEtaSchema,
  verifyOutageSchema,
} from './validators';

// --- Common areas ---
export async function createCommonArea(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { area: await service.createCommonArea(req.user, createCommonAreaSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listCommonAreas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const hostelId = typeof req.query.hostelId === 'string' ? req.query.hostelId : undefined;
    const areaType = typeof req.query.areaType === 'string' ? req.query.areaType : undefined;
    success(res, { areas: await service.listCommonAreas({ hostelId, areaType }) });
  } catch (err) {
    next(err);
  }
}
export async function getCommonArea(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { area: await service.getCommonArea(req.params.areaId) });
  } catch (err) {
    next(err);
  }
}
export async function updateCommonAreaStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { area: await service.updateCommonAreaStatus(req.user, req.params.areaId, updateCommonAreaStatusSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Sanitation inspections ---
export async function recordInspection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { inspection: await service.recordInspection(req.user, recordInspectionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listPendingReinspections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { inspections: await service.listPendingReinspections() });
  } catch (err) {
    next(err);
  }
}

// --- Utility outages ---
export async function reportOutage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { outage: await service.reportOutage(req.user, reportOutageSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listOutages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const hostelId = typeof req.query.hostelId === 'string' ? req.query.hostelId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { outages: await service.listOutages({ hostelId, status }) });
  } catch (err) {
    next(err);
  }
}
export async function getOutage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { outage: await service.getOutage(req.params.outageId) });
  } catch (err) {
    next(err);
  }
}
export async function updateOutageEta(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { outage: await service.updateOutageEta(req.user, req.params.outageId, updateOutageEtaSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function setAlternativeArrangement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { outage: await service.setAlternativeArrangement(req.user, req.params.outageId, setAlternativeArrangementSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function restoreOutage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { outage: await service.restoreOutage(req.user, req.params.outageId, restoreOutageSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function verifyOutage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { outage: await service.verifyOutage(req.user, req.params.outageId, verifyOutageSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function closeOutage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { outage: await service.closeOutage(req.user, req.params.outageId, closeOutageSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Pest control ---
export async function reportPestFinding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { treatment: await service.reportPestFinding(req.user, reportPestFindingSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listPestTreatments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : undefined;
    success(res, { treatments: await service.listPestTreatments({ status, scopeId }) });
  } catch (err) {
    next(err);
  }
}
export async function getPestTreatment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { treatment: await service.getPestTreatment(req.params.treatmentId) });
  } catch (err) {
    next(err);
  }
}
export async function schedulePestTreatment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { treatment: await service.schedulePestTreatment(req.user, req.params.treatmentId, schedulePestTreatmentSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function notifyResidentsForPest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { treatment: await service.notifyResidentsForPest(req.user, req.params.treatmentId, notifyResidentsPestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function recordPestTreatment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { treatment: await service.recordPestTreatment(req.user, req.params.treatmentId, recordPestTreatmentSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function reinspectPest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { treatment: await service.reinspectPest(req.user, req.params.treatmentId, reinspectPestSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
