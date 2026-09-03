import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import { randomBytes } from 'crypto';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as movementsRepo from '../movements/repository';
import * as roomAccessRepo from '../roomAccess/repository';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import type {
  cancelVisitorRequestSchema,
  decideVisitorRequestSchema,
  hotlistCredentialSchema,
  recordVisitorEntrySchema,
  recordVisitorExitSchema,
  reopenVisitorRequestSchema,
  requestVisitorSchema,
  resubmitVisitorRequestSchema,
} from './validators';

async function canManageVisitors(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'visitor:manage');
}

/** D17.06 item 114 — finally gives the three dead `enableVisitorSlots`/
 * `visitorSlotDurationMinutes`/`visitorSlotCapacityPerSlot` settings
 * something real to do (previously rendered in Settings, read by nothing —
 * HOSTEL-GAP-ANALYSIS.md's own note). Buckets the requested start time into
 * a fixed-width slot and refuses once that slot is full. */
async function assertSlotCapacity(orgId: string, campusId: string, requestedVisitStart: Date): Promise<void> {
  const settings = await getSettings(orgId);
  if (!settings.featureFlags.enableVisitorSlots) return;
  const { visitorSlotDurationMinutes, visitorSlotCapacityPerSlot } = settings.policyDefaults;

  const durationMs = visitorSlotDurationMinutes * 60 * 1000;
  const slotStart = new Date(Math.floor(requestedVisitStart.getTime() / durationMs) * durationMs);
  const slotEnd = new Date(slotStart.getTime() + durationMs);
  const count = await repo.countInSlot(campusId, slotStart, slotEnd);
  if (count >= visitorSlotCapacityPerSlot) {
    throw new ConflictError(`This time slot is full (capacity ${visitorSlotCapacityPerSlot}) — choose another time`);
  }
}

/** §14.1 — "authorised host creates request." Unlike applications/
 * transfers/checkouts, there is no staff-on-behalf-of path here: the host
 * IS whoever authenticated (a resident, or a staff/department/campus-office
 * account acting as its own host), never a third party filled in by staff. */
export async function requestVisitor(user: AuthUser, input: z.infer<typeof requestVisitorSchema>) {
  const campusId = resolveCampusId(user);
  const requestedVisitStart = new Date(input.requestedVisitStart);
  await assertSlotCapacity(user.org_id, campusId, requestedVisitStart);

  const row = await repo.create({
    org_id: user.org_id,
    campus_id: campusId,
    host_user_id: user.sub,
    host_type: input.hostType,
    visitor_name: input.visitorName,
    visitor_phone: input.visitorPhone,
    visitor_photo_url: input.visitorPhotoUrl ?? null,
    visitor_id_reference: input.visitorIdReference ?? null,
    visitor_category: input.visitorCategory ?? null,
    purpose: input.purpose,
    requested_visit_start: requestedVisitStart,
    requested_visit_end: new Date(input.requestedVisitEnd),
    approved_zone_scope: input.approvedZoneScope ?? null,
    emergency_contact: input.emergencyContact ?? null,
  });

  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'visitor.requested', entityType: 'visitor_request', entityId: row.id, after: row });
  await notifyCampusStaff(db, user.org_id, campusId, {
    type: 'visitor.requested',
    title: `A visitor request for ${input.visitorName} is awaiting review`,
    link: '/visitors',
  });

  return row;
}

export async function listVisitorRequests(user: AuthUser, filters: { status?: string; hostUserId?: string }) {
  const isStaff = await canManageVisitors(user);
  return repo.list({ ...filters, hostUserId: isStaff ? filters.hostUserId : user.sub });
}

export async function getVisitorRequest(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Visitor request');
  if (row.host_user_id !== user.sub && !(await canManageVisitors(user))) {
    throw new ForbiddenError('You can only view your own visitor requests');
  }
  return row;
}

/** DEV-SIMULATED credential issue — D19 owns real credential issue/
 * activation/expiry/destruction (§14.4); no such system exists here, same
 * reasoning as the guardian OTP simulation (Batch 23). Opaque, no
 * cryptographic meaning — Hostel is only ever meant to see status, never a
 * real secret (§14.4: "Hostel sees status, not cryptographic secrets"). */
