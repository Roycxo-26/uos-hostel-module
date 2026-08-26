import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

export function auditRouter(): Router {
  const r = Router();
  r.get('/', requireHostelPermission('audit:view'), controller.listAuditLog);
  return r;
}
