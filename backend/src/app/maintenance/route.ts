import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import { withIdempotency } from '../../middlewares/idempotency';
import * as controller from './controller';

// D17.08 (TODO.md Batch 29). One permission ('maintenance:manage') gates
// every staff sub-area (tickets/housekeeping/cleanliness), same shape as
// roomAccess/safety/occupancyVerification/commonAreas. Reporting a ticket,
// confirming resolution/reopening/cancelling it, and appealing/commenting
// on an inspection stay self-service (validated in the service).
export function maintenanceRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('maintenance:manage');

  r.post('/tickets', controller.reportTicket);
  r.get('/tickets', controller.listTickets);
  r.get('/tickets/:ticketId', controller.getTicket);
  r.post('/tickets/:ticketId/verify', controller.verifyTicket);
  r.post('/tickets/:ticketId/assign', canManage, controller.assignTicket);
  // Frontline/offline support (12 Sep 2026) — these two are the ones a
  // Floor Incharge/maintenance worker actually taps while walking around a
  // job with a flaky connection; wrapped so a retried offline-queue submit
  // replays the original result instead of risking a double-apply.
  r.post('/tickets/:ticketId/start', canManage, withIdempotency('maintenance.startTicketWork', controller.startTicketWork));
  r.post('/tickets/:ticketId/resolve', canManage, withIdempotency('maintenance.resolveTicket', controller.resolveTicket));
  r.post('/tickets/:ticketId/confirm', controller.confirmTicketResolution);
  r.post('/tickets/:ticketId/reopen', controller.reopenTicket);
  r.post('/tickets/:ticketId/cancel', controller.cancelTicket);
  r.post('/tickets/:ticketId/link-duplicate', canManage, controller.linkDuplicateTicket);

  r.post('/housekeeping', canManage, controller.scheduleHousekeepingTask);
  r.get('/housekeeping', canManage, controller.listHousekeepingTasks);
  r.get('/housekeeping/:taskId', canManage, controller.getHousekeepingTask);
  r.post('/housekeeping/:taskId/checklist', canManage, controller.updateHousekeepingChecklist);
  r.post('/housekeeping/:taskId/complete', canManage, controller.completeHousekeepingTask);
  r.post('/housekeeping/:taskId/missed', canManage, controller.markHousekeepingMissed);
  r.post('/housekeeping/:taskId/rework', canManage, controller.createReworkTask);

  r.post('/inspections', canManage, controller.recordCleanlinessInspection);
  // Not staff-gated at the route level — a resident sees their own room's
  // inspections, forced there in the service (see listCleanlinessInspections).
  r.get('/inspections', controller.listCleanlinessInspections);
  r.get('/inspections/:inspectionId', controller.getCleanlinessInspection);
  r.post('/inspections/:inspectionId/comment', controller.addResidentComment);
  r.post('/inspections/:inspectionId/appeal', controller.appealCleanlinessInspection);
  r.post('/inspections/:inspectionId/decide-appeal', canManage, controller.decideCleanlinessAppeal);

  r.get('/room-readiness/:roomId', canManage, controller.getRoomReadiness);

  return r;
}