function generateCredentialId(): string {
  return `VIS-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export async function decideVisitorRequest(user: AuthUser, id: string, input: z.infer<typeof decideVisitorRequestSchema>) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can decide a visitor request');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a visitor request in status '${before.status}'`);

  const patch: Record<string, unknown> = {
    status: input.decision,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    decision_reason: input.reason,
  };
  if (input.decision === 'approved') {
    patch.status = 'pass_issued';
    patch.credential_id = generateCredentialId();
    patch.credential_valid_from = db.fn.now();
    patch.credential_valid_until = before.requested_visit_end;
  }

  const after = await repo.update(id, patch);
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `visitor.${input.decision}`,
    entityType: 'visitor_request',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.host_user_id,
    type: 'visitor.decided',
    title:
      input.decision === 'approved'
        ? `Your visitor request for ${before.visitor_name} was approved — pass ${after.credential_id}`
        : input.decision === 'returned_for_information'
          ? `Your visitor request for ${before.visitor_name} needs more information`
          : `Your visitor request for ${before.visitor_name} was denied`,
    body: input.reason,
    link: '/visitors',
  });

  return after;
}

export async function resubmitVisitorRequest(user: AuthUser, id: string, input: z.infer<typeof resubmitVisitorRequestSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (before.host_user_id !== user.sub) throw new ForbiddenError('Only the host can resubmit this request');
  if (before.status !== 'returned_for_information') throw new ConflictError(`Cannot resubmit a visitor request in status '${before.status}'`);

  const requestedVisitStart = new Date(input.requestedVisitStart);
  await assertSlotCapacity(user.org_id, before.campus_id, requestedVisitStart);

  const after = await repo.update(id, {
    status: 'requested',
    host_type: input.hostType,
    visitor_name: input.visitorName,
    visitor_phone: input.visitorPhone,
    visitor_photo_url: input.visitorPhotoUrl ?? null,
    visitor_id_reference: input.visitorIdReference ?? null,
    visitor_category: input.visitorCategory ?? null,
    purpose: input.purpose,
    requested_visit_start: requestedVisitStart,
    requested_visit_end: new Date(input.requestedVisitEnd),
    approved_zone_scope: input.approvedZoneScope ?? null,
    emergency_contact: input.emergencyContact ?? null,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'visitor.resubmitted', entityType: 'visitor_request', entityId: id, before, after });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'visitor.resubmitted',
    title: `A visitor request for ${input.visitorName} was resubmitted for review`,
    link: '/visitors',
  });

  return after;
}

const CANCELLABLE_FROM = new Set(['requested', 'returned_for_information', 'approved', 'pass_issued']);

export async function cancelVisitorRequest(user: AuthUser, id: string, input: z.infer<typeof cancelVisitorRequestSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (!CANCELLABLE_FROM.has(before.status)) throw new ConflictError(`Cannot cancel a visitor request in status '${before.status}'`);
  if (before.host_user_id !== user.sub && !(await canManageVisitors(user))) {
    throw new ForbiddenError('Only the host or staff can cancel this visitor request');
  }

  const after = await repo.update(id, { status: 'cancelled', cancelled_reason: input.reason, cancelled_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'visitor.cancelled', entityType: 'visitor_request', entityId: id, before, after, reason: input.reason });
  return after;
}

/** §14.3 "Gate validates and records entry" — no live Gate integration
 * exists (same stopgap this codebase already uses for movement out/in), so
 * front-desk staff record it manually here. */
export async function recordVisitorEntry(user: AuthUser, id: string, _input: z.infer<typeof recordVisitorEntrySchema>) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can record a visitor entry');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (before.status !== 'pass_issued') throw new ConflictError(`Cannot record entry for a visitor request in status '${before.status}'`);
  if (before.credential_hotlisted) throw new ConflictError('This credential is hotlisted — entry refused');
  if (before.credential_valid_until && new Date(before.credential_valid_until) < new Date()) {
    throw new ConflictError('This credential has expired — entry refused');
  }

  const after = await repo.update(id, { status: 'entered', entered_at: db.fn.now(), entered_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'visitor.entered', entityType: 'visitor_request', entityId: id, before, after });
  return after;
}

