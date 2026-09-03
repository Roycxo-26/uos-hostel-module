import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import * as commonAreasRepo from '../commonAreas/repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyOccupantsInScope } from '../../utils/notify';
import * as responsibilitiesRepo from '../responsibilities/repository';
import * as repo from './repository';
import type {
  cancelBookingSchema,
  cancelProgrammeSchema,
  completeProgrammeSchema,
  decideBookingSchema,
  decideProgrammeSchema,
  markAttendanceSchema,
  proposeProgrammeSchema,
  recordDamageIncidentSchema,
  registerForProgrammeSchema,
  requestBookingSchema,
  startProgrammeSchema,
} from './validators';

async function canManageResidenceLife(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'residence_life:manage');
}

async function validateTargetScope(scopeType: 'hostel' | 'floor', scopeId: string): Promise<{ campus_id: string }> {
  const table = scopeType === 'floor' ? 'floors' : 'hostels';
  const row = await db(table).where({ id: scopeId }).first('campus_id');
  if (!row) throw new NotFoundError(scopeType === 'floor' ? 'Floor' : 'Hostel');
  return row;
}

// ============================================================================
// Facility bookings (§24H.4/24H.5)
// ============================================================================

async function assertFacilityAvailable(commonAreaId: string, startAt: Date, endAt: Date, excludeBookingId?: string) {
  const area = await commonAreasRepo.findCommonAreaById(commonAreaId);
  if (!area) throw new NotFoundError('Facility');
  // §24H.5's FACILITY_CLOSED is this live check, not a stored booking
  // status — see the migration's own comment on why.
  if (area.status !== 'operational') throw new ConflictError(`This facility is currently '${area.status}', not available to book`);
  const overlap = await repo.findOverlappingBooking(commonAreaId, startAt, endAt, excludeBookingId);
  if (overlap) throw new ConflictError('This facility is already booked for an overlapping time');
  return area;
}

export async function requestBooking(user: AuthUser, input: z.infer<typeof requestBookingSchema>) {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const area = await assertFacilityAvailable(input.commonAreaId, startAt, endAt);

  const row = await repo.createBooking({
    org_id: user.org_id,
    campus_id: area.campus_id,
    common_area_id: input.commonAreaId,
    requested_by: user.sub,
    purpose: input.purpose,
    start_at: startAt,
    end_at: endAt,
    attendee_count: input.attendeeCount ?? null,
  });
  await recordAudit({ orgId: user.org_id, campusId: area.campus_id, actorUserId: user.sub, action: 'facility_booking.requested', entityType: 'facility_booking', entityId: row.id, after: row });
  return row;
}

export async function listBookings(user: AuthUser, filters: { status?: string; commonAreaId?: string }) {
  void user;
  return repo.listBookings(filters);
}

export async function getBooking(id: string) {
  const row = await repo.findBookingById(id);
  if (!row) throw new NotFoundError('Facility booking');
  return row;
}

