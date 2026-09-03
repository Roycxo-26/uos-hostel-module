import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import type {
  cancelPlacementSchema,
  confirmExitSchema,
  confirmOccupancySchema,
  createProviderSchema,
  decidePlacementSchema,
  decideProviderComplianceSchema,
  linkIssueHandoffSchema,
  requestExitSchema,
  requestPlacementSchema,
} from './validators';

async function canManageOffCampus(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'off_campus:manage');
}

/**
 * §21.1: "This is an optional feature entitlement." §21.4: "Disabling
 * D17.13 has no effect on on-campus housing. Existing off-campus records
 * enter governed read-only/exit mode according to entitlement policy;
 * they are not deleted." Implemented as: every action that STARTS
 * something new (a provider, a placement, an approval, a fresh occupancy
 * confirmation) checks this and refuses when the flag is off; viewing,
 * exiting and cancelling stay available regardless — that's the
 * "read-only/exit mode" the rule names, not a hard freeze.
 */
async function assertFeatureEnabled(orgId: string): Promise<void> {
  const settings = await getSettings(orgId);
  if (!settings.featureFlags.enableOffCampusHousing) {
    throw new ConflictError('Off-campus/short-stay housing is not enabled for this tenant — existing records remain viewable, but nothing new can be started');
  }
}

// ============================================================================
// Providers
// ============================================================================

export async function createProvider(user: AuthUser, input: z.infer<typeof createProviderSchema>) {
  if (!(await canManageOffCampus(user))) throw new ForbiddenError('Only staff can register an off-campus provider');
  await assertFeatureEnabled(user.org_id);
  const campusId = resolveCampusId(user);

  const row = await repo.createProvider({
    org_id: user.org_id,
    campus_id: campusId,
    provider_name: input.providerName,
    address: input.address,
    emergency_contact: input.emergencyContact ?? null,
    safety_inspection_reference: input.safetyInspectionReference ?? null,
    default_contract_reference: input.defaultContractReference ?? null,
    created_by: user.sub,
  });
  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'off_campus_provider.created', entityType: 'off_campus_provider', entityId: row.id, after: row });
  return row;
}

export async function listProviders(filters: { complianceStatus?: string }) {
  return repo.listProviders(filters);
}

export async function getProvider(id: string) {
  const row = await repo.findProviderById(id);
  if (!row) throw new NotFoundError('Off-campus provider');
  return row;
}

