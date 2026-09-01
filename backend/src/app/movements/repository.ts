import { db } from '../../db';

export function findById(id: string) {
  return db('movement_requests').where({ id }).first();
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('movement_requests').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

export function findActiveForStudent(studentId: string) {
  return db('movement_requests').where({ student_id: studentId }).whereIn('status', ['requested', 'approved', 'out', 'overdue']).first();
}

export function create(data: Record<string, unknown>) {
  return db('movement_requests')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('movement_requests')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** BR §8's own reconciliation input, and Headcount's "approved_out" hint —
 * a resident currently physically out on an approved, unreturned movement. */
export function findCurrentlyOut(studentId: string) {
  return db('movement_requests').where({ student_id: studentId }).whereIn('status', ['out', 'overdue']).first();
}

// --- D17.10 item 94 — Gate console -----------------------------------------

/** Minimal-disclosure queue: approved-but-not-out, or out-and-not-yet-
 * returned. Deliberately the same table/query shape as list() above, not a
 * separate view — the "minimal disclosure" the policy asks for is a
 * frontend concern (which fields the Gate screen chooses to show), not a
 * different backend query. */
export function listGateQueue() {
  return db('movement_requests').whereIn('status', ['approved', 'out', 'overdue']).orderBy('requested_out');
}

// --- D17.10 item 90 — guardian contacts -------------------------------------

export function createGuardian(data: Record<string, unknown>) {
  return db('resident_guardians').insert(data).returning('*').then((rows) => rows[0]);
}

export function findGuardianById(id: string) {
  return db('resident_guardians').where({ id }).first();
}

export function listGuardiansForStudent(studentId: string) {
  return db('resident_guardians').where({ student_id: studentId }).orderBy('is_primary', 'desc');
}

export function updateGuardian(id: string, data: Record<string, unknown>) {
  return db('resident_guardians')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** Clears every other guardian's primary flag for this student before a new
 * one is set — a plain UPDATE rather than a partial unique index, since
 * "at most one primary, but zero is fine too" needs an application-level
 * invariant either way (a unique index on (student_id) WHERE is_primary
 * would still need this same clear-then-set step to change which one is
 * primary, so it buys nothing extra here). */
export function clearPrimaryGuardians(studentId: string) {
  return db('resident_guardians').where({ student_id: studentId, is_primary: true }).update({ is_primary: false, updated_at: db.fn.now() });
}

// --- D17.10 item 90 — guardian confirmations --------------------------------

export function createConfirmation(data: Record<string, unknown>) {
  return db('movement_guardian_confirmations').insert(data).returning('*').then((rows) => rows[0]);
}

export function findConfirmationById(id: string) {
  return db('movement_guardian_confirmations').where({ id }).first();
}

/** The confirmation that actually governs the CURRENT version of a
 * request — never an older, invalidated one. */
export function findLatestConfirmation(movementRequestId: string, requestVersion: number) {
  return db('movement_guardian_confirmations')
    .where({ movement_request_id: movementRequestId, request_version: requestVersion })
    .orderBy('created_at', 'desc')
    .first();
}

export function listConfirmations(movementRequestId: string) {
  return db('movement_guardian_confirmations').where({ movement_request_id: movementRequestId }).orderBy('created_at');
}

export function updateConfirmation(id: string, data: Record<string, unknown>) {
  return db('movement_guardian_confirmations')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** Invalidates every still-pending confirmation at an OLD version once a
 * request moves to a new one (item 93's extension flow) — an old OTP must
 * never be usable to confirm a changed return time. */
export function invalidatePendingConfirmations(movementRequestId: string, belowVersion: number) {
  return db('movement_guardian_confirmations')
    .where({ movement_request_id: movementRequestId, status: 'pending' })
    .andWhere('request_version', '<', belowVersion)
    .update({ status: 'invalidated', updated_at: db.fn.now() });
}

// --- D17.10 item 93 — extension requests ------------------------------------

export function createExtension(data: Record<string, unknown>) {
  return db('movement_extension_requests').insert(data).returning('*').then((rows) => rows[0]);
}

export function findExtensionById(id: string) {
  return db('movement_extension_requests').where({ id }).first();
}

export function listExtensions(movementRequestId: string) {
  return db('movement_extension_requests').where({ movement_request_id: movementRequestId }).orderBy('created_at', 'desc');
}

export function findPendingExtension(movementRequestId: string) {
  return db('movement_extension_requests').where({ movement_request_id: movementRequestId, status: 'pending' }).first();
}

export function updateExtension(id: string, data: Record<string, unknown>) {
  return db('movement_extension_requests')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
