import { db } from '../../db';

export function findById(id: string) {
  return db('resident_privilege_changes').where({ id }).first();
}

export function list(filters: { studentId?: string; status?: string }) {
  const query = db('resident_privilege_changes').orderBy('created_at', 'desc');
  if (filters.studentId) query.andWhere({ student_id: filters.studentId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

/** The currently-active record for a student+privilege_type, if any — what
 * a new request's `previous_configuration` snapshots, and what an approval
 * marks superseded. */
export function findActiveForStudentAndType(studentId: string, privilegeType: string) {
  return db('resident_privilege_changes').where({ student_id: studentId, privilege_type: privilegeType, status: 'approved' }).whereNull('superseded_by').first();
}

export function create(data: Record<string, unknown>) {
  return db('resident_privilege_changes')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('resident_privilege_changes')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