export async function decideProviderCompliance(user: AuthUser, id: string, input: z.infer<typeof decideProviderComplianceSchema>) {
  if (!(await canManageOffCampus(user))) throw new ForbiddenError('Only staff can decide provider compliance');
  const before = await repo.findProviderById(id);
  if (!before) throw new NotFoundError('Off-campus provider');

  const after = await repo.updateProvider(id, { compliance_status: input.decision, compliance_notes: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `off_campus_provider.${input.decision}`,
    entityType: 'off_campus_provider',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

// ============================================================================
// Placements
// ============================================================================

/** §21's own "resident placement" — self-service by default, staff may
 * place a resident on their behalf, same pattern as checkouts/movements. */
export async function requestPlacement(user: AuthUser, input: z.infer<typeof requestPlacementSchema>) {
  const isStaff = await canManageOffCampus(user);
  const targetStudentId = input.studentId ?? user.sub;
  if (targetStudentId !== user.sub && !isStaff) {
    throw new ForbiddenError('Only staff can request a placement on behalf of another resident');
  }
  await assertFeatureEnabled(user.org_id);
  const campusId = resolveCampusId(user);

  const provider = await repo.findProviderById(input.providerId);
  if (!provider) throw new NotFoundError('Off-campus provider');
  if (provider.compliance_status !== 'approved') {
    throw new ConflictError(`Cannot place a resident with a provider whose compliance status is '${provider.compliance_status}', not 'approved'`);
  }

  const row = await repo.createPlacement({
    org_id: user.org_id,
    campus_id: campusId,
    provider_id: input.providerId,
    student_id: targetStudentId,
    placement_type: input.placementType,
    start_date: input.startDate,
    end_date: input.endDate,
    room_bed_reference: input.roomBedReference ?? null,
    contract_reference: input.contractReference ?? provider.default_contract_reference,
    safety_inspection_reference: provider.safety_inspection_reference,
    payment_owner_reference: input.paymentOwnerReference ?? null,
  });

  await recordAudit({ orgId: user.org_id, campusId, actorUserId: user.sub, action: 'off_campus_placement.requested', entityType: 'off_campus_placement', entityId: row.id, after: row });
  await notifyCampusStaff(db, user.org_id, campusId, {
    type: 'off_campus_placement.requested',
    title: `A ${input.placementType.replace(/_/g, ' ')} off-campus placement request is awaiting review`,
    link: '/off-campus',
  });
  return row;
}

export async function listPlacements(user: AuthUser, filters: { status?: string; studentId?: string; providerId?: string }) {
  const isStaff = await canManageOffCampus(user);
  return repo.listPlacements({ ...filters, studentId: isStaff ? filters.studentId : user.sub });
}

export async function getPlacement(user: AuthUser, id: string) {
  const row = await repo.findPlacementById(id);
  if (!row) throw new NotFoundError('Off-campus placement');
  if (row.student_id !== user.sub && !(await canManageOffCampus(user))) {
    throw new ForbiddenError('You can only view your own placement');
  }
  return row;
}

/** Approving activates the placement immediately (a future-dated
 * activation sweep is a deliberate scope cut, named — this build assumes
 * an approval means the resident is occupying now, matching how
 * check-in/allocation elsewhere in this codebase also activate on
 * approval rather than waiting on a separate scheduled date). */
export async function decidePlacement(user: AuthUser, id: string, input: z.infer<typeof decidePlacementSchema>) {
  if (!(await canManageOffCampus(user))) throw new ForbiddenError('Only staff can decide a placement');
  const before = await repo.findPlacementById(id);
  if (!before) throw new NotFoundError('Off-campus placement');
  if (!['requested', 'under_review'].includes(before.status)) throw new ConflictError(`Cannot decide a placement in status '${before.status}'`);
  if (input.decision === 'approved') await assertFeatureEnabled(user.org_id);

  const settings = await getSettings(user.org_id);
  const confirmationDays = settings.policyDefaults.offCampusOccupancyConfirmationIntervalDays;
  const nextConfirmationDue = new Date(Date.now() + confirmationDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const after = await repo.updatePlacement(id, {
    status: input.decision === 'approved' ? 'active' : 'rejected',
    decided_by: user.sub,
    decided_at: db.fn.now(),
    decision_reason: input.reason,
    ...(input.decision === 'approved' && { last_occupancy_confirmed_at: db.fn.now(), next_occupancy_confirmation_due: nextConfirmationDue }),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `off_campus_placement.${input.decision}`,
    entityType: 'off_campus_placement',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'off_campus_placement.decided',
    title: `Your off-campus placement request was ${input.decision}`,
    body: input.reason,
    link: '/off-campus',
  });
  return after;
}

/** §21.2 "periodic occupancy confirmation" — self-service by the resident
 * (or staff following up), resets the due date forward from now. */
export async function confirmOccupancy(user: AuthUser, id: string, _input: z.infer<typeof confirmOccupancySchema>) {
  const before = await repo.findPlacementById(id);
  if (!before) throw new NotFoundError('Off-campus placement');
  if (!['active', 'periodic_confirmation_due'].includes(before.status)) throw new ConflictError(`Cannot confirm occupancy for a placement in status '${before.status}'`);
  if (before.student_id !== user.sub && !(await canManageOffCampus(user))) {
    throw new ForbiddenError('Only the resident or staff can confirm this placement is still occupied');
  }

  const settings = await getSettings(user.org_id);
  const confirmationDays = settings.policyDefaults.offCampusOccupancyConfirmationIntervalDays;
  const nextConfirmationDue = new Date(Date.now() + confirmationDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const after = await repo.updatePlacement(id, { status: 'active', last_occupancy_confirmed_at: db.fn.now(), next_occupancy_confirmation_due: nextConfirmationDue });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'off_campus_placement.occupancy_confirmed', entityType: 'off_campus_placement', entityId: id, before, after });
  return after;
}

export async function requestExit(user: AuthUser, id: string, input: z.infer<typeof requestExitSchema>) {
  const before = await repo.findPlacementById(id);
  if (!before) throw new NotFoundError('Off-campus placement');
  if (!['active', 'periodic_confirmation_due'].includes(before.status)) throw new ConflictError(`Cannot request exit for a placement in status '${before.status}'`);
  if (before.student_id !== user.sub && !(await canManageOffCampus(user))) {
    throw new ForbiddenError('Only the resident or staff can request exit from this placement');
  }

  const after = await repo.updatePlacement(id, { status: 'exit_requested' });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'off_campus_placement.exit_requested', entityType: 'off_campus_placement', entityId: id, before, after, reason: input.reason });
  await notifyCampusStaff(db, user.org_id, before.campus_id, { type: 'off_campus_placement.exit_requested', title: 'An off-campus placement exit needs confirmation', body: input.reason, link: '/off-campus' });
  return after;
}

/** §21.2 "exit confirmation" — allowed even when the feature flag is off
 * (§21.4's "read-only/exit mode" names exit as exactly the thing that
 * should still work while winding down). */
export async function confirmExit(user: AuthUser, id: string, input: z.infer<typeof confirmExitSchema>) {
  if (!(await canManageOffCampus(user))) throw new ForbiddenError('Only staff can confirm a placement exit');
  const before = await repo.findPlacementById(id);
  if (!before) throw new NotFoundError('Off-campus placement');
  if (before.status !== 'exit_requested') throw new ConflictError(`Cannot confirm exit for a placement in status '${before.status}'`);

  const after = await repo.updatePlacement(id, {
    status: 'exited',
    actual_exit_date: new Date().toISOString().slice(0, 10),
    exit_confirmed_by: user.sub,
    exit_confirmed_at: db.fn.now(),
    exit_notes: input.exitNotes ?? null,
  });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'off_campus_placement.exited', entityType: 'off_campus_placement', entityId: id, before, after });
  await notify({ orgId: user.org_id, campusId: before.campus_id, userId: before.student_id, type: 'off_campus_placement.exited', title: 'Your off-campus placement exit has been confirmed', body: input.exitNotes, link: '/off-campus' });
  return after;
}

