import { Request, Response, NextFunction } from 'express';
import { created, success } from '../../utils/response';
import * as service from './service';
import {
  cancelBookingSchema,
  cancelProgrammeSchema,
  completeProgrammeSchema,
  decideBookingSchema,
  decideProgrammeSchema,
  listBookingsQuerySchema,
  listProgrammesQuerySchema,
  markAttendanceSchema,
  proposeProgrammeSchema,
  recordDamageIncidentSchema,
  registerForProgrammeSchema,
  requestBookingSchema,
  startProgrammeSchema,
} from './validators';

// --- Facility bookings ---
export async function requestBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { booking: await service.requestBooking(req.user, requestBookingSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { bookings: await service.listBookings(req.user, listBookingsQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { booking: await service.getBooking(req.params.bookingId) });
  } catch (err) {
    next(err);
  }
}
export async function decideBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { booking: await service.decideBooking(req.user, req.params.bookingId, decideBookingSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function checkInBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { booking: await service.checkInBooking(req.user, req.params.bookingId) });
  } catch (err) {
    next(err);
  }
}
export async function completeBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const attendeeCount = typeof req.body.attendeeCount === 'number' ? req.body.attendeeCount : undefined;
    success(res, { booking: await service.completeBooking(req.user, req.params.bookingId, attendeeCount) });
  } catch (err) {
    next(err);
  }
}
export async function cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { booking: await service.cancelBooking(req.user, req.params.bookingId, cancelBookingSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function recordDamageIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { booking: await service.recordDamageIncident(req.user, req.params.bookingId, recordDamageIncidentSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function closeBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { booking: await service.closeBooking(req.user, req.params.bookingId) });
  } catch (err) {
    next(err);
  }
}

// --- Residence-life programmes ---
export async function proposeProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { programme: await service.proposeProgramme(req.user, proposeProgrammeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function listProgrammes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { programmes: await service.listProgrammes(listProgrammesQuerySchema.parse(req.query)) });
  } catch (err) {
    next(err);
  }
}
export async function getProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, await service.getProgramme(req.params.programmeId));
  } catch (err) {
    next(err);
  }
}
export async function decideProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { programme: await service.decideProgramme(req.user, req.params.programmeId, decideProgrammeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function startProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { programme: await service.startProgramme(req.user, req.params.programmeId, startProgrammeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function completeProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { programme: await service.completeProgramme(req.user, req.params.programmeId, completeProgrammeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function cancelProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { programme: await service.cancelProgramme(req.user, req.params.programmeId, cancelProgrammeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function registerForProgramme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, { participant: await service.registerForProgramme(req.user, req.params.programmeId, registerForProgrammeSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
export async function markAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    success(res, { participant: await service.markAttendance(req.user, req.params.programmeId, markAttendanceSchema.parse(req.body)) });
  } catch (err) {
    next(err);
  }
}