export async function decideBooking(user: AuthUser, id: string, input: z.infer<typeof decideBookingSchema>) {
  if (!(await canManageResidenceLife(user))) throw new ForbiddenError('Only staff can decide a facility booking');
  const before = await repo.findBookingById(id);
  if (!before) throw new NotFoundError('Facility booking');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a booking in status '${before.status}'`);
  // Re-check conflict/availability at approval time — the requested
  // window may have since been claimed by another approved booking.
  if (input.decision === 'approved') await assertFacilityAvailable(before.common_area_id, before.start_at, before.end_at, id);

  const after = await repo.updateBooking(id, { status: input.decision, decided_by: user.sub, decided_at: db.fn.now(), decision_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: `facility_booking.${input.decision}`, entityType: 'facility_booking', entityId: id, before, after, reason: input.reason });
  await notify({ orgId: user.org_id, campusId: before.campus_id, userId: before.requested_by, type: 'facility_booking.decided', title: `Your facility booking was ${input.decision}`, body: input.reason, link: '/residence-life' });
  return after;
}

export async function checkInBooking(user: AuthUser, id: string) {
  const before = await repo.findBookingById(id);
  if (!before) throw new NotFoundError('Facility booking');
  if (before.status !== 'approved') throw new ConflictError(`Cannot check in a booking in status '${before.status}'`);
  if (before.requested_by !== user.sub && !(await canManageResidenceLife(user))) {
    throw new ForbiddenError('Only the requester or staff can check in this booking');
  }

  const after = await repo.updateBooking(id, { status: 'checked_in', checked_in_at: db.fn.now() });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'facility_booking.checked_in', entityType: 'facility_booking', entityId: id, before, after });
  return after;
}

export async function completeBooking(user: AuthUser, id: string, attendeeCount?: number) {
  if (!(await canManageResidenceLife(user))) throw new ForbiddenError('Only staff can complete a facility booking');
  const before = await repo.findBookingById(id);
  if (!before) throw new NotFoundError('Facility booking');
  if (before.status !== 'checked_in') throw new ConflictError(`Cannot complete a booking in status '${before.status}'`);

  const after = await repo.updateBooking(id, { status: 'completed', completed_at: db.fn.now(), ...(attendeeCount !== undefined && { attendee_count: attendeeCount }) });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'facility_booking.completed', entityType: 'facility_booking', entityId: id, before, after });
  return after;
}

export async function cancelBooking(user: AuthUser, id: string, input: z.infer<typeof cancelBookingSchema>) {
  const before = await repo.findBookingById(id);
  if (!before) throw new NotFoundError('Facility booking');
  if (!['requested', 'approved'].includes(before.status)) throw new ConflictError(`Cannot cancel a booking in status '${before.status}'`);
  if (before.requested_by !== user.sub && !(await canManageResidenceLife(user))) {
    throw new ForbiddenError('Only the requester or staff can cancel this booking');
  }

  const after = await repo.updateBooking(id, { status: 'cancelled', cancelled_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'facility_booking.cancelled', entityType: 'facility_booking', entityId: id, before, after, reason: input.reason });
  return after;
}

export async function recordDamageIncident(user: AuthUser, id: string, input: z.infer<typeof recordDamageIncidentSchema>) {
  if (!(await canManageResidenceLife(user))) throw new ForbiddenError('Only staff can record a damage/incident reference');
  const before = await repo.findBookingById(id);
  if (!before) throw new NotFoundError('Facility booking');

  const after = await repo.updateBooking(id, { damage_incident_reference: input.reference });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'facility_booking.damage_incident_recorded', entityType: 'facility_booking', entityId: id, before, after });
  return after;
}

export async function closeBooking(user: AuthUser, id: string) {
  if (!(await canManageResidenceLife(user))) throw new ForbiddenError('Only staff can close a facility booking');
  const before = await repo.findBookingById(id);
  if (!before) throw new NotFoundError('Facility booking');
  if (!['completed', 'cancelled', 'no_show'].includes(before.status)) throw new ConflictError(`Cannot close a booking in status '${before.status}'`);

  const after = await repo.updateBooking(id, { status: 'closed' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'facility_booking.closed', entityType: 'facility_booking', entityId: id, before, after });
  return after;
}

// ============================================================================
// Residence-life programmes (§24H.2/24H.3/24H.6)
// ============================================================================

/** §24H.6 — a Room Head/Floor In-charge organiser gets elevated access to
 * a programme they organise, scoped to exactly that programme's own
 * target scope, same shape as headcount/service.ts's own canActOnScope.
 * Deciding (approving/rejecting) stays staff-only regardless — an
 * organiser running their own event isn't the same authority as
 * committing institutional resources to it. */
async function canOperateThisProgramme(user: AuthUser, programme: { organiser_user_id: string; target_scope_type: string; target_scope_id: string }): Promise<boolean> {
  if (await canManageResidenceLife(user)) return true;
  if (user.sub !== programme.organiser_user_id) return false;
  if (programme.target_scope_type !== 'floor') return false; // hostel-wide stays staff-only, same as headcount
  if (await responsibilitiesRepo.hasActive(user.sub, 'floor_incharge', 'floor', programme.target_scope_id)) return true;
  return Boolean(await responsibilitiesRepo.hasActiveAsSubstitute(user.sub, 'floor_incharge', 'floor', programme.target_scope_id));
}

export async function proposeProgramme(user: AuthUser, input: z.infer<typeof proposeProgrammeSchema>) {
  const scope = await validateTargetScope(input.targetScopeType, input.targetScopeId);
  const organiserUserId = input.organiserUserId ?? user.sub;
  if (organiserUserId !== user.sub && !(await canManageResidenceLife(user))) {
    throw new ForbiddenError('Only staff can name a different organiser');
  }

  const row = await repo.createProgramme({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    programme_type: input.programmeType,
    target_scope_type: input.targetScopeType,
    target_scope_id: input.targetScopeId,
    organiser_user_id: organiserUserId,
    scheduled_at: new Date(input.scheduledAt),
    location: input.location ?? null,
    facility_booking_id: input.facilityBookingId ?? null,
    capacity: input.capacity ?? null,
    registration_required: input.registrationRequired,
    accessibility_needs: input.accessibilityNeeds ?? null,
    consent_required: input.consentRequired,
    incident_safety_plan: input.incidentSafetyPlan ?? null,
    cost_budget_reference: input.costBudgetReference ?? null,
    created_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId: scope.campus_id, actorUserId: user.sub, action: 'residence_programme.proposed', entityType: 'residence_programme', entityId: row.id, after: row });
  return row;
}

export async function listProgrammes(filters: { status?: string; targetScopeType?: string; targetScopeId?: string }) {
  return repo.listProgrammes(filters);
}

export async function getProgramme(id: string) {
  const row = await repo.findProgrammeById(id);
  if (!row) throw new NotFoundError('Residence-life programme');
  const participants = await repo.listParticipants(id);
  return { ...row, participants };
}

export async function decideProgramme(user: AuthUser, id: string, input: z.infer<typeof decideProgrammeSchema>) {
  if (!(await canManageResidenceLife(user))) throw new ForbiddenError('Only staff can decide a residence-life programme');
  const before = await repo.findProgrammeById(id);
  if (!before) throw new NotFoundError('Residence-life programme');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a programme in status '${before.status}'`);

  const after = await repo.updateProgramme(id, { status: input.decision, decided_by: user.sub, decided_at: db.fn.now(), decision_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: `residence_programme.${input.decision}`, entityType: 'residence_programme', entityId: id, before, after, reason: input.reason });
  await notify({ orgId: user.org_id, campusId: before.campus_id, userId: before.organiser_user_id, type: 'residence_programme.decided', title: `Your "${before.programme_type.replace(/_/g, ' ')}" programme was ${input.decision}`, body: input.reason, link: '/residence-life' });
  if (input.decision === 'approved') {
    await notifyOccupantsInScope(db, user.org_id, before.campus_id, before.target_scope_type, before.target_scope_id, {
      type: 'residence_programme.scheduled',
      title: `A "${before.programme_type.replace(/_/g, ' ')}" programme has been scheduled`,
      link: '/residence-life',
    });
  }
  return after;
}

