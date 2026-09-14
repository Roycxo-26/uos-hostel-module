import { createHash, randomInt } from 'crypto';
import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { authorizeApproval, recordApprovalResolution } from '../../utils/approvalResolution';
import { resolveCampusId } from '../../utils/campusScope';
import { notify, notifyCampusStaff } from '../../utils/notify';
import * as messKitchenRepo from '../messKitchen/repository';
import { getSettings } from '../settings/service';
import * as repo from './repository';
import type { MovementType } from './types';
import type {
  addGuardianSchema,
  cancelMovementSchema,
  decideExtensionSchema,
  decideMovementSchema,
  recordCallConfirmationSchema,
  requestExtensionSchema,
  requestMovementSchema,
  verifyOtpSchema,
} from './validators';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function canManageMovements(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'movement:manage');
}

// D17.10 item 91 — "approval varying by type": emergency/extended/mass-
// holiday leave carry more institutional weight than a routine gate pass,
// so they require Head Warden directly rather than a plain Warden (who'd
// still be covered via authorizeApproval's own ESCALATED path if they
// happen to also hold a higher role — this only raises the REQUIRED floor).
const HEAD_WARDEN_REQUIRED_TYPES: ReadonlySet<MovementType> = new Set(['emergency_leave', 'extended_leave', 'mass_holiday_leave']);

function requiredRoleFor(movementType: MovementType): string {
  return HEAD_WARDEN_REQUIRED_TYPES.has(movementType) ? 'head_warden' : 'warden';
}

// ============================================================================
// D17.10 item 90 — resident guardians
// ============================================================================

export async function addGuardian(user: AuthUser, input: z.infer<typeof addGuardianSchema>) {
  const campusId = resolveCampusId(user);

  if (input.isPrimary) {
    await repo.clearPrimaryGuardians(user.sub);
  }

  const row = await repo.createGuardian({
    org_id: user.org_id,
    campus_id: campusId,
    student_id: user.sub,
    name: input.name,
    relationship: input.relationship,
    mobile_number: input.mobileNumber,
    is_primary: input.isPrimary ?? false,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'guardian.added',
    entityType: 'resident_guardian',
    entityId: row.id,
    after: row,
  });

  // A newly-added guardian isn't usable for confirmation yet — staff have
  // to verify the contact is genuine first (verifyGuardian below). Real gap
  // this closes: without this notify, a student could add a guardian and
  // have no idea staff verification was even a separate step required.
  await notifyCampusStaff(db, user.org_id, campusId, {
    type: 'guardian.added',
    title: 'A resident added a new guardian contact awaiting verification',
    link: '/movement',
  });

  return row;
}

export async function listMyGuardians(user: AuthUser) {
  return repo.listGuardiansForStudent(user.sub);
}

/** Staff-only — the other half of the "a resident added a new guardian
 * contact awaiting verification" notification above: without this, staff
 * had no screen to actually act on that notification once it arrived.
 * Real gap found live via SELF-TEST-GUIDE.md Batch 23. */
export async function listAllGuardians(user: AuthUser, filters: { verified?: boolean }) {
  if (!(await canManageMovements(user))) throw new ForbiddenError("Only staff can list every resident's guardian contacts");
  return repo.listGuardiansForCampus(filters);
}

/** Staff-only — confirms the contact itself is genuine, separate from any
 * one outpass. Deliberately no "how" is captured here (a phone call, an
 * in-person form, whatever the institution's own process is) — that's
 * outside this module's authority to prescribe. */
export async function verifyGuardian(user: AuthUser, guardianId: string) {
  const before = await repo.findGuardianById(guardianId);
  if (!before) throw new NotFoundError('Guardian');

  const after = await repo.updateGuardian(guardianId, { verified: true, verified_by: user.sub, verified_at: db.fn.now() });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'guardian.verified',
    entityType: 'resident_guardian',
    entityId: guardianId,
    before,
    after,
  });
  return after;
}

