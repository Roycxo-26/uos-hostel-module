import { hasOrgRole, hasPermission, getPermissions, isSuperAdmin, type AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { MODULE } from '../../constants';
import { db } from '../../db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/errorHandler';
import { redis } from '../../redis';
import { recordAudit } from '../../utils/audit';
import * as responsibilityRepo from '../responsibilities/repository';
import * as movementRepo from '../movements/repository';
import * as repo from './repository';
import type { markEntrySchema, openSessionSchema } from './validators';

/**
 * flow.md §5.2's rule, applied for the first time to a real workflow:
 * "if active [responsibility assignment] exists for this user+scope+date,"
 * never "if role == X." Staff (Warden/Head Warden/platform admin) can
 * always act; a plain resident needs an ACTIVE room_head/floor_incharge
 * assignment for THIS EXACT scope — holding it for a different room does
 * not grant authority here. Hostel-wide sessions are staff-only: BR §2 has
 * no "Hostel Head" responsibility type to fall back to.
 *
 * UAT.md Batch 10 gap-closure: this used to have no substitute/fallback
 * path if the assigned Room Head/Floor In-charge was unavailable — every
 * other decision point in this codebase resolves through flow.md §5A's
 * delegation framework, this one didn't. It now checks the same
 * `responsibility_assignments.substitute_user_id` column
 * (responsibilities/service.ts's setSubstitute), the scoped-responsibility
 * equivalent of an active delegation: an active substitute can act for this
 * exact scope exactly like the primary assignee, no proof of the primary's
 * actual unavailability required — same as an approver_delegations-based
 * delegate elsewhere in this codebase.
 */
async function canActOnScope(user: AuthUser, scopeType: 'room' | 'floor' | 'hostel', scopeId: string): Promise<boolean> {
  if (isSuperAdmin(user) || hasOrgRole(user, ['org_admin'])) return true;
  const perms = await getPermissions({ user, module: MODULE, redis });
  if (hasPermission(perms, 'headcount:manage')) return true;
  if (scopeType === 'hostel') return false;
  const privilegeType = scopeType === 'room' ? 'room_head' : 'floor_incharge';
  if (await responsibilityRepo.hasActive(user.sub, privilegeType, scopeType, scopeId)) return true;
  return Boolean(await responsibilityRepo.hasActiveAsSubstitute(user.sub, privilegeType, scopeType, scopeId));
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

export async function openSession(user: AuthUser, input: z.infer<typeof openSessionSchema>) {
  if (!(await canActOnScope(user, input.scopeType, input.scopeId))) {
    throw new ForbiddenError(`No active ${input.scopeType === 'room' ? 'Room Head' : 'Floor In-charge'} assignment for this scope, and not staff`);
  }
  const scope = await validateScope(input.scopeType, input.scopeId);
  const sessionDate = input.sessionDate ?? todayDateString();

  const existing = await repo.findSessionForScopeAndDate(input.scopeType, input.scopeId, sessionDate);
  if (existing) throw new ConflictError(`A headcount session already exists for this scope on ${sessionDate} (status: ${existing.status})`);

  const session = await repo.createSession({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    session_date: sessionDate,
    status: 'open',
    opened_by: user.sub,
  });

  // BR §8: "Present / approved out / missing / unknown" — prefilled from
  // current occupancy + movement_requests, not left for the marker to
  // discover from scratch. Sequential inserts, not a batch: one resident's
  // row failing (shouldn't happen — both FKs are already-validated) must
  // never silently drop every other resident's roster entry behind it,
  // same reasoning as registry.ts's onUserSync loop.
  const residents = await repo.residentsInScope(input.scopeType, input.scopeId);
  for (const resident of residents) {
    const currentlyOut = await movementRepo.findCurrentlyOut(resident.student_id);
    await repo.createEntry({
      org_id: user.org_id,
      campus_id: scope.campus_id,
      session_id: session.id,
      student_id: resident.student_id,
      status: currentlyOut ? 'approved_out' : 'unknown',
    });
  }

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'headcount.session_opened',
    entityType: 'headcount_session',
    entityId: session.id,
    after: { session, residentCount: residents.length },
  });

  return session;
}

export async function listSessions(filters: { scopeType?: string; scopeId?: string; status?: string }) {
  return repo.listSessions(filters);
}

export async function getSession(id: string) {
  const session = await repo.findSessionById(id);
  if (!session) throw new NotFoundError('Headcount session');
  const entries = await repo.listEntries(id);
  return { ...session, entries };
}

export async function markEntry(user: AuthUser, sessionId: string, input: z.infer<typeof markEntrySchema>) {
  const session = await repo.findSessionById(sessionId);
  if (!session) throw new NotFoundError('Headcount session');
  if (session.status !== 'open') throw new ConflictError(`Cannot mark an entry on a '${session.status}' session`);
  if (!(await canActOnScope(user, session.scope_type, session.scope_id))) {
    throw new ForbiddenError('No active responsibility assignment for this scope, and not staff');
  }

  const before = await db('headcount_entries').where({ session_id: sessionId, student_id: input.studentId }).first();
  if (!before) {
    throw new NotFoundError('Roster entry for this resident — they may have checked in after the session opened; re-open a new session to include them');
  }

  // BR §8: "Resident on leave but marked missing -> System detects
  // conflict, prompts correction" — the inverse case too: don't let a
  // marker silently overwrite a system-computed 'approved_out' with
  // 'missing' without at least a note explaining the contradiction.
  if (before.status === 'approved_out' && input.status === 'missing' && !input.note) {
    throw new ConflictError("This resident has an approved, active movement request — a note is required to mark them 'missing' anyway");
  }

  const after = await repo.updateEntry(sessionId, input.studentId, {
    status: input.status,
    note: input.note ?? null,
    recorded_by: user.sub,
    recorded_at: db.fn.now(),
  });

  await recordAudit({
    orgId: session.org_id,
    campusId: session.campus_id,
    actorUserId: user.sub,
    action: 'headcount.entry_marked',
    entityType: 'headcount_entry',
    entityId: after.id,
    before,
    after,
  });

  return after;
}

export async function closeSession(user: AuthUser, sessionId: string) {
  const session = await repo.findSessionById(sessionId);
  if (!session) throw new NotFoundError('Headcount session');
  if (session.status !== 'open') throw new ConflictError(`Session is already '${session.status}'`);
  if (!(await canActOnScope(user, session.scope_type, session.scope_id))) {
    throw new ForbiddenError('No active responsibility assignment for this scope, and not staff');
  }

  const after = await repo.updateSession(sessionId, { status: 'closed', closed_by: user.sub, closed_at: db.fn.now() });

  await recordAudit({
    orgId: session.org_id,
    campusId: session.campus_id,
    actorUserId: user.sub,
    action: 'headcount.session_closed',
    entityType: 'headcount_session',
    entityId: sessionId,
    before: session,
    after,
  });

  return after;
}

export function listOpenIssues() {
  return repo.listOpenIssues();
}
