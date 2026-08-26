import { db } from '../../db';

export function findById(id: string) {
  return db('cases').where({ id }).first();
}

export function list(filters: { status?: string; caseType?: string; involvingUserId?: string }) {
  const query = db('cases').orderBy('created_at', 'desc');
  if (filters.status) query.andWhere({ status: filters.status });
  if (filters.caseType) query.andWhere({ case_type: filters.caseType });
  // "Involving" = reporter OR subject — a non-staff user should see a case
  // either way; a discipline subject who isn't the reporter previously saw
  // nothing about their own case at all (real gap found and fixed here).
  if (filters.involvingUserId) {
    query.andWhere((qb) => qb.where({ reporter_user_id: filters.involvingUserId }).orWhere({ subject_user_id: filters.involvingUserId }));
  }
  return query;
}

/** Real gap, found live — "Concerns" asked the reporter to paste a raw
 * user UUID with no way to discover one, same pattern already fixed for
 * Room (this file's own report form) and for Assign/Substitute pickers in
 * responsibilities/repository.ts. Can't just reuse that module's
 * listResidentCandidates() — it's gated to staff (responsibility:assign)
 * and filtered to active 'student' role holders, while naming someone in
 * an incident is self-service by any resident about any other known
 * person, not staff-only or role-restricted. A plain shadow_users listing,
 * scoped by RLS to this org already.
 *
 * Real bug, found live via SELF-TEST-GUIDE.md C10 — this used to exclude
 * the caller's own user_id, which made sense for the ONE picker it was
 * built for (you can't name yourself as a "Concern" about your own
 * report) but broke Allocations.tsx when it started reusing this same
 * endpoint as a general-purpose name directory: a student viewing their
 * OWN row could never resolve their own name, because the query excluded
 * them from every result set by construction. Fixed by returning everyone
 * unconditionally here — "can't name yourself" is specific to one caller's
 * intent (Cases.tsx's Concerns picker), not a property of the directory
 * itself, so that filter now lives client-side in Cases.tsx instead. */
export function listResidentDirectory() {
  return db('shadow_users').select('user_id as id', 'name', 'email').orderBy('name');
}

/** Real gap, found live — "Assign to (user ID)" on Triage had the exact
 * same raw-paste problem as Concerns/Room, but a resident directory is the
 * wrong list for it: a case can only be assigned to case-managing staff
 * (Warden/Head Warden), not any resident. Same query shape as
 * utils/notify.ts's notifyCampusStaff — active warden/head_warden role
 * holders on this campus, joined to shadow_users for a name to show. */
export function listCaseStaffDirectory(campusId: string) {
  return db('user_roles')
    .join('shadow_users', 'shadow_users.user_id', 'user_roles.user_id')
    .where({ 'user_roles.campus_id': campusId, 'user_roles.is_active': true })
    .whereIn('user_roles.role', ['warden', 'head_warden'])
    .select('shadow_users.user_id as id', 'shadow_users.name', 'shadow_users.email', 'user_roles.role')
    .orderBy('shadow_users.name');
}

export function create(data: Record<string, unknown>) {
  return db('cases')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('cases')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
