import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type { cancelTransferSchema, decideTransferSchema, executeTransferSchema, requestTransferSchema } from './validators';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function canManageTransfers(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'transfer:decide');
}

/** UOS HOSTEL BR.md §7: "Residents shall request room/bed transfer" —
 * self-service by default. Staff may request on a resident's behalf
 * (required for transferType='emergency', which a resident cannot declare
 * for themselves). isTemporary (emergency-only) enrolls the eventual
 * completed transfer in jobs/restoreTemporaryRelocations.ts's auto-restore
 * sweep — see that file for the round-trip half of this workflow. */
export async function requestTransfer(user: AuthUser, input: z.infer<typeof requestTransferSchema>) {
  const targetStudentId = input.studentId ?? user.sub;

  if (input.transferType === 'emergency' && targetStudentId === user.sub) {
    throw new ValidationError("A resident cannot declare their own transfer 'emergency' — only staff can initiate an emergency relocation");
  }
  if (targetStudentId !== user.sub && !(await canManageTransfers(user))) {
    throw new ForbiddenError('Only staff can request a transfer on behalf of another resident');
  }

  // Real bug, found live: this used to filter strictly to 'checked_in_active',
  // so a second request against an allocation already sitting at
  // 'transfer_pending' (set by the FIRST request, a few lines below) threw
  // a misleading "Active allocation not found" — as if the resident weren't
  // checked in at all — before ever reaching the real duplicate-transfer
  // check underneath. 'transfer_pending' only ever gets set here, in lockstep
  // with creating a transfer_requests row, so it's always safe to include:
  // the existingActive check right below will now correctly fire instead.
  const allocation = await db('allocations')
    .where({ student_id: targetStudentId })
    .whereIn('status', ['checked_in_active', 'transfer_pending'])
    .first();
  if (!allocation) throw new NotFoundError('Active allocation for this resident');

  const existingActive = await repo.findActiveForAllocation(allocation.id);
  if (existingActive) throw new ConflictError('A transfer is already in progress for this allocation');

  try {
    const row = await repo.create({
      org_id: user.org_id,
      campus_id: allocation.campus_id,
      student_id: targetStudentId,
      current_allocation_id: allocation.id,
      old_bed_id: allocation.bed_id,
      reason: input.reason,
      transfer_type: input.transferType,
      retrospective_review_deadline: input.retrospectiveReviewDeadline ? new Date(input.retrospectiveReviewDeadline) : null,
      is_temporary: input.isTemporary,
    });

    // flow.md §6.2B: CheckedInActive -> TransferPending — blocks e.g.
    // checkout being initiated on the same allocation mid-transfer.
    await db('allocations').where({ id: allocation.id }).update({ status: 'transfer_pending', updated_at: db.fn.now() });

    await recordAudit({
      orgId: user.org_id,
      campusId: allocation.campus_id,
      actorUserId: user.sub,
      action: 'transfer.requested',
      entityType: 'transfer_request',
      entityId: row.id,
      after: row,
    });

    // Real gap, found live via SELF-TEST-GUIDE.md C7 — this wrote the row
    // and audit entry and notified nobody; staff only found out by manually
    // re-checking Allocations. Same fix applied in applications/movements/
    // cases services.
    await notifyCampusStaff(db, user.org_id, allocation.campus_id, {
      type: 'transfer.requested',
      title: `New ${input.transferType === 'emergency' ? 'emergency ' : ''}transfer request awaiting decision`,
      link: '/allocations',
    });

    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A transfer is already in progress for this allocation');
    throw err;
  }
}

export async function listTransfers(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canManageTransfers(user)) ? undefined : user.sub;
  return repo.list({ status: filters.status, studentId });
}

export async function getTransfer(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Transfer request');
  if (row.student_id !== user.sub && !(await canManageTransfers(user))) {
    throw new ForbiddenError('You can only view your own transfer request');
  }
  return row;
}

/**
 * BR §7: "Approve: Warden (normal) / Head Warden (exceptional)." This is
 * the first workflow in the codebase to actually call authorizeApproval()
 * (utils/approvalResolution.ts, built in TODO.md Batch 2) — a plain Warden
 * deciding a normal transfer resolves NORMAL; a Head Warden deciding one
 * resolves ESCALATED (correctly logged as such, even though it succeeds);
 * emergency transfers require 'head_warden' outright, so a Warden without
 * an active delegation is rejected rather than silently allowed through.
 */
