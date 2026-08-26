import { db } from '../../db';

// --- Room entries (item 71) ------------------------------------------------

export function createEntry(data: Record<string, unknown>) {
  return db('room_entries').insert(data).returning('*').then((rows) => rows[0]);
}

export function findEntryById(id: string) {
  return db('room_entries').where({ id }).first();
}

export function updateEntry(id: string, data: Record<string, unknown>) {
  return db('room_entries')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listEntries(filters: { roomId?: string; status?: string }) {
  const query = db('room_entries').orderBy('created_at', 'desc');
  if (filters.roomId) query.andWhere({ room_id: filters.roomId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

// --- Master key log (item 72) ----------------------------------------------

export function createKeyLog(data: Record<string, unknown>) {
  return db('master_key_log').insert(data).returning('*').then((rows) => rows[0]);
}

export function findKeyLogById(id: string) {
  return db('master_key_log').where({ id }).first();
}

export function updateKeyLog(id: string, data: Record<string, unknown>) {
  return db('master_key_log')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listKeyLogs(filters: { status?: string; keyIdentifier?: string }) {
  const query = db('master_key_log').orderBy('issued_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.keyIdentifier) query.andWhere({ key_identifier: filters.keyIdentifier });
  return query;
}

export function findActiveIssueForKey(keyIdentifier: string) {
  return db('master_key_log').where({ key_identifier: keyIdentifier, status: 'issued' }).first();
}

/** Periodic-audit support (item 72's "periodic audit of frequency/unusual
 * use") — how many times a given key has been issued in a window. A full
 * anomaly-detection engine is out of scope; this is the raw count a human
 * auditor actually needs. */
export async function countIssuesInWindow(keyIdentifier: string, sinceDays: number): Promise<number> {
  const row = await db('master_key_log')
    .where({ key_identifier: keyIdentifier })
    .andWhere('issued_at', '>=', db.raw(`now() - interval '${sinceDays} days'`))
    .count<{ count: string }[]>('id as count')
    .first();
  return Number(row?.count ?? 0);
}

// --- Property custody (item 73) --------------------------------------------

export function createCustody(data: Record<string, unknown>) {
  return db('property_custody').insert(data).returning('*').then((rows) => rows[0]);
}

export function findCustodyById(id: string) {
  return db('property_custody').where({ id }).first();
}

export function updateCustody(id: string, data: Record<string, unknown>) {
  return db('property_custody')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listCustody(filters: { status?: string; studentId?: string }) {
  const query = db('property_custody').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

// --- Security evidence references (item 74) --------------------------------

export function createEvidenceReference(data: Record<string, unknown>) {
  return db('security_evidence_references').insert(data).returning('*').then((rows) => rows[0]);
}

export function findEvidenceReferenceById(id: string) {
  return db('security_evidence_references').where({ id }).first();
}

export function updateEvidenceReference(id: string, data: Record<string, unknown>) {
  return db('security_evidence_references')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listEvidenceReferences(filters: { linkedEntityType?: string; linkedEntityId?: string }) {
  const query = db('security_evidence_references').orderBy('created_at', 'desc');
  if (filters.linkedEntityType) query.andWhere({ linked_entity_type: filters.linkedEntityType });
  if (filters.linkedEntityId) query.andWhere({ linked_entity_id: filters.linkedEntityId });
  return query;
}
