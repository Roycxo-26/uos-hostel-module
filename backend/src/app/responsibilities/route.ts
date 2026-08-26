import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// BR §2 / flow.md HST-WF-22: "Warden/Head Warden" assign Room Head/Floor
// In-charge — staff-only end to end, no student self-service path (unlike
// applications/transfers, nobody assigns themselves a responsibility).
export function responsibilitiesRouter(): Router {
  const r = Router();
  const canAssign = requireHostelPermission('responsibility:assign');

  r.post('/', canAssign, controller.createAssignment);
  r.get('/', canAssign, controller.listAssignments);
  r.get('/candidates', canAssign, controller.listResidentCandidates);

  // D17.22 (TODO.md Batch 21) — specific paths before the :assignmentId
  // param route below, same reasoning as every other module's own
  // specific-path-first ordering this session.
  r.post('/duty', canAssign, controller.createDutyAssignment);
  r.get('/duty/coverage', canAssign, controller.getCoverageValidation);
  r.get('/duty/resolve/:privilegeType', canAssign, controller.resolveDutyAuthority);

  r.get('/:assignmentId', canAssign, controller.getAssignment);
  r.post('/:assignmentId/revoke', canAssign, controller.revokeAssignment);
  r.post('/:assignmentId/substitute', canAssign, controller.setSubstitute);

  return r;
}