export async function cancelPlacement(user: AuthUser, id: string, input: z.infer<typeof cancelPlacementSchema>) {
  const before = await repo.findPlacementById(id);
  if (!before) throw new NotFoundError('Off-campus placement');
  if (!['requested', 'under_review', 'approved'].includes(before.status)) throw new ConflictError(`Cannot cancel a placement in status '${before.status}'`);
  if (before.student_id !== user.sub && !(await canManageOffCampus(user))) {
    throw new ForbiddenError('Only the resident or staff can cancel this placement');
  }

  const after = await repo.updatePlacement(id, { status: 'cancelled', cancelled_reason: input.reason });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'off_campus_placement.cancelled', entityType: 'off_campus_placement', entityId: id, before, after, reason: input.reason });
  return after;
}

/** §21.2 "issue/complaint handoff" — a manual staff cross-reference to a
 * Case raised separately (not auto-linked; cases/service.ts can't be
 * imported here, same reasoning visitors/service.ts's own comment on
 * INCIDENT_REVIEW gives). */
export async function linkIssueHandoff(user: AuthUser, id: string, input: z.infer<typeof linkIssueHandoffSchema>) {
  if (!(await canManageOffCampus(user))) throw new ForbiddenError('Only staff can link an issue handoff reference');
  const before = await repo.findPlacementById(id);
  if (!before) throw new NotFoundError('Off-campus placement');

  const after = await repo.updatePlacement(id, { issue_handoff_reference: input.issueHandoffReference });
  await recordAudit({ orgId: user.org_id, campusId: before.campus_id, actorUserId: user.sub, action: 'off_campus_placement.issue_linked', entityType: 'off_campus_placement', entityId: id, before, after });
  return after;
}
