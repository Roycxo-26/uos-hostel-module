import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  createBedSchema,
  createBlockSchema,
  createFloorSchema,
  createHostelSchema,
  createRoomSchema,
  updateBedSchema,
  updateBedStatusSchema,
  updateBlockSchema,
  updateFloorSchema,
  updateHostelSchema,
  updateRoomSchema,
  updateRoomStatusSchema,
} from './validators';

export async function listHostels(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { hostels: await service.listHostels() });
  } catch (err) {
    next(err);
  }
}

export async function getHostelTree(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { hostel: await service.getHostelTree(req.params.hostelId) });
  } catch (err) {
    next(err);
  }
}

// D17.01 item 44 — resolves an old, renamed-away code back to its current
// entity. e.g. GET /structure/aliases?entityType=room&code=101
export async function resolveCodeAlias(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const entityType = String(req.query.entityType ?? '');
    const code = String(req.query.code ?? '');
    success(res, { alias: await service.resolveCodeAlias(entityType, code) });
  } catch (err) {
    next(err);
  }
}

export async function createHostel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createHostelSchema.parse(req.body);
    created(res, { hostel: await service.createHostel(req.user, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateHostel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateHostelSchema.parse(req.body);
    success(res, { hostel: await service.updateHostel(req.user, req.params.hostelId, input) });
  } catch (err) {
    next(err);
  }
}

export async function createBlock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createBlockSchema.parse(req.body);
    created(res, { block: await service.createBlock(req.user, req.params.hostelId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateBlock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateBlockSchema.parse(req.body);
    success(res, { block: await service.updateBlock(req.user, req.params.blockId, input) });
  } catch (err) {
    next(err);
  }
}

export async function createFloor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createFloorSchema.parse(req.body);
    created(res, { floor: await service.createFloor(req.user, req.params.blockId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateFloor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateFloorSchema.parse(req.body);
    success(res, { floor: await service.updateFloor(req.user, req.params.floorId, input) });
  } catch (err) {
    next(err);
  }
}

export async function createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createRoomSchema.parse(req.body);
    created(res, { room: await service.createRoom(req.user, req.params.floorId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateRoomSchema.parse(req.body);
    success(res, { room: await service.updateRoom(req.user, req.params.roomId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateRoomStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateRoomStatusSchema.parse(req.body);
    success(res, { room: await service.updateRoomStatus(req.user, req.params.roomId, input) });
  } catch (err) {
    next(err);
  }
}

export async function createBed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createBedSchema.parse(req.body);
    created(res, { bed: await service.createBed(req.user, req.params.roomId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateBed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateBedSchema.parse(req.body);
    success(res, { bed: await service.updateBed(req.user, req.params.bedId, input) });
  } catch (err) {
    next(err);
  }
}

export async function updateBedStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateBedStatusSchema.parse(req.body);
    success(res, { bed: await service.updateBedStatus(req.user, req.params.bedId, input) });
  } catch (err) {
    next(err);
  }
}