export async function startProgramme(user: AuthUser, id: string, _input: z.infer<typeof startProgrammeSchema>) {
  const before = await repo.findProgrammeById(id);
  if (!before) throw new NotFoundError('Residence-life programme');
  if (before.status !== 'approved') throw new ConflictError(`Cannot start a programme in status '${before.status}'`);
  if (!(await canOperateThisProgramme(user, before))) throw new ForbiddenError('Only staff or this programme\'s organiser can start it');

  const after = await repo.updateProgramme(id, { status: 'in_progress' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'residence_programme.started', entityType: 'residence_programme', entityId: id, before, after });
  return after;
}

export async function completeProgramme(user: AuthUser, id: string, input: z.infer<typeof completeProgrammeSchema>) {
  const before = await repo.findProgrammeById(id);
  if (!before) throw new NotFoundError('Residence-life programme');
  if (before.status !== 'in_progress') throw new ConflictError(`Cannot complete a programme in status '${before.status}'`);
  if (!(await canOperateThisProgramme(user, before))) throw new ForbiddenError('Only staff or this programme\'s organiser can complete it');

  const after = await repo.updateProgramme(id, { status: 'completed', outcome_notes: input.outcomeNotes ?? null, feedback_summary: input.feedbackSummary ?? null });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'residence_programme.completed', entityType: 'residence_programme', entityId: id, before, after });
  return after;
}

