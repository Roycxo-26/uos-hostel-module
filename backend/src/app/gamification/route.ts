import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.15 (TODO.md Batch 30, item 122). gamification:configure is Head
// Warden only (per-hostel entitlement toggle — §23.1); gamification:manage
// covers everything else staff does. Opting out and appealing stay
// self-service by the room's own current occupant, validated in the
// service.
export function gamificationRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('gamification:manage');
  const canConfigure = requireHostelPermission('gamification:configure');

  r.post('/hostels/:hostelId/toggle', canConfigure, controller.toggleHostelGamification);

  r.post('/competitions', canManage, controller.createCompetition);
  r.get('/competitions', controller.listCompetitions);
  r.get('/competitions/:competitionId', controller.getCompetition);
  r.post('/competitions/:competitionId/generate-entries', canManage, controller.generateEntries);
  r.post('/competitions/:competitionId/open', canManage, controller.openCompetition);
  r.post('/competitions/:competitionId/lock-scoring', canManage, controller.lockScoring);
  r.post('/competitions/:competitionId/compute-result', canManage, controller.computeProvisionalResult);
  r.post('/competitions/:competitionId/finalize', canManage, controller.finalizeResult);
  r.post('/competitions/:competitionId/close', canManage, controller.closeCompetition);
  r.post('/competitions/:competitionId/cancel', canManage, controller.cancelCompetition);

  r.post('/entries/:entryId/scores', canManage, controller.recordScore);
  r.get('/entries/:entryId/scores', canManage, controller.listEntryScores);
  r.post('/entries/:entryId/opt-out', controller.optOutEntry);
  r.post('/entries/:entryId/alias', canManage, controller.setAlias);
  r.post('/entries/:entryId/recognize', canManage, controller.issueRecognition);
  r.post('/entries/:entryId/appeal', controller.appealEntry);
  r.post('/entries/:entryId/decide-appeal', canManage, controller.decideEntryAppeal);

  return r;
}
