import { db } from '../../db';

// RLS already restricts every query below to the caller's org (+ campus,
// unless campus_scope=ALL). The student_id filters here are an additional,
// deliberate app-level restriction on top of that — "my own records only"
// isn't something org/campus RLS expresses, it's a per-user business rule.

export function findById(id: string) {
  return db('hostel_applications').where({ id }).first();
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('hostel_applications').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  return query;
}

/** Any application for this student+term that isn't already a dead end —
 * flow.md HST-WF-02: "One active application per configured cycle."
 * D17.02 item 51 — 'withdrawn' joins the dead-end list; a voluntarily
 * withdrawn application shouldn't block a fresh one any more than a
 * rejected/cancelled/closed one does. 'reopened' deliberately stays OUT of
 * this list — a reopened application is still active, exactly like
 * 'submitted'/'under_review'. */
export function findActiveForStudentTerm(studentId: string, term: string) {
  return db('hostel_applications')
    .where({ student_id: studentId, term })
    .whereNotIn('status', ['rejected', 'cancelled', 'closed', 'withdrawn'])
    .first();
}

export function create(data: Record<string, unknown>) {
  return db('hostel_applications')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateStatus(id: string, data: Record<string, unknown>) {
  return db('hostel_applications')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