export async function cancelProgramme(user: AuthUser, id: string, input: z.infer<typeof cancelProgrammeSchema>) {
  const before = await repo.findProgrammeById(id);
  if (!before) throw new NotFoundError('Residence-life programme');
  if (!['requested', 'approved', 'in_progress'].includes(before.status)) throw new ConflictError(`Cannot cancel a programme in status '${before.status}'`);
  if (!(await canOperateThisProgramme(user, before)) && before.created_by !== user.sub) {
    throw new ForbiddenError('Only staff, this programme\'s organiser, or whoever proposed it can cancel it');
  }

  const after = await repo.updateProgramme(id, { status: 'cancelled', decision_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'residence_programme.cancelled', entityType: 'residence_programme', entityId: id, before, after, reason: input.reason });
  await notifyOccupantsInScope(db, user.org_id, before.campus_id, before.target_scope_type, before.target_scope_id, {
    type: 'residence_programme.cancelled',
    title: `The "${before.programme_type.replace(/_/g, ' ')}" programme was cancelled`,
    body: input.reason,
    link: '/residence-life',
  });
  return after;
}

/** §24H.3 "eligibility/registration" — self-service, only while
 * registration is actually meaningful (open before/while the event runs). */
export async function registerForProgramme(user: AuthUser, id: string, _input: z.infer<typeof registerForProgrammeSchema>) {
  const before = await repo.findProgrammeById(id);
  if (!before) throw new NotFoundError('Residence-life programme');
  if (!before.registration_required) throw new ConflictError('This programme does not require registration');
  if (!['approved', 'in_progress'].includes(before.status)) throw new ConflictError(`Cannot register for a programme in status '${before.status}'`);
  const existing = await repo.findParticipant(id, user.sub);
  if (existing) throw new ConflictError('Already registered');

  const row = await repo.createParticipant({ org_id: user.org_id, campus_id: before.campus_id, programme_id: id, student_id: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'residence_programme.registered', entityType: 'residence_programme_participant', entityId: row.id, after: row });
  return row;
}

/** §24H.3 "attendance/participation reference" — also what a future
 * gamification competition's 'best_community_participation' dimension
 * would cite via its own free-text evidenceReference (Batch 30 item 122),
 * not an automatic score injection — "only when the published rules
 * allow it" (§24H.3) is a policy call this build leaves to the human
 * scoring the dimension, not something to wire up unasked. */
export async function markAttendance(user: AuthUser, id: string, input: z.infer<typeof markAttendanceSchema>) {
  const programme = await repo.findProgrammeById(id);
  if (!programme) throw new NotFoundError('Residence-life programme');
  if (!(await canOperateThisProgramme(user, programme))) throw new ForbiddenError('Only staff or this programme\'s organiser can mark attendance');

  const existing = await repo.findParticipant(id, input.studentId);
  const row = existing
    ? await repo.updateParticipant(existing.id, { attended: input.attended, participation_notes: input.participationNotes ?? null })
    : await repo.createParticipant({
        org_id: user.org_id,
        campus_id: programme.campus_id,
        programme_id: id,
        student_id: input.studentId,
        attended: input.attended,
        participation_notes: input.participationNotes ?? null,
      });
  await recordAudit({
    orgId: user.org_id,
    campusId: programme.campus_id,
    actorUserId: user.sub,
    action: 'residence_programme.attendance_marked',
    entityType: 'residence_programme_participant',
    entityId: row.id,
    after: row,
  });
  return row;
}
