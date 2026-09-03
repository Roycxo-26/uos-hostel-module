import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  addResidentCommentSchema,
  appealCleanlinessInspectionSchema,
  assignTicketSchema,
  cancelTicketSchema,
  completeHousekeepingTaskSchema,
  confirmTicketResolutionSchema,
  createReworkTaskSchema,
  decideCleanlinessAppealSchema,
  linkDuplicateTicketSchema,
  listCleanlinessInspectionsQuerySchema,
  listHousekeepingTasksQuerySchema,
  listTicketsQuerySchema,
  markHousekeepingMissedSchema,
  recordCleanlinessInspectionSchema,
  reopenTicketSchema,
  reportTicketSchema,
  resolveTicketSchema,
  scheduleHousekeepingTaskSchema,
  updateHousekeepingChecklistSchema,
  verifyTicketSchema,
} from './validators';

// --- Tickets ---
export async function reportTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { ticket: await service.reportTicket(req.user, reportTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { tickets: await service.listTickets(req.user, listTicketsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.getTicket(req.user, req.params.ticketId) });
  } catch (err) {
    next(err);
  }
}
export async function verifyTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.verifyTicket(req.user, req.params.ticketId, verifyTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function assignTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.assignTicket(req.user, req.params.ticketId, assignTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function startTicketWork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.startTicketWork(req.user, req.params.ticketId) });
  } catch (err) {
    next(err);
  }
}
export async function resolveTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.resolveTicket(req.user, req.params.ticketId, resolveTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function confirmTicketResolution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.confirmTicketResolution(req.user, req.params.ticketId, confirmTicketResolutionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function reopenTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.reopenTicket(req.user, req.params.ticketId, reopenTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function cancelTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.cancelTicket(req.user, req.params.ticketId, cancelTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function linkDuplicateTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { ticket: await service.linkDuplicateTicket(req.user, req.params.ticketId, linkDuplicateTicketSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Housekeeping ---
export async function scheduleHousekeepingTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { task: await service.scheduleHousekeepingTask(req.user, scheduleHousekeepingTaskSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listHousekeepingTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { tasks: await service.listHousekeepingTasks(listHousekeepingTasksQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getHousekeepingTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { task: await service.getHousekeepingTask(req.params.taskId) });
  } catch (err) {
    next(err);
  }
}
export async function updateHousekeepingChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { task: await service.updateHousekeepingChecklist(req.user, req.params.taskId, updateHousekeepingChecklistSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function completeHousekeepingTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { task: await service.completeHousekeepingTask(req.user, req.params.taskId, completeHousekeepingTaskSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function markHousekeepingMissed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { task: await service.markHousekeepingMissed(req.user, req.params.taskId, markHousekeepingMissedSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function createReworkTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { task: await service.createReworkTask(req.user, req.params.taskId, createReworkTaskSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Cleanliness inspection ---
export async function recordCleanlinessInspection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { inspection: await service.recordCleanlinessInspection(req.user, recordCleanlinessInspectionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listCleanlinessInspections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { inspections: await service.listCleanlinessInspections(req.user, listCleanlinessInspectionsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getCleanlinessInspection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { inspection: await service.getCleanlinessInspection(req.user, req.params.inspectionId) });
  } catch (err) {
    next(err);
  }
}
export async function addResidentComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { inspection: await service.addResidentComment(req.user, req.params.inspectionId, addResidentCommentSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function appealCleanlinessInspection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { inspection: await service.appealCleanlinessInspection(req.user, req.params.inspectionId, appealCleanlinessInspectionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function decideCleanlinessAppeal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { inspection: await service.decideCleanlinessAppeal(req.user, req.params.inspectionId, decideCleanlinessAppealSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

// --- Room readiness ---
export async function getRoomReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getRoomReadiness(req.user, req.params.roomId));
  } catch (err) {
    next(err);
  }
}