/** Staff reach the guardian record through the movement request that names
 * it (Movement.tsx's DecideMovementSheet — "verify this guardian right
 * here" rather than a separate global pending-verification list), so this
 * is deliberately reachable by the owning student OR staff, not just the
 * student themselves like listMyGuardians. */
export async function getGuardian(user: AuthUser, guardianId: string) {
  const row = await repo.findGuardianById(guardianId);
  if (!row) throw new NotFoundError('Guardian');
  if (row.student_id !== user.sub && !(await canManageMovements(user))) {
    throw new ForbiddenError('You can only view your own guardian contacts');
  }
  return row;
}

// ============================================================================
// D17.10 items 90/91 — the request itself, now guardian-gated
// ============================================================================

/**
 * Development-mode stand-in for a real WhatsApp/SMS gateway. Management's
 * channel decision: WhatsApp API as the primary channel, SMS as the
 * secondary/fallback — but no actual provider account is set up yet, so
 * this still can't send anything for real. When one is: primary send via
 * WhatsApp, fall back to SMS on failure, and this function's body is the
 * only place that needs to change, nothing in the surrounding workflow.
 *
 * The OTP is never returned in any API response and never logged where the
 * resident or Warden could see it (matches the policy's own "Warden must
 * not be able to view the OTP" / "student must not be able to enter the
 * OTP" rules) — this console line is the ONLY place it's ever visible in
 * plaintext, and only when DEV_STANDALONE=true.
 */
function simulateSendGuardianOtp(guardian: { name: string; mobile_number: string }, code: string, movementId: string): void {
  if (process.env.DEV_STANDALONE === 'true') {
    console.log(
      `[hostel][DEV SIMULATED WhatsApp/SMS to guardian] To ${guardian.name} (${guardian.mobile_number}) — your outpass approval code for movement ${movementId} is ${code}. Valid 5 minutes. Share only if you approve.`
    );
  }
}

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

async function generateOtpConfirmation(orgId: string, campusId: string, movementId: string, requestVersion: number, guardian: { id: string; name: string; mobile_number: string }) {
  const settings = await getSettings(orgId);
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + settings.policyDefaults.guardianOtpExpiryMinutes * 60 * 1000);

  const confirmation = await repo.createConfirmation({
    org_id: orgId,
    campus_id: campusId,
    movement_request_id: movementId,
    request_version: requestVersion,
    method: 'otp',
    otp_code_hash: hashOtp(code),
    otp_generated_at: db.fn.now(),
    otp_expires_at: expiresAt,
    otp_max_attempts: settings.policyDefaults.guardianOtpMaxAttempts,
    status: 'pending',
  });

  simulateSendGuardianOtp(guardian, code, movementId);
  return confirmation;
}

/** BR §8: "Residents shall request leave/gate pass" — self-service, own
 * campus. D17.10 depth: now requires a verified guardian on file, and
 * immediately kicks off that guardian's OTP confirmation — the BRD's own
 * flow diagram sends the OTP the moment the request is submitted, not as a
 * separate later step. */
export async function requestMovement(user: AuthUser, input: z.infer<typeof requestMovementSchema>) {
  const campusId = resolveCampusId(user);

  const existing = await repo.findActiveForStudent(user.sub);
  if (existing) throw new ConflictError(`An active movement request already exists (status: ${existing.status})`);

  const guardian = await repo.findGuardianById(input.guardianId);
  if (!guardian || guardian.student_id !== user.sub) throw new NotFoundError('Guardian');
  if (!guardian.verified) throw new ConflictError('This guardian contact is not yet verified by staff — ask a Warden to verify it before requesting');

  try {
    const row = await repo.create({
      org_id: user.org_id,
      campus_id: campusId,
      student_id: user.sub,
      movement_type: input.movementType,
      destination: input.destination,
      purpose: input.purpose,
      requested_out: new Date(input.requestedOut),
      requested_return: new Date(input.requestedReturn),
      status: 'requested',
      guardian_id: guardian.id,
    });

    await generateOtpConfirmation(user.org_id, campusId, row.id, row.request_version, guardian);

    await recordAudit({
      orgId: user.org_id,
      campusId,
      actorUserId: user.sub,
      action: 'movement.requested',
      entityType: 'movement_request',
      entityId: row.id,
      after: row,
    });

    // Real gap, found live via SELF-TEST-GUIDE.md C7 — this wrote the row
    // and audit entry and notified nobody; staff only found out by manually
    // re-checking this page. Same fix applied in applications/transfers/
    // cases services.
    await notifyCampusStaff(db, user.org_id, campusId, {
      type: 'movement.requested',
      title: `New ${input.movementType.replace(/_/g, ' ')} request awaiting guardian confirmation and decision`,
      link: '/movement',
    });

    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('An active movement request already exists');
    throw err;
  }
}