export async function recordVisitorExit(user: AuthUser, id: string, _input: z.infer<typeof recordVisitorExitSchema>) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can record a visitor exit');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (!['entered', 'overstay'].includes(before.status)) throw new ConflictError(`Cannot record exit for a visitor request in status '${before.status}'`);

  const after = await repo.update(id, { status: 'exited', exited_at: db.fn.now(), exited_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'visitor.exited', entityType: 'visitor_request', entityId: id, before, after });
  return after;
}

/** A deliberately separate step from exit (§14.5 lists EXITED and CLOSED
 * as distinct states) — gives staff a moment to note anything (an
 * incident, an overstay) before the record is considered fully wrapped up,
 * rather than auto-closing the instant someone walks out. */
export async function closeVisitorRequest(user: AuthUser, id: string) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can close a visitor request');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (before.status !== 'exited') throw new ConflictError(`Cannot close a visitor request in status '${before.status}'`);

  const after = await repo.update(id, { status: 'closed', closed_at: db.fn.now(), closed_by: user.sub });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'visitor.closed', entityType: 'visitor_request', entityId: id, before, after });
  return after;
}

export async function reopenVisitorRequest(user: AuthUser, id: string, input: z.infer<typeof reopenVisitorRequestSchema>) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can reopen a visitor request');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (before.status !== 'closed') throw new ConflictError(`Cannot reopen a visitor request in status '${before.status}'`);

  const after = await repo.update(id, { status: 'reopened', reopen_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'visitor.reopened', entityType: 'visitor_request', entityId: id, before, after, reason: input.reason });
  return after;
}

/** §14.4 "lost credential is hotlisted." Orthogonal to physical presence —
 * a still-inside visitor being hotlisted is a real front-desk/security
 * event this records and notifies, but physically escorting them out is a
 * human decision this module doesn't automate. */
export async function hotlistCredential(user: AuthUser, id: string, input: z.infer<typeof hotlistCredentialSchema>) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can hotlist a credential');
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Visitor request');
  if (!['pass_issued', 'entered', 'overstay'].includes(before.status)) {
    throw new ConflictError(`Cannot hotlist a credential for a visitor request in status '${before.status}'`);
  }
  if (before.credential_hotlisted) throw new ConflictError('Already hotlisted');

  const after = await repo.update(id, { credential_hotlisted: true, credential_hotlisted_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'visitor.credential_hotlisted',
    entityType: 'visitor_request',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'visitor.credential_hotlisted',
    title: `Credential ${before.credential_id} (${before.visitor_name}) was hotlisted`,
    body: input.reason,
    link: '/visitors',
  });
  return after;
}

/** §14.8 shift handover. Repo-to-repo reads across roomAccess/movements —
 * a read-only aggregation, not a business action, so this doesn't need
 * either module's own service-layer rules; just their raw current state. */
export async function getShiftHandover(user: AuthUser) {
  if (!(await canManageVisitors(user))) throw new ForbiddenError('Only staff can view the shift handover');

  const [entered, overstay, expectedArrivals, outstandingKeysIssued, outstandingKeysOverdue, uncollectedPackages, residentsOverdue] = await Promise.all([
    repo.list({ status: 'entered' }),
    repo.list({ status: 'overstay' }),
    repo.list({ status: 'pass_issued' }),
    roomAccessRepo.listKeyLogs({ status: 'issued' }),
    roomAccessRepo.listKeyLogs({ status: 'overdue' }),
    roomAccessRepo.listCustody({ status: 'in_custody', custodyType: 'package_delivery' }),
    movementsRepo.list({ status: 'overdue' }),
  ]);

  return {
    activeVisitors: [...entered, ...overstay],
    expectedArrivals,
    outstandingKeys: [...outstandingKeysIssued, ...outstandingKeysOverdue],
    uncollectedPackages,
    residentsOverdue,
  };
}
