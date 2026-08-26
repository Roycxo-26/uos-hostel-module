import type { AuthUser } from '@uos/auth';
import type { z } from 'zod';
import { db } from '../../db';
import { ConflictError, NotFoundError } from '../../middlewares/errorHandler';
import { recordAudit } from '../../utils/audit';
import { resolveCampusId } from '../../utils/campusScope';
import { notifyCampusStaff } from '../../utils/notify';
import * as repo from './repository';
import type {
  addNoticeAttemptSchema,
  approveEntrySchema,
  cancelEntrySchema,
  createEvidenceReferenceSchema,
  disposeCustodySchema,
  issueKeySchema,
  recordCustodySchema,
  recordEntrySchema,
  recordExitSchema,
  releaseCustodySchema,
  reportKeyLostSchema,
  requestEntrySchema,
  transferCustodyToSecuritySchema,
  updateLegalHoldSchema,
} from './validators';

async function findRoomCampus(roomId: string): Promise<{ campus_id: string }> {
  const row = await db('rooms').where({ id: roomId }).first('campus_id');
  if (!row) throw new NotFoundError('Room');
  return row;
}

// ============================================================================
// D17.20 item 71 — governed room entry. LAW-31: "every non-routine entry
// into an occupied room requires an approved purpose, authority, timing,
// notification/consent rule where applicable, minimum necessary personnel,
// entry/exit evidence and emergency-bypass controls." Every one of those
// is a real field on this table, not a comment describing intent.
// ============================================================================

export async function requestEntry(user: AuthUser, input: z.infer<typeof requestEntrySchema>) {
  const room = await findRoomCampus(input.roomId);
  const isEmergency = input.purpose === 'emergency';

  if (isEmergency && !input.emergencyBypassReason) {
    throw new ConflictError('An emergency entry requires emergencyBypassReason');
  }
  if (!isEmergency && (!input.plannedWindowStart || !input.plannedWindowEnd)) {
    throw new ConflictError('A non-emergency entry requires a planned window (plannedWindowStart/plannedWindowEnd)');
  }

  const entry = await repo.createEntry({
    org_id: user.org_id,
    campus_id: room.campus_id,
    room_id: input.roomId,
    purpose: input.purpose,
    // LAW-15/LAW-31 — an emergency skips the approval step entirely and is
    // immediately actionable; a break-glass action with immediate audit,
    // not a request waiting in a queue while something urgent is
    // happening. Ordinary entries still need a real approveEntry call.
    status: isEmergency ? 'approved' : 'requested',
    requested_by: user.sub,
    approved_by: isEmergency ? user.sub : null,
    notice_given: input.noticeGiven,
    emergency_bypass_reason: input.emergencyBypassReason ?? null,
    witness_user_id: input.witnessUserId ?? null,
    planned_window_start: input.plannedWindowStart ?? null,
    planned_window_end: input.plannedWindowEnd ?? null,
    work_reference: input.workReference ?? null,
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: room.campus_id,
    actorUserId: user.sub,
    action: isEmergency ? 'room_entry.emergency_requested' : 'room_entry.requested',
    entityType: 'room_entry',
    entityId: entry.id,
    after: entry,
  });

  if (isEmergency) {
    await notifyCampusStaff(db, user.org_id, room.campus_id, {
      type: 'room_entry.emergency',
      title: `Emergency room entry authorised — bypass reason: ${input.emergencyBypassReason}`,
      link: '/structure',
    });
  }

  return entry;
}

const APPROVABLE_FROM = new Set(['requested']);