export async function listMovements(user: AuthUser, filters: { status?: string }) {
  const studentId = (await canManageMovements(user)) ? undefined : user.sub;
  return repo.list({ status: filters.status, studentId });
}

export async function getMovement(user: AuthUser, id: string) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError('Movement request');
  if (row.student_id !== user.sub && !(await canManageMovements(user))) {
    throw new ForbiddenError('You can only view your own movement request');
  }
  const confirmations = await repo.listConfirmations(id);
  const extensions = await repo.listExtensions(id);
  return { ...row, confirmations, extensions };
}

// ============================================================================
// D17.10 item 90 — guardian confirmation itself (OTP entry / call fallback)
// ============================================================================

/** Warden-only — "only the Warden/Head Warden will enter the OTP on their
 * authenticated UOS application." The student tells the Warden the code
 * face to face; there is deliberately no student-facing "enter OTP" route
 * anywhere in this module (validators.ts's verifyOtpSchema is only ever
 * reached through a canManage-gated route — see route.ts). */
export async function verifyGuardianOtp(user: AuthUser, movementId: string, input: z.infer<typeof verifyOtpSchema>) {
  const movement = await repo.findById(movementId);
  if (!movement) throw new NotFoundError('Movement request');

  const confirmation = await repo.findLatestConfirmation(movementId, movement.request_version);
  if (!confirmation || confirmation.method !== 'otp') throw new ConflictError('No OTP confirmation is pending for this request');
  if (confirmation.status !== 'pending') throw new ConflictError(`This confirmation is already '${confirmation.status}'`);

  if (new Date(confirmation.otp_expires_at) < new Date()) {
    await repo.updateConfirmation(confirmation.id, { status: 'expired' });
    throw new ConflictError('This OTP has expired — resend a new one');
  }

  if (hashOtp(input.code) !== confirmation.otp_code_hash) {
    const attempts = confirmation.otp_attempt_count + 1;
    const exhausted = attempts >= confirmation.otp_max_attempts;
    await repo.updateConfirmation(confirmation.id, { otp_attempt_count: attempts, ...(exhausted && { status: 'failed' }) });
    throw new ConflictError(
      exhausted
        ? 'Incorrect code — maximum attempts reached. Resend a new OTP or use call confirmation instead.'
        : `Incorrect code — ${confirmation.otp_max_attempts - attempts} attempt(s) left`
    );
  }

  const after = await repo.updateConfirmation(confirmation.id, { status: 'verified', verified_by: user.sub, verified_at: db.fn.now() });

  await recordAudit({
    orgId: movement.org_id,
    campusId: movement.campus_id,
    actorUserId: user.sub,
    action: 'movement.guardian_otp_verified',
    entityType: 'movement_guardian_confirmation',
    entityId: confirmation.id,
    before: confirmation,
    after,
  });

  await onGuardianConfirmed(movement, after);
  return after;
}

/** Resends a fresh OTP for the current request version — invalidates
 * whatever was pending before it. Staff-only, same "must not be able to
 * enter it themselves" boundary as verifyGuardianOtp — this only ever
 * triggers a new simulated send, never reveals the code. */
