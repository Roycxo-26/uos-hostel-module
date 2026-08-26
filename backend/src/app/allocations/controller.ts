import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  createAllocationSchema,
  createOfferSchema,
  declineOfferSchema,
  deferNoShowSchema,
  noShowExtendSchema,
  noShowReleaseSchema,
  reassignNoShowSchema,
  reserveBedSchema,
  updateWaitlistPrioritySchema,
  withdrawOfferSchema,
} from './validators';

export async function createAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createAllocationSchema.parse(req.body);
    created(res, { allocation: await service.createAllocation(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listAllocations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { allocations: await service.listAllocations(req.user, { status }) });
  } catch (err) {
    next(err);
  }
}

export async function getAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { allocation: await service.getAllocation(req.params.allocationId) });
  } catch (err) {
    next(err);
  }
}

export async function listNoShowQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { allocations: await service.listNoShowQueue() });
  } catch (err) {
    next(err);
  }
}

export async function releaseNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = noShowReleaseSchema.parse(req.body);
    success(res, { allocation: await service.releaseNoShow(req.user, req.params.allocationId, input) });
  } catch (err) {
    next(err);
  }
}

export async function extendNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = noShowExtendSchema.parse(req.body);
    success(res, { allocation: await service.extendNoShow(req.user, req.params.allocationId, input) });
  } catch (err) {
    next(err);
  }
}

// D17.03 — Waitlist

export async function listWaitlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const hostelId = typeof req.query.hostelId === 'string' ? req.query.hostelId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { waitlist: await service.listWaitlist({ hostelId, status }) });
  } catch (err) {
    next(err);
  }
}

export async function getMyWaitlistPosition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { position: await service.getMyWaitlistPosition(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function updateWaitlistPriority(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateWaitlistPrioritySchema.parse(req.body);
    success(res, { entry: await service.updateWaitlistPriority(req.user, req.params.entryId, input) });
  } catch (err) {
    next(err);
  }
}

export async function withdrawFromWaitlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { entry: await service.withdrawFromWaitlist(req.user, req.params.entryId) });
  } catch (err) {
    next(err);
  }
}

// D17.03 — Bed holds

export async function reserveBed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reserveBedSchema.parse(req.body);
    created(res, { hold: await service.reserveBed(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function releaseBedHold(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { hold: await service.releaseBedHold(req.user, req.params.holdId) });
  } catch (err) {
    next(err);
  }
}

export async function getNoBedReason(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getNoBedReason(req.params.applicationId));
  } catch (err) {
    next(err);
  }
}

// D17.03 — Allocation offers

export async function createOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createOfferSchema.parse(req.body);
    created(res, { offer: await service.createOffer(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function listOffers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    success(res, { offers: await service.listOffers(req.user, { status }) });
  } catch (err) {
    next(err);
  }
}

export async function acceptOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.acceptOffer(req.user, req.params.offerId));
  } catch (err) {
    next(err);
  }
}

export async function declineOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = declineOfferSchema.parse(req.body);
    success(res, { offer: await service.declineOffer(req.user, req.params.offerId, input) });
  } catch (err) {
    next(err);
  }
}

export async function withdrawOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = withdrawOfferSchema.parse(req.body);
    success(res, { offer: await service.withdrawOffer(req.user, req.params.offerId, input) });
  } catch (err) {
    next(err);
  }
}

// D17.03 item 58 — remaining no-show states

export async function cancelAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { allocation: await service.cancelAllocation(req.user, req.params.allocationId) });
  } catch (err) {
    next(err);
  }
}

export async function deferNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = deferNoShowSchema.parse(req.body);
    success(res, { allocation: await service.deferNoShow(req.user, req.params.allocationId, input) });
  } catch (err) {
    next(err);
  }
}

export async function reassignNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = reassignNoShowSchema.parse(req.body);
    created(res, { offer: await service.reassignNoShow(req.user, req.params.allocationId, input) });
  } catch (err) {
    next(err);
  }
}