export async function approveEntry(user: AuthUser, entryId: string, input: z.infer<typeof approveEntrySchema>) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Room entry request');
  if (!APPROVABLE_FROM.has(before.status)) throw new ConflictError(`Cannot approve a room entry in status '${before.status}'`);

  const after = await repo.updateEntry(entryId, {
    status: 'approved',
    approved_by: user.sub,
    consent_given: input.consentGiven ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'room_entry.approved',
    entityType: 'room_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}

export async function markNotified(user: AuthUser, entryId: string) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Room entry request');
  if (before.status !== 'approved') throw new ConflictError(`Cannot mark notified from status '${before.status}'`);

  const after = await repo.updateEntry(entryId, { status: 'notified', notice_given: true });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'room_entry.notified',
    entityType: 'room_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}

const ENTERABLE_FROM = new Set(['approved', 'notified']);

export async function recordEntry(user: AuthUser, entryId: string, input: z.infer<typeof recordEntrySchema>) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Room entry request');
  if (!ENTERABLE_FROM.has(before.status)) throw new ConflictError(`Cannot record entry from status '${before.status}'`);

  const after = await repo.updateEntry(entryId, {
    status: 'entered',
    entered_by: input.enteredBy ?? user.sub,
    entry_at: db.fn.now(),
    ...(input.evidenceNotes !== undefined && { evidence_notes: input.evidenceNotes }),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'room_entry.entered',
    entityType: 'room_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}

export async function recordExit(user: AuthUser, entryId: string, input: z.infer<typeof recordExitSchema>) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Room entry request');
  if (before.status !== 'entered') throw new ConflictError(`Cannot record exit from status '${before.status}'`);

  const after = await repo.updateEntry(entryId, {
    status: 'completed',
    exit_at: db.fn.now(),
    ...(input.evidenceNotes !== undefined && { evidence_notes: input.evidenceNotes }),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'room_entry.completed',
    entityType: 'room_entry',
    entityId: entryId,
    before,
    after,
  });
  return after;
}

export async function cancelEntry(user: AuthUser, entryId: string, input: z.infer<typeof cancelEntrySchema>) {
  const before = await repo.findEntryById(entryId);
  if (!before) throw new NotFoundError('Room entry request');
  if (!['requested', 'approved', 'notified'].includes(before.status)) {
    throw new ConflictError(`Cannot cancel a room entry in status '${before.status}'`);
  }

  const after = await repo.updateEntry(entryId, { status: 'cancelled' });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'room_entry.cancelled',
    entityType: 'room_entry',
    entityId: entryId,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function getEntry(id: string) {
  const entry = await repo.findEntryById(id);
  if (!entry) throw new NotFoundError('Room entry request');
  return entry;
}

export async function listEntries(filters: { roomId?: string; status?: string }) {
  return repo.listEntries(filters);
}

// ============================================================================
// D17.20 item 72 — master-key governance. One row per use (not a standing
// "who currently has key X" pointer), so a periodic audit sees the whole
// pattern, not just the latest snapshot.
// ============================================================================

export async function issueKey(user: AuthUser, input: z.infer<typeof issueKeySchema>) {
  const existing = await repo.findActiveIssueForKey(input.keyIdentifier);
  if (existing) throw new ConflictError(`Key '${input.keyIdentifier}' is already issued and not yet returned`);

  const scopeTable = { room: 'rooms', floor: 'floors', block: 'blocks', hostel: 'hostels' }[input.scopeType];
  const scope = await db(scopeTable).where({ id: input.scopeId }).first('campus_id');
  if (!scope) throw new NotFoundError('Scope');

  const row = await repo.createKeyLog({
    org_id: user.org_id,
    campus_id: scope.campus_id,
    key_identifier: input.keyIdentifier,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    room_entry_id: input.roomEntryId ?? null,
    issued_to: input.issuedTo,
    issued_by: user.sub,
    purpose: input.purpose ?? null,
    expected_return_at: input.expectedReturnAt,
    status: 'issued',
  });

  await recordAudit({
    orgId: user.org_id,
    campusId: scope.campus_id,
    actorUserId: user.sub,
    action: 'master_key.issued',
    entityType: 'master_key_log',
    entityId: row.id,
    after: row,
  });

  return row;
}

export async function returnKey(user: AuthUser, id: string) {
  const before = await repo.findKeyLogById(id);
  if (!before) throw new NotFoundError('Master key log entry');
  if (!['issued', 'overdue'].includes(before.status)) throw new ConflictError(`Cannot return a key in status '${before.status}'`);

  const after = await repo.updateKeyLog(id, { status: 'returned', returned_at: db.fn.now() });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'master_key.returned',
    entityType: 'master_key_log',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function reportKeyLost(user: AuthUser, id: string, input: z.infer<typeof reportKeyLostSchema>) {
  const before = await repo.findKeyLogById(id);
  if (!before) throw new NotFoundError('Master key log entry');
  if (!['issued', 'overdue'].includes(before.status)) throw new ConflictError(`Cannot report a key lost from status '${before.status}'`);

  const after = await repo.updateKeyLog(id, { status: 'lost', lost_reason: input.reason });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'master_key.lost',
    entityType: 'master_key_log',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  await notifyCampusStaff(db, user.org_id, before.campus_id, {
    type: 'master_key.lost',
    title: `Master key '${before.key_identifier}' reported lost — ${input.reason}`,
    link: '/structure',
  });
  return after;
}

export async function listKeyLogs(filters: { status?: string; keyIdentifier?: string }) {
  return repo.listKeyLogs(filters);
}

/** Item 72's "periodic audit of frequency/unusual use" — the raw count a
 * human auditor needs, not an automatic anomaly verdict this codebase has
 * no basis to make up. */
export async function auditKeyFrequency(keyIdentifier: string, sinceDays = 30) {
  const count = await repo.countIssuesInWindow(keyIdentifier, sinceDays);
  return { keyIdentifier, sinceDays, issueCount: count };
}

// ============================================================================
// D17.20 item 73 — resident property / lost-and-found custody chain.
// ============================================================================

export async function recordCustody(user: AuthUser, input: z.infer<typeof recordCustodySchema>) {
  const campusId = resolveCampusId(user);
  const row = await repo.createCustody({
    org_id: user.org_id,
    campus_id: campusId,
    custody_type: input.custodyType,
    item_description: input.itemDescription,
    student_id: input.studentId ?? null,
    found_location: input.foundLocation ?? null,
    found_at: db.fn.now(),
    collected_by: user.sub,
    witness_user_id: input.witnessUserId ?? null,
    condition_notes: input.conditionNotes ?? null,
    storage_location: input.storageLocation ?? null,
    status: 'in_custody',
    retention_until: input.retentionUntil ?? null,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'property_custody.recorded',
    entityType: 'property_custody',
    entityId: row.id,
    after: row,
  });
  return row;
}

export async function addNoticeAttempt(user: AuthUser, id: string, input: z.infer<typeof addNoticeAttemptSchema>) {
  const before = await repo.findCustodyById(id);
  if (!before) throw new NotFoundError('Property custody record');

  const stamp = new Date().toISOString();
  const combined = before.notice_notes ? `${before.notice_notes}\n[${stamp}] ${input.note}` : `[${stamp}] ${input.note}`;
  const after = await repo.updateCustody(id, { notice_notes: combined });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'property_custody.notice_attempt',
    entityType: 'property_custody',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function releaseCustody(user: AuthUser, id: string, input: z.infer<typeof releaseCustodySchema>) {
  const before = await repo.findCustodyById(id);
  if (!before) throw new NotFoundError('Property custody record');
  if (before.status !== 'in_custody') throw new ConflictError(`Cannot release a record in status '${before.status}'`);

  const after = await repo.updateCustody(id, {
    status: input.claimantUserId ? 'claimed' : 'released',
    claimant_user_id: input.claimantUserId ?? null,
    released_to: input.releasedTo,
    released_at: db.fn.now(),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'property_custody.released',
    entityType: 'property_custody',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function transferCustodyToSecurity(user: AuthUser, id: string, input: z.infer<typeof transferCustodyToSecuritySchema>) {
  const before = await repo.findCustodyById(id);
  if (!before) throw new NotFoundError('Property custody record');
  if (before.status !== 'in_custody') throw new ConflictError(`Cannot transfer a record in status '${before.status}'`);

  const after = await repo.updateCustody(id, {
    status: 'transferred_to_security',
    released_at: db.fn.now(),
    released_to: 'Security',
    ...(input.notes !== undefined && { condition_notes: input.notes }),
  });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'property_custody.transferred_to_security',
    entityType: 'property_custody',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function disposeCustody(user: AuthUser, id: string, input: z.infer<typeof disposeCustodySchema>) {
  const before = await repo.findCustodyById(id);
  if (!before) throw new NotFoundError('Property custody record');
  if (before.status !== 'in_custody') throw new ConflictError(`Cannot dispose a record in status '${before.status}'`);

  const after = await repo.updateCustody(id, { status: 'disposed', disposal_reason: input.reason, released_at: db.fn.now() });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'property_custody.disposed',
    entityType: 'property_custody',
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
  return after;
}

export async function listCustody(filters: { status?: string; studentId?: string }) {
  return repo.listCustody(filters);
}

// ============================================================================
// D17.20 item 74 — CCTV/security-evidence reference boundary. Deliberately
// no field anywhere in this schema (or this validator) that could hold
// footage, a file, or a blob — the boundary is enforced by what the table
// and the Zod schema simply don't have a column/field for, not by a
// runtime check that could be bypassed. Ordinary Hostel permissions never
// grant access to the footage itself, only to this reference.
// ============================================================================

export async function createEvidenceReference(user: AuthUser, input: z.infer<typeof createEvidenceReferenceSchema>) {
  const campusId = resolveCampusId(user);
  const row = await repo.createEvidenceReference({
    org_id: user.org_id,
    campus_id: campusId,
    reference_id: input.referenceId,
    time_range_start: input.timeRangeStart ?? null,
    time_range_end: input.timeRangeEnd ?? null,
    case_reference: input.caseReference ?? null,
    linked_entity_type: input.linkedEntityType ?? null,
    linked_entity_id: input.linkedEntityId ?? null,
    notes: input.notes ?? null,
    created_by: user.sub,
  });
  await recordAudit({
    orgId: user.org_id,
    campusId,
    actorUserId: user.sub,
    action: 'security_evidence_reference.created',
    entityType: 'security_evidence_reference',
    entityId: row.id,
    after: row,
  });
  return row;
}

export async function updateLegalHold(user: AuthUser, id: string, input: z.infer<typeof updateLegalHoldSchema>) {
  const before = await repo.findEvidenceReferenceById(id);
  if (!before) throw new NotFoundError('Security evidence reference');

  const after = await repo.updateEvidenceReference(id, { legal_hold_status: input.legalHoldStatus });
  await recordAudit({
    orgId: user.org_id,
    campusId: before.campus_id,
    actorUserId: user.sub,
    action: 'security_evidence_reference.legal_hold_updated',
    entityType: 'security_evidence_reference',
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function listEvidenceReferences(filters: { linkedEntityType?: string; linkedEntityId?: string }) {
  return repo.listEvidenceReferences(filters);
}