export async function resendGuardianOtp(user: AuthUser, movementId: string) {
  const movement = await repo.findById(movementId);
  if (!movement) throw new NotFoundError('Movement request');
  if (!movement.guardian_id) throw new ConflictError('This request has no guardian on record');

  const guardian = await repo.findGuardianById(movement.guardian_id);
  if (!guardian) throw new NotFoundError('Guardian');

  const existing = await repo.findLatestConfirmation(movementId, movement.request_version);
  if (existing && existing.status === 'pending') {
    await repo.updateConfirmation(existing.id, { status: 'invalidated' });
  }

  const confirmation = await generateOtpConfirmation(movement.org_id, movement.campus_id, movementId, movement.request_version, guardian);
  await recordAudit({
    orgId: movement.org_id,
    campusId: movement.campus_id,
    actorUserId: user.sub,
    action: 'movement.guardian_otp_resent',
    entityType: 'movement_guardian_confirmation',
    entityId: confirmation.id,
    after: confirmation,
  });
  return confirmation;
}

/**
 * OTP failure fallback, per policy: "Warden/Head Warden Calls Verified
 * Guardian Number → Guardian Gives Verbal Confirmation → Warden Selects
 * 'Call Confirmed - Approve/Decline' → Mandatory Remark". Always a fresh
 * row (method='call'), never reusing/overwriting an OTP attempt — the
 * system must be able to show "whether approval came through Guardian OTP
 * or Guardian Call Confirmation" per the policy's own wording, which needs
 * the two kept genuinely distinct, not collapsed into one row with a
 * method flag flipped after the fact.
 */
export async function recordGuardianCallConfirmation(user: AuthUser, movementId: string, input: z.infer<typeof recordCallConfirmationSchema>) {
  const movement = await repo.findById(movementId);
  if (!movement) throw new NotFoundError('Movement request');

  const guardian = await repo.findGuardianById(input.guardianId);
  if (!guardian || guardian.student_id !== movement.student_id) {
    throw new ValidationError('That guardian is not registered for this resident.');
  }

  const confirmation = await repo.createConfirmation({
    org_id: movement.org_id,
    campus_id: movement.campus_id,
    movement_request_id: movementId,
    request_version: movement.request_version,
    method: 'call',
    call_outcome: input.outcome,
    call_remark: input.remark,
    call_guardian_id: guardian.id,
    // 'no_response' is neither a verified confirmation nor an active
    // decline — it's an inconclusive attempt, same bucket as an exhausted
    // OTP ('failed'): staff can try again (a fresh call, or resend the
    // OTP), same as any other failed attempt.
    status: input.outcome === 'approve' ? 'verified' : input.outcome === 'decline' ? 'declined' : 'failed',
    verified_by: user.sub,
    verified_at: db.fn.now(),
  });

  await recordAudit({
    orgId: movement.org_id,
    campusId: movement.campus_id,
    actorUserId: user.sub,
    action: 'movement.guardian_call_confirmation',
    entityType: 'movement_guardian_confirmation',
    entityId: confirmation.id,
    after: confirmation,
    reason: input.remark,
  });

  if (input.outcome === 'approve') await onGuardianConfirmed(movement, confirmation);
  return confirmation;
}

async function onGuardianConfirmed(movement: { org_id: string; campus_id: string; student_id: string; id: string }, confirmation: { id: string }) {
  await notify({
    orgId: movement.org_id,
    campusId: movement.campus_id,
    userId: movement.student_id,
    type: 'movement.guardian_confirmed',
    title: 'Your guardian confirmation was recorded — awaiting Warden decision',
    link: '/movement',
  });
  await notifyCampusStaff(db, movement.org_id, movement.campus_id, {
    type: 'movement.guardian_confirmed',
    title: 'Guardian confirmation recorded — ready for decision',
    link: '/movement',
  });
  void confirmation;
}

// ============================================================================
// Decide / cancel / exit / return
// ============================================================================

/** Second real consumer of §5A's delegation framework (after Transfer) —
 * a plain Warden deciding a routine gate pass/leave resolves NORMAL; Head
 * Warden resolves ESCALATED; anyone else needs an active delegation. D17.10
 * depth: now (a) requires the required role to vary by movement type, and
 * (b) blocks approval outright unless the guardian confirmation for the
 * CURRENT request version is 'verified' — the one exception being
 * emergency_leave with an explicit, audited bypass. */
