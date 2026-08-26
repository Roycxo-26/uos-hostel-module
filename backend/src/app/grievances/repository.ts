import { db } from '../../db';

// --- Grievances (item 79) -------------------------------------------------

export function createGrievance(data: Record<string, unknown>) {
  return db('grievances').insert(data).returning('*').then((rows) => rows[0]);
}

export function findGrievanceById(id: string) {
  return db('grievances').where({ id }).first();
}

export function updateGrievance(id: string, data: Record<string, unknown>) {
  return db('grievances')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listGrievances(filters: { status?: string; raisedBy?: string }) {
  const query = db('grievances').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.raisedBy) query.andWhere({ raised_by: filters.raisedBy });
  return query;
}

// --- Policy versions & acknowledgements (item 81) -------------------------

export function createPolicyVersion(data: Record<string, unknown>) {
  return db('policy_versions').insert(data).returning('*').then((rows) => rows[0]);
}

export function findPolicyVersionById(id: string) {
  return db('policy_versions').where({ id }).first();
}

export function listPolicyVersions(documentKey?: string) {
  const query = db('policy_versions').orderBy('published_at', 'desc');
  if (documentKey) query.andWhere({ document_key: documentKey });
  return query;
}

/** The latest published version per document — what a resident actually
 * needs to have acknowledged right now, not every historical version. */
export function listLatestPolicyVersions() {
  return db('policy_versions as pv')
    .whereNotExists(function () {
      this.select('*')
        .from('policy_versions as pv2')
        .whereRaw('pv2.document_key = pv.document_key')
        .andWhereRaw('pv2.published_at > pv.published_at');
    })
    .orderBy('title');
}

export function createAcknowledgement(data: Record<string, unknown>) {
  return db('policy_acknowledgements').insert(data).returning('*').then((rows) => rows[0]);
}

export function findAcknowledgement(policyVersionId: string, studentId: string) {
  return db('policy_acknowledgements').where({ policy_version_id: policyVersionId, student_id: studentId }).first();
}

export function updateAcknowledgement(id: string, data: Record<string, unknown>) {
  return db('policy_acknowledgements')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listAcknowledgementsForVersion(policyVersionId: string) {
  return db('policy_acknowledgements').where({ policy_version_id: policyVersionId });
}

export function listAcknowledgementsForStudent(studentId: string) {
  return db('policy_acknowledgements').where({ student_id: studentId });
}

/** Every currently checked-in resident on campus — the population a newly
 * published policy version needs a pending acknowledgement row for.
 * Campus-wide (not hostel-scoped, unlike most of this session's other
 * scope/entity queries) — a hostel rulebook applies to every resident on
 * the campus, not one hostel at a time. */
export function listCheckedInStudentIds() {
  return db('allocations').where({ status: 'checked_in_active' }).select('student_id');
}
