import { db } from '../../db';

export function findById(id: string) {
  return db('responsibility_assignments').where({ id }).first();
}

/**
 * Real UX gap, found live: the "Assign to" / "Substitute" fields asked staff
 * to paste a raw user UUID with no way anywhere in the UI to discover one.
 * Same fix shape as Movement.tsx's fetchScopeOptions (flow.md §19 item 13) —
 * fetch real, named candidates instead of asking for an ID nobody has.
 * Scoped to active `student` role holders (RLS already restricts this to the
 * caller's own campus, same as every other read in this codebase) since
 * that's who a Room Head/Floor In-charge assignment actually targets — see
 * responsibilities/validators.ts's own createAssignmentSchema comment on why
 * these are resident-scoped grants, not staff ones.
 *
 * `leftJoin`, not `join` — the platform team is dropping the foreign key
 * from `user_roles.user_id` to `shadow_users` (it was never meant to force
 * every platform person into this module's own smaller user table; see
 * their own writeup). Once that FK is gone, a `user_roles` row can outlive
 * its matching `shadow_users` row (someone loses platform access before
 * this module's own access-loss handling exists yet). An inner `join`
 * would have silently dropped that person from the picker instead of
 * showing them with a placeholder name — `id` deliberately comes from
 * `user_roles.user_id` (always present), not `shadow_users.user_id`
 * (would be null on an unmatched row).
 */
export function listResidentCandidates() {
  return db('user_roles')
    .leftJoin('shadow_users', 'shadow_users.user_id', 'user_roles.user_id')
    .where({ 'user_roles.role': 'student', 'user_roles.is_active': true })
    .select(
      'user_roles.user_id as id',
      db.raw("COALESCE(shadow_users.name, 'Unknown (access removed)') as name"),
      db.raw("COALESCE(shadow_users.email, '') as email")
    )
    .orderBy('shadow_users.name');
}

export function list(filters: { scopeType?: string; scopeId?: string; assigneeUserId?: string; status?: string }) {
  const query = db('responsibility_assignments').orderBy('created_at', 'desc');
  if (filters.scopeType) query.andWhere({ scope_type: filters.scopeType });
  if (filters.scopeId) query.andWhere({ scope_id: filters.scopeId });
  if (filters.assigneeUserId) query.andWhere({ assignee_user_id: filters.assigneeUserId });
  if (filters.status) query.andWhere({ status: filters.status });
  return query;
}

export function create(data: Record<string, unknown>) {
  return db('responsibility_assignments')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function update(id: string, data: Record<string, unknown>) {
  return db('responsibility_assignments')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

/** The actual enforcement primitive future workflows (Headcount, Batch 5)
 * call — flow.md §5.2's rule verbatim: "if active [assignment] exists for
 * this user+scope+date," never "if role == X." */
export function hasActive(userId: string, privilegeType: string, scopeType: string, scopeId: string) {
  return db('responsibility_assignments')
    .where({ assignee_user_id: userId, privilege_type: privilegeType, scope_type: scopeType, scope_id: scopeId, status: 'active' })
    .andWhere('effective_from', '<=', db.fn.now())
    .andWhere((qb) => qb.whereNull('effective_to').orWhere('effective_to', '>=', db.fn.now()))
    .first('id');
}

/** flow.md §5A's delegation concept, applied to a scoped responsibility
 * instead of a base role: is this user the active substitute for this exact
 * scope? Same effective-window check as hasActive() — UAT.md Batch 10
 * gap-closure, see responsibilities/service.ts's setSubstitute. */
export function hasActiveAsSubstitute(userId: string, privilegeType: string, scopeType: string, scopeId: string) {
  return db('responsibility_assignments')
    .where({ substitute_user_id: userId, privilege_type: privilegeType, scope_type: scopeType, scope_id: scopeId, status: 'active' })
    .andWhere('effective_from', '<=', db.fn.now())
    .andWhere((qb) => qb.whereNull('effective_to').orWhere('effective_to', '>=', db.fn.now()))
    .first('id');
}

// D17.22 item 84 — coverage validation and escalation resolution.

/** WHO currently holds a duty role for a scope right now — the resolution
 * primitive resolveDutyAuthority (service.ts) walks primary -> substitute
 * with, distinct from hasActive()/hasActiveAsSubstitute() above, which
 * only ever answer "does THIS specific candidate hold it." */
export function findActiveHolder(privilegeType: string, scopeType: string, scopeId: string) {
  return db('responsibility_assignments')
    .where({ privilege_type: privilegeType, scope_type: scopeType, scope_id: scopeId, status: 'active' })
    .andWhere('effective_from', '<=', db.fn.now())
    .andWhere((qb) => qb.whereNull('effective_to').orWhere('effective_to', '>=', db.fn.now()))
    .orderBy('effective_from', 'desc')
    .first();
}

/** Escalation Level 2 in the BRD's own ladder ("Head Warden") — any
 * currently active Head Warden on the campus, the same staff-lookup
 * query utils/notify.ts's notifyCampusStaff already uses, narrowed to
 * just the more senior role. */
export function listActiveHeadWardens(campusId: string) {
  return db('user_roles').where({ campus_id: campusId, role: 'head_warden', is_active: true }).select('user_id');
}
