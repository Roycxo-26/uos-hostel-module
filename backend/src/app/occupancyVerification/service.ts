import { getPermissions, hasOrgRole, hasPermission, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import { notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import { MISMATCH_ANOMALY_TYPES } from './types';
import type { closeSessionSchema, markEntrySchema, openSessionSchema } from './validators';

async function canManage(user: AuthUser): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  return hasPermission(perms, 'occupancy_verification:manage');
}

async function validateScope(scopeType: 'room' | 'floor' | 'hostel', scopeId: string): Promise<{ campus_id: string }> {
  const table = scopeType === 'room' ? 'rooms' : scopeType === 'floor' ? 'floors' : 'hostels';
  const row = await db(table).where({ id: scopeId }).first('campus_id');
  if (!row) throw new NotFoundError(scopeType === 'room' ? 'Room' : scopeType === 'floor' ? 'Floor' : 'Hostel');
  return row;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Opens a session and freezes the expected-occupancy snapshot at that
 * moment (item 68) — same "prefill, then mark" shape Headcount and the
 * Safety-drill lifecycle already use, so staff walking a floor see a
 * ready-made checklist instead of a blank form.
 */
export async function openSession(user: AuthUser, input: z.infer<typeof openSessionSchema>) {
  if (!(await canManage(user))) throw new ConflictError('Not authorised to open an occupancy verification session');
  const scope = await validateScope(input.scopeType, input.scopeId);
  const sessionDate = input.sessionDate ?? todayDateString();

  const session = await repo.createSession({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    verification_type: input.verificationType,
    session_date: sessionDate,
    status: 'open',
    notes: input.notes ?? null,
    opened_by: user.sub,
  });

  const occupants = await repo.expectedOccupantsInScope(input.scopeType, input.scopeId);
  for (const occupant of occupants) {
    await repo.createEntry({
      org_id: user.org_id,
      campus_id: scope.campus_id,
      session_id: session.id,
      student_id: occupant.student_id,
      expected_bed_id: occupant.bed_id,
      presence_status: 'not_observed',
      anomaly_type: 'EXPECTED_AND_CONFIRMED',
      correction_status: 'none',
    });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'occupancy_verification.session_opened',
    entityType: 'occupancy_verification_session',
    entityId: session.id,
    after: { session, occupantCount: occupants.length },
  });

  return session;
}

export async function getSession(id: string) {
  const session = await repo.findSessionById(id);
  if (!session) throw new NotFoundError('Occupancy verification session');
  const entries = await repo.listEntries(id);
  return { ...session, entries };
}

export async function listSessions(filters: { status?: string; scopeType?: string; scopeId?: string }) {
  return repo.listSessions(filters);
}

/**
 * Marking an entry with a real mismatch (item 69's anomaly types) runs
 * item 70's auto-check: is there already an approved transfer/leave/
 * temporary-relocation record that explains it? If so, this is a data-
 * sync lag, not a real anomaly — flagged as explained, not escalated. If
 * not, staff are notified and correction_status becomes 'needs_correction'.
 * Neither path ever writes to allocations/beds directly — see this
 * module's own top-level comment on why.
 */
export async function markEntry(user: AuthUser, sessionId: string, input: z.infer<typeof markEntrySchema>) {
  if (!(await canManage(user))) throw new ConflictError('Not authorised to record occupancy verification results');
  const session = await repo.findSessionById(sessionId);
  if (!session) throw new NotFoundError('Occupancy verification session');
  if (session.status !== 'open') throw new ConflictError(`Cannot mark an entry on a '${session.status}' session`);

  const before = await repo.findEntryById(input.entryId);
  if (!before || before.session_id !== sessionId) throw new NotFoundError('Verification entry');

  let correctionStatus: string = 'none';
  if (MISMATCH_ANOMALY_TYPES.has(input.anomalyType)) {
    const explanation = before.student_id ? await repo.findExplainingRecord(before.student_id) : null;
    correctionStatus = explanation ? 'explained_by_existing_record' : 'needs_correction';
  }

  const after = await repo.updateEntry(input.entryId, {
    presence_status: input.presenceStatus,
    observed_bed_id: input.observedBedId ?? null,
    identity_verification_method: input.identityVerificationMethod ?? null,
    anomaly_type: input.anomalyType,
    unauthorised_person_note: input.unauthorisedPersonNote ?? null,
    evidence_notes: input.evidenceNotes ?? null,
    correction_status: correctionStatus,
    recorded_by: user.sub,
    recorded_at: db.fn.now(),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: session.campus_id,
    actorUserId: user.sub,
    action: 'occupancy_verification.entry_marked',
    entityType: 'occupancy_verification_entry',
    entityId: after.id,
    before,
    after,
  });

  if (correctionStatus === 'needs_correction') {
    await notifyCampusStaff(db, user.org_id, session.campus_id, {
      type: 'occupancy_verification.mismatch_found',
      title: `Unexplained occupancy mismatch found: ${input.anomalyType.replace(/_/g, ' ').toLowerCase()} — open a transfer/correction to resolve`,
      link: '/allocations',
    });
  }

  return after;
}

export async function closeSession(user: AuthUser, sessionId: string, input: z.infer<typeof closeSessionSchema>) {
  if (!(await canManage(user))) throw new ConflictError('Not authorised to close an occupancy verification session');
  const before = await repo.findSessionById(sessionId);
  if (!before) throw new NotFoundError('Occupancy verification session');
  if (before.status !== 'open') throw new ConflictError(`Session is already '${before.status}'`);

  const after = await repo.updateSession(sessionId, {
    status: 'closed',
    notes: input.notes ?? before.notes,
    closed_by: user.sub,
    closed_at: db.fn.now(),
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'occupancy_verification.session_closed',
    entityType: 'occupancy_verification_session',
    entityId: sessionId,
    before,
    after,
  });

  return after;
}

/** The reconciliation queue — every unresolved mismatch across every
 * session, closed or still open, same "surface what still needs a human"
 * shape as Headcount's own reconciliation queue. */
export async function listUnresolvedMismatches() {
  return db('occupancy_verification_entries')
    .join('occupancy_verification_sessions', 'occupancy_verification_sessions.id', 'occupancy_verification_entries.session_id')
    .where('occupancy_verification_entries.correction_status', 'needs_correction')
    .select(
      'occupancy_verification_entries.id',
      'occupancy_verification_entries.student_id',
      'occupancy_verification_entries.anomaly_type',
      'occupancy_verification_entries.evidence_notes',
      'occupancy_verification_sessions.id as session_id',
      'occupancy_verification_sessions.scope_type',
      'occupancy_verification_sessions.scope_id',
      'occupancy_verification_sessions.session_date'
    )
    .orderBy('occupancy_verification_sessions.session_date', 'desc');
}

/**
 * Staff acknowledge a mismatch has been referred to a real transfer
 * request they've created separately through the existing D17.07 flow —
 * this only updates the flag on this entry, it never touches
 * allocations/beds itself. That's the whole point of item 70's own
 * scoping: verification finds and flags, Transfer fixes.
 */
export async function markReferredToTransfer(user: AuthUser, entryId: string) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Verification entry');
  if (before.correction_status !== 'needs_correction') {
    throw new ConflictError(`Cannot refer an entry with correction status '${before.correction_status}'`);
  }

  const after = await repo.updateEntry(entryId, { correction_status: 'referred_to_transfer', follow_up_owner: user.sub });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'occupancy_verification.referred_to_transfer',
    entityType: 'occupancy_verification_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}