export async function decideMovement(user: AuthUser, id: string, input: z.infer<typeof decideMovementSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (before.status !== 'requested') throw new ConflictError(`Cannot decide a movement request in status '${before.status}'`);

  const requiredRole = requiredRoleFor(before.movement_type);
  const resolution = await authorizeApproval(user, { requiredRole, campusId: before.campus_id, entityType: 'movement_request' });

  let bypassed = false;
  if (input.decision === 'approved') {
    const confirmation = await repo.findLatestConfirmation(id, before.request_version);
    const isConfirmed = confirmation?.status === 'verified';
    if (!isConfirmed) {
      // Policy: "Emergency leave may receive provisional approval through
      // authorised emergency authority, but guardian-contact follow-up must
      // remain pending and auditable" — the ONLY case this is allowed, and
      // only by whoever the type already requires (head_warden).
      if (before.movement_type !== 'emergency_leave' || !input.bypassGuardianConfirmation) {
        throw new ConflictError('Guardian confirmation (OTP or call) has not been verified for this request yet');
      }
      bypassed = true;
    }
  }

  const after = await repo.update(id, {
    status: input.decision,
    decision_reason: input.reason,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    ...(bypassed && { guardian_confirmation_bypassed: true, guardian_confirmation_bypass_reason: input.reason }),
  });

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'movement_request',
    entityId: id,
    requiredRole,
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `movement.${input.decision}`,
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  await notify({
    orgId: user.org_id,
    campusId: before.campus_id,
    userId: before.student_id,
    type: 'movement.decided',
    title: `Your ${before.movement_type.replace(/_/g, ' ')} request was ${input.decision}`,
    body: input.reason,
    link: '/movement',
  });

  if (bypassed) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'movement.guardian_confirmation_bypassed',
      title: 'Emergency leave approved without guardian confirmation — follow-up with guardian still owed',
      link: '/movement',
    });
  }

  // D17.16 (TODO.md Batch 30, item 123) §24.4 — an approved absence
  // window is one of the sources D18 would de-duplicate against its
  // expected-meal-count per §24.3.
  if (input.decision === 'approved') {
    await messKitchenRepo.recordOutboundEvent({
      org_id: user.org_id,
      campus_id: before.campus_id,
      student_id: before.student_id,
      event_type: 'd17.leave-approved.v1',
      payload: { movementRequestId: id, requestedOut: before.requested_out, requestedReturn: before.requested_return },
    });
  }

  return after;
}