export async function decideTransfer(user: AuthUser, transferId: string, input: z.infer<typeof decideTransferSchema>) {
  const before = await repo.findById(transferId);
  if (!before) throw new NotFoundError('Transfer request');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a transfer in status '${before.status}'`);

  const requiredRole = before.transfer_type === 'emergency' ? 'head_warden' : 'warden';
  const resolution = await authorizeApproval(user, { requiredRole, campusId: before.campus_id });

  if (input.decision === 'approved') {
    const bed = await db('beds').where({ id: input.newBedId }).first();
    if (!bed) throw new NotFoundError('Bed');
    if (bed.status !== 'available') throw new ConflictError(`Bed is '${bed.status}', not available`);
  }

  const after = await repo.update(transferId, {
    status: input.decision,
    decision_reason: input.reason,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    ...(input.decision === 'approved' && { new_bed_id: input.newBedId }),
  });

  // Rejected: release the TransferPending block this request put on the
  // allocation — the resident's original occupancy is unaffected.
  if (input.decision === 'rejected') {
    await db('allocations').where({ id: before.current_allocation_id }).update({ status: 'checked_in_active', updated_at: db.fn.now() });
  }

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'transfer_request',
    entityId: transferId,
    requiredRole,
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `transfer.${input.decision}`,
    entityType: 'transfer_request',
    entityId: transferId,
    before,
    after,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'transfer.decided',
    title: `Your transfer request was ${input.decision}`,
    body: input.reason,
    link: '/allocations',
  });

  return after;
}

/**
 * BR §7's "reserve new bed exclusively -> new-room inventory handover ->
 * atomic occupancy switch -> old-room inspection -> release/block old bed"
 * sequence, collapsed into one action the same way createAllocation/
 * createCheckIn already collapse their own source state machines. The
 * "new-room inventory handover" step reuses `checkins` directly (BR-HOS's
 * language for it is structurally identical to Check-In's own undertaking/
 * condition-notes/photos) rather than inventing a parallel table.
 */
export async function executeTransfer(user: AuthUser, transferId: string, input: z.infer<typeof executeTransferSchema>) {
  const before = await repo.findById(transferId);
  if (!before) throw new NotFoundError('Transfer request');
  if (before.status !== 'approved') throw new ConflictError(`Cannot execute a transfer in status '${before.status}'`);
  if (!before.new_bed_id) throw new ConflictError('Transfer has no target bed recorded');

  const newBed = await db('beds').where({ id: before.new_bed_id }).first();
  if (!newBed) throw new NotFoundError('Bed');
  if (newBed.status !== 'available') {
    throw new ConflictError(`Target bed is now '${newBed.status}', not available — the transfer cannot proceed as approved`);
  }

  const [newAllocation] = await db('allocations')
    .insert({
      org_id: user.org_id,
      campus_id: before.campus_id,
      application_id: null,
      student_id: before.student_id,
      bed_id: before.new_bed_id,
      status: 'checked_in_active',
      approver_user_id: user.sub,
      effective_from: db.fn.now(),
    })
    .returning('*');

  await db('beds').where({ id: before.new_bed_id }).update({ status: 'occupied', updated_at: db.fn.now() });
  await db('allocations').where({ id: before.current_allocation_id }).update({ status: 'ended', updated_at: db.fn.now() });
  await db('beds').where({ id: before.old_bed_id }).update({ status: input.oldBedOutcome, updated_at: db.fn.now() });

  await db('checkins').insert({
    org_id: user.org_id,
    campus_id: before.campus_id,
    allocation_id: newAllocation.id,
    undertaking_accepted: input.undertakingAccepted,
    condition_notes: input.conditionNotes ?? null,
    condition_photos: JSON.stringify(input.conditionPhotos),
    checked_in_by: user.sub,
  });

  const after = await repo.update(transferId, {
    status: 'completed',
    new_allocation_id: newAllocation.id,
    executed_by: user.sub,
    executed_at: db.fn.now(),
    old_room_inspection_notes: input.oldRoomInspectionNotes ?? null,
    old_bed_outcome: input.oldBedOutcome,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'transfer.executed',
    entityType: 'transfer_request',
    entityId: transferId,
    before,
    after: { transfer: after, newAllocationId: newAllocation.id },
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'transfer.executed',
    title: 'Your room transfer is complete',
    link: '/allocations',
  });

  return after;
}

export async function cancelTransfer(user: AuthUser, transferId: string, input: z.infer<typeof cancelTransferSchema>) {
  const before = await repo.findById(transferId);
  if (!before) throw new NotFoundError('Transfer request');
  if (!['requested', 'approved'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a transfer in status '${before.status}'`);
  }
  if (before.student_id !== user.sub && !(await canManageTransfers(user))) {
    throw new ForbiddenError('Only the requesting resident or staff can cancel this transfer');
  }

  const after = await repo.update(transferId, { status: 'cancelled', decision_reason: input.reason });

  // Undo the CheckedInActive -> TransferPending block from request time —
  // whether still 'requested' or already 'approved' but not yet executed.
  await db('allocations').where({ id: before.current_allocation_id }).update({ status: 'checked_in_active', updated_at: db.fn.now() });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'transfer.cancelled',
    entityType: 'transfer_request',
    entityId: transferId,
    before,
    after,
    reason: input.reason,
  });

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — cancelling silently
  // notified nobody, whichever side did it. Staff may have already
  // approved a destination bed hold if the resident cancels; the resident
  // needs telling if staff cancel on their behalf.
  if (user.sub === before.student_id) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'transfer.cancelled',
      title: 'A transfer request was cancelled by the resident',
      link: '/allocations',
    });
  } else {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: before.student_id,
      type: 'transfer.cancelled',
      title: 'Your transfer request was cancelled by staff',
      body: input.reason,
      link: '/allocations',
    });
  }

  return after;
}
