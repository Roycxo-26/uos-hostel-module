import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  appealEntrySchema,
  cancelCompetitionSchema,
  createCompetitionSchema,
  decideEntryAppealSchema,
  issueRecognitionSchema,
  listCompetitionsQuerySchema,
  optOutEntrySchema,
  recordScoreSchema,
  setAliasSchema,
  toggleHostelGamificationSchema,
} from './validators';

export async function toggleHostelGamification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { hostel: await service.toggleHostelGamification(req.user, req.params.hostelId, toggleHostelGamificationSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function createCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { competition: await service.createCompetition(req.user, createCompetitionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listCompetitions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competitions: await service.listCompetitions(listCompetitionsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getCompetition(req.params.competitionId));
  } catch (err) {
    next(err);
  }
}
export async function generateEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { entries: await service.generateEntries(req.user, req.params.competitionId) });
  } catch (err) {
    next(err);
  }
}
export async function openCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competition: await service.openCompetition(req.user, req.params.competitionId) });
  } catch (err) {
    next(err);
  }
}
export async function lockScoring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competition: await service.lockScoring(req.user, req.params.competitionId) });
  } catch (err) {
    next(err);
  }
}
export async function computeProvisionalResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competition: await service.computeProvisionalResult(req.user, req.params.competitionId) });
  } catch (err) {
    next(err);
  }
}
export async function finalizeResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competition: await service.finalizeResult(req.user, req.params.competitionId) });
  } catch (err) {
    next(err);
  }
}
export async function closeCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competition: await service.closeCompetition(req.user, req.params.competitionId) });
  } catch (err) {
    next(err);
  }
}
export async function cancelCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { competition: await service.cancelCompetition(req.user, req.params.competitionId, cancelCompetitionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}

export async function recordScore(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { score: await service.recordScore(req.user, req.params.entryId, recordScoreSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listEntryScores(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { scores: await service.listEntryScores(req.params.entryId) });
  } catch (err) {
    next(err);
  }
}
export async function optOutEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.optOutEntry(req.user, req.params.entryId, optOutEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function setAlias(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.setAlias(req.user, req.params.entryId, setAliasSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function issueRecognition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.issueRecognition(req.user, req.params.entryId, issueRecognitionSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function appealEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.appealEntry(req.user, req.params.entryId, appealEntrySchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function decideEntryAppeal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.decideEntryAppeal(req.user, req.params.entryId, decideEntryAppealSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
