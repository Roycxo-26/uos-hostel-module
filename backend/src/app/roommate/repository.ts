import { db } from '../../db';

export function create(data: Record<string, unknown>) {
  return db('roommate_requests').insert(data).returning('*').then((rows) => rows[0]);
}

export function findById(id: string) {
  return db('roommate_requests').where({ id }).first();
}

export function update(id: string, data: Record<string, unknown>) {
  return db('roommate_requests')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** Both directions — a resident's own requests sent and received. */
export function listForStudent(studentId: string, filters: { status?: string }) {
  const query = db('roommate_requests')
    .where((qb) => qb.where({ requesting_student_id: studentId }).orWhere({ requested_student_id: studentId }))
    .orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

export function list(filters: { status?: string; studentId?: string }) {
  const query = db('roommate_requests').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.studentId) query.andWhere((qb) => qb.where({ requesting_student_id: filters.studentId }).orWhere({ requested_student_id: filters.studentId }));
  return query;
}

/** §24J.3 "no adverse effect... no existing pending/accepted request
 * already covers this pair for this term" — checked before creating a
 * new one so the same two residents don't accumulate duplicate requests. */
export function findActiveBetween(studentA: string, studentB: string, term: string) {
  return db('roommate_requests')
    .where({ term })
    .whereIn('status', ['pending', 'accepted'])
    .andWhere((qb) =>
      qb
        .where({ requesting_student_id: studentA, requested_student_id: studentB })
        .orWhere({ requesting_student_id: studentB, requested_student_id: studentA })
    )
    .first();
}

/** §24J.3's own accepted mutual match for a student+term — the
 * compatibility recommendation staff see at allocation time. */
export function findAcceptedForStudent(studentId: string, term: string) {
  return db('roommate_requests')
    .where({ term, status: 'accepted' })
    .andWhere((qb) => qb.where({ requesting_student_id: studentId }).orWhere({ requested_student_id: studentId }))
    .first();
}
