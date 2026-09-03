import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  confirmFinancialEventSchema,
  disputeFinancialEventSchema,
  listFinancialEventsQuerySchema,
  raiseFinancialEventSchema,
  reverseFinancialEventSchema,
} from './validators';

export async function raiseFinancialEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = raiseFinancialEventSchema.parse(req.body);
    created(res, { event: await service.raiseFinancialEvent(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listFinancialEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listFinancialEventsQuerySchema.parse(req.query);
    success(res, { events: await service.listFinancialEvents(req.user, query) });
  } catch (err) {
    next(err);
  }
}

export async function getFinancialEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { event: await service.getFinancialEvent(req.user, req.params.eventId) });
  } catch (err) {
    next(err);
  }
}

export async function getResidentFinancialSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getResidentFinancialSummary(req.user, req.params.studentId));
  } catch (err) {
    next(err);
  }
}

export async function confirmFinancialEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = confirmFinancialEventSchema.parse(req.body);
    success(res, { event: await service.confirmFinancialEvent(req.user, req.params.eventId, input) });
  } catch (err) {
    next(err);
  }
}

export async function disputeFinancialEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = disputeFinancialEventSchema.parse(req.body);
    success(res, { event: await service.disputeFinancialEvent(req.user, req.params.eventId, input) });
  } catch (err) {
    next(err);
  }
}

export async function reverseFinancialEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reverseFinancialEventSchema.parse(req.body);
    success(res, { event: await service.reverseFinancialEvent(req.user, req.params.eventId, input) });
  } catch (err) {
    next(err);
  }
}