export async function cancelMovement(user: AuthUser, id: string, input: z.infer<typeof cancelMovementSchema>) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (!['requested', 'approved'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a movement request in status '${before.status}'`);
  }
  if (before.student_id !== user.sub && !(await canManageMovements(user))) {
    throw new ForbiddenError('Only the requesting resident or staff can cancel this movement request');
  }

  const after = await repo.update(id, { status: 'cancelled', decision_reason: input.reason });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'movement.cancelled',
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });

  // D17.16 (TODO.md Batch 30, item 123) §24.4 — only meaningful if D17
  // already published this as an approved absence window (see
  // decideMovement's own 'd17.leave-approved.v1'); cancelling a merely
  // 'requested' one was never published in the first place.
  if (before.status === 'approved') {
    await messKitchenRepo.recordOutboundEvent({
      org_id: user.org_id,
      campus_id: before.campus_id,
      student_id: before.student_id,
      event_type: 'd17.leave-cancelled.v1',
      payload: { movementRequestId: id },
    });
  }

  // Real gap, found live via SELF-TEST-GUIDE.md C11 — cancelling silently
  // notified nobody, whichever side did it. If the resident cancels, staff
  // (who may already be tracking an approved pass) should know it's off;
  // if staff cancel on the resident's behalf, the resident needs telling.
  if (user.sub === before.student_id) {
    await notifyCampusStaff(db, user.org_id, before.campus_id, {
      type: 'movement.cancelled',
      title: 'A gate pass / leave request was cancelled by the resident',
      link: '/movement',
    });
  } else {
    await notify({
      orgId: user.org_id,
      campusId: before.campus_id,
      userId: before.student_id,
      type: 'movement.cancelled',
      title: 'Your gate pass / leave request was cancelled by staff',
      body: input.reason,
      link: '/movement',
    });
  }

  return after;
}

/**
 * D17.10 item 94 — the Gate console's own actions. Unchanged in shape from
 * before this batch (BR §8: "Gate records exit" — staff-recorded, no live
 * Gate integration exists yet) — what's new is the console screen that
 * calls these (see movements/route.ts's new /gate-queue endpoint and the
 * frontend's Gate tab), not the actions themselves. Deliberately still
 * gated by the existing 'movement:manage' permission rather than a new
 * "Security" role — see this file's own header comment on why introducing
 * a genuinely new platform role/persona is out of scope for this pass.
 */
export async function recordExit(user: AuthUser, id: string) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (before.status !== 'approved') throw new ConflictError(`Cannot record exit for a movement request in status '${before.status}'`);

  const after = await repo.update(id, { status: 'out', actual_exit_at: db.fn.now(), exit_recorded_by: user.sub });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'movement.exit_recorded',
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
  });

  // D17.16 (TODO.md Batch 30, item 123) §24.4 — a resident just left the
  // hostel, one input D17 supplies toward D18's own expected-meal-count.
  await messKitchenRepo.recordOutboundEvent({
    org_id: user.org_id,
    campus_id: before.campus_id,
    student_id: before.student_id,
    event_type: 'd17.outpass-departed.v1',
    payload: { movementRequestId: id },
  });

  return after;
}

/** BR §8: "Gate records entry; close leave" — also the resolution for
 * 'overdue' (a late return is still a return, just flagged in history via
 * the audit trail rather than a distinct terminal state). */
export async function recordReturn(user: AuthUser, id: string) {
  const before = await repo.findById(id);
  if (!before) throw new NotFoundError('Movement request');
  if (!['out', 'overdue'].includes(before.status)) {
    throw new ConflictError(`Cannot record return for a movement request in status '${before.status}'`);
  }

  const after = await repo.update(id, { status: 'returned', actual_return_at: db.fn.now(), return_recorded_by: user.sub });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'movement.return_recorded',
    entityType: 'movement_request',
    entityId: id,
    before,
    after,
  });

  // D17.16 (TODO.md Batch 30, item 123) §24.4.
  await messKitchenRepo.recordOutboundEvent({
    org_id: user.org_id,
    campus_id: before.campus_id,
    student_id: before.student_id,
    event_type: 'd17.outpass-returned.v1',
    payload: { movementRequestId: id },
  });

  return after;
}

export async function listGateQueue(user: AuthUser) {
  void user; // route already gates this behind canManage — no extra scoping needed here.
  return repo.listGateQueue();
}

// ============================================================================
// D17.10 item 93 — extension requests
// ============================================================================

/** Creates the extension AND its own fresh guardian-confirmation
 * requirement in one step — policy: "the extension request must create a
 * new outpass version and require the same Warden-assisted Guardian OTP
 * verification before it becomes valid." The ORIGINAL request row's own
 * `requested_return`/`effective_return` stay untouched until the extension
 * is actually approved (see decideExtension) — "the original outpass must
 * remain unchanged in the audit history." */
export async function requestExtension(user: AuthUser, movementId: string, input: z.infer<typeof requestExtensionSchema>) {
  const movement = await repo.findById(movementId);
  if (!movement) throw new NotFoundError('Movement request');
  if (!['out', 'overdue'].includes(movement.status)) {
    throw new ConflictError(`Cannot request an extension for a movement request in status '${movement.status}'`);
  }
  if (movement.student_id !== user.sub && !(await canManageMovements(user))) {
    throw new ForbiddenError('Only the resident or staff can request an extension');
  }
  const existingPending = await repo.findPendingExtension(movementId);
  if (existingPending) throw new ConflictError('An extension request is already pending for this movement');
  if (!movement.guardian_id) throw new ConflictError('This request has no guardian on record — cannot re-confirm an extension');

  const guardian = await repo.findGuardianById(movement.guardian_id);
  if (!guardian) throw new NotFoundError('Guardian');

  const newVersion = movement.request_version + 1;
  await repo.update(movementId, { request_version: newVersion });
  await repo.invalidatePendingConfirmations(movementId, newVersion);
  const confirmation = await generateOtpConfirmation(movement.org_id, movement.campus_id, movementId, newVersion, guardian);

  const extension = await repo.createExtension({
    org_id: movement.org_id,
    campus_id: movement.campus_id,
    movement_request_id: movementId,
    requested_new_return: new Date(input.requestedNewReturn),
    reason: input.reason,
    created_by: user.sub,
    guardian_confirmation_id: confirmation.id,
  });

  await recordAudit({
    orgId: movement.org_id,
    campusId: movement.campus_id,
    actorUserId: user.sub,
    action: 'movement.extension_requested',
    entityType: 'movement_extension_request',
    entityId: extension.id,
    after: extension,
  });
  await notifyCampusStaff(db, movement.org_id, movement.campus_id, {
    type: 'movement.extension_requested',
    title: 'An extension request needs a fresh guardian confirmation before it can be approved',
    link: '/movement',
  });

  return extension;
}

/**
 * Policy: "The Gate must recognise the extended validity only after the
 * extension is approved and the new guardian OTP is successfully verified."
 * Reuses the exact same confirmation-gate decideMovement already applies —
 * approval is refused outright unless that specific extension's own
 * confirmation is 'verified', never inherited from the original request's.
 */
export async function decideExtension(user: AuthUser, extensionId: string, input: z.infer<typeof decideExtensionSchema>) {
  const before = await repo.findExtensionById(extensionId);
  if (!before) throw new NotFoundError('Extension request');
  if (before.status !== 'pending') throw new ConflictError(`Cannot decide an extension in status '${before.status}'`);

  const movement = await repo.findById(before.movement_request_id);
  if (!movement) throw new NotFoundError('Movement request');

  const requiredRole = requiredRoleFor(movement.movement_type);
  const resolution = await authorizeApproval(user, { requiredRole, campusId: before.campus_id, entityType: 'movement_extension_request' });

  if (input.decision === 'approved') {
    const confirmation = before.guardian_confirmation_id ? await repo.findConfirmationById(before.guardian_confirmation_id) : null;
    if (confirmation?.status !== 'verified') {
      throw new ConflictError('Guardian confirmation for this extension has not been verified yet');
    }
  }

  const after = await repo.updateExtension(extensionId, {
    status: input.decision,
    decided_by: user.sub,
    decided_at: db.fn.now(),
    decision_reason: input.reason,
  });

  if (input.decision === 'approved') {
    // Policy: "If the extension is not approved before the original
    // expected return time, the original outpass must be treated as
    // overdue" — effective_return only ever moves forward on approval, so
    // an unapproved (or rejected) extension leaves the original deadline
    // exactly where jobs/flagOverdueMovements.ts already expects it.
    await repo.update(movement.id, { effective_return: before.requested_new_return });
  }

  await recordApprovalResolution({
    orgId: user.org_id,
    campusId: before.campus_id,
    entityType: 'movement_extension_request',
    entityId: extensionId,
    requiredRole,
    resolution,
    actualApproverUserId: user.sub,
    reason: input.reason,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: `movement.extension_${input.decision}`,
    entityType: 'movement_extension_request',
    entityId: extensionId,
    before,
    after,
    reason: input.reason,
  });
  await notify({
    orgId: movement.org_id,
    campusId: movement.campus_id,
    userId: movement.student_id,
    type: 'movement.extension_decided',
    title: `Your extension request was ${input.decision}`,
    body: input.reason,
    link: '/movement',
  });

  return after;
}

