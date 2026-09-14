import { db } from '../../db';

export function create(data: Record<string, unknown>) {
  return db('approver_delegations').insert(data).returning('*').then((rows) => rows[0]);
}

export function findById(id: string) {
  return db('approver_delegations').where({ id }).first();
}

export function list(filters: { campusId?: string; role?: string; active?: boolean }) {
  const query = db('approver_delegations').orderBy('effective_from', 'desc');
  if (filters.campusId) query.andWhere({ campus_id: filters.campusId });
  if (filters.role) query.andWhere({ role: filters.role });
  // `active` here means "the flag is true AND we're still inside the
  // effective window" — a delegation nobody revoked but whose effective_to
  // has simply passed is just as inactive to a Warden checking "who's
  // covering right now" as one that was explicitly revoked.
  if (filters.active === true) {
    query.andWhere({ active: true }).andWhere('effective_from', '<=', db.fn.now()).andWhere('effective_to', '>=', db.fn.now());
  } else if (filters.active === false) {
    query.andWhere((qb) => qb.where({ active: false }).orWhere('effective_to', '<', db.fn.now()));
  }
  return query;
}

export function revoke(id: string, data: Record<string, unknown>) {
  return db('approver_delegations')
    .where({ id })
    .update({ ...data, active: false, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

// Same leftJoin-not-join reasoning as responsibilities/repository.ts's own
// listResidentCandidates — the delegate picker needs real names, and a
// user_roles row must never be silently dropped just because its matching
// shadow_users row is gone.
export function listStaffCandidates(campusId: string) {
  return db('user_roles')
    .leftJoin('shadow_users', 'shadow_users.user_id', 'user_roles.user_id')
    .where({ 'user_roles.campus_id': campusId, 'user_roles.is_active': true })
    .whereIn('user_roles.role', ['warden', 'head_warden'])
    .select(
      'user_roles.user_id as id',
      'user_roles.role as role',
      db.raw("COALESCE(shadow_users.name, 'Unknown (access removed)') as name"),
      db.raw("COALESCE(shadow_users.email, '') as email")
    )
    .orderBy('shadow_users.name');
}
