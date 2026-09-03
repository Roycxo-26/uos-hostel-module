import { Router } from 'express';
import { requireHostelPermission } from '../../middlewares/requireHostelPermission';
import * as controller from './controller';

// D17.24 (TODO.md Batch 30, item 125). Deciding a booking/programme stays
// staff-only ('residence_life:manage'); requesting/proposing, checking
// in, cancelling and registering are self-service (validated in the
// service — the organiser-elevation path for a programme's own Room
// Head/Floor In-charge is checked there too, not at this route layer).
export function residenceLifeRouter(): Router {
  const r = Router();
  const canManage = requireHostelPermission('residence_life:manage');

  r.post('/bookings', controller.requestBooking);
  r.get('/bookings', controller.listBookings);
  r.get('/bookings/:bookingId', controller.getBooking);
  r.post('/bookings/:bookingId/decide', canManage, controller.decideBooking);
  r.post('/bookings/:bookingId/check-in', controller.checkInBooking);
  r.post('/bookings/:bookingId/complete', canManage, controller.completeBooking);
  r.post('/bookings/:bookingId/cancel', controller.cancelBooking);
  r.post('/bookings/:bookingId/damage-incident', canManage, controller.recordDamageIncident);
  r.post('/bookings/:bookingId/close', canManage, controller.closeBooking);

  r.post('/programmes', controller.proposeProgramme);
  r.get('/programmes', controller.listProgrammes);
  r.get('/programmes/:programmeId', controller.getProgramme);
  r.post('/programmes/:programmeId/decide', canManage, controller.decideProgramme);
  r.post('/programmes/:programmeId/start', controller.startProgramme);
  r.post('/programmes/:programmeId/complete', controller.completeProgramme);
  r.post('/programmes/:programmeId/cancel', controller.cancelProgramme);
  r.post('/programmes/:programmeId/register', controller.registerForProgramme);
  r.post('/programmes/:programmeId/attendance', controller.markAttendance);

  return r;
}
