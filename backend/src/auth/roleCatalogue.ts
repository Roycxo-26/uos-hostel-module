import type { Knex } from 'knex';

/**
 * This module's roles and what each may do, written to every tenant at boot.
 *
 * Implements the gap `seeds/001_hostel_permissions.ts` flags in its own header:
 *
 *   "this seed only reaches ONE database ... registry.migrateAll() only runs
 *    schema migrations, not data seeds, across the tenant catalog. A
 *    per-tenant-provision seeding step (or an idempotent 'ensure default hostel
 *    roles' call the module runs itself against a newly-discovered org_id) is a
 *    real gap for live mode, flagged here rather than solved."
 *
 * This is that call. It matters because the symptom is silent: the module
 * migrates onto a new tenant, boots without complaint, and every permission
 * check then fails against an empty `role_levels` — so nobody can do anything,
 * however the platform has granted them access. That is exactly what was found
 * on the live dev tenant, where `role_levels` had zero rows.
 *
 * Boot rather than a migration, because the catalogue changes with the code.
 * A migration records a change once; this is a statement of what the roles ARE,
 * and it should be reasserted every time the code that depends on it starts.
 * The inventory module reaches the same conclusion for the same reason.
 *
 * The seed stays for standalone dev, where it also loads sample people.
 */

/**
 * The hostel role a platform administrator is auto-granted on sync.
 *
 * REVIEW THIS. `head_warden` is the highest role and matches what someone who
 * administers the campus would be expected to do, but which role an admin lands
 * on is a product decision about hostel rather than a platform one. `warden` is
 * the obvious alternative if configuring hostel structure should stay with a
 * named person.
 */
export const AUTO_GRANTED_ADMIN_ROLE = 'head_warden';

export const ROLE_LEVELS: ReadonlyArray<{ role: string; level: number }> = [
  { role: 'student', level: 10 },
  { role: 'warden', level: 40 },
  { role: 'head_warden', level: 50 },
];

// Kept in the same order and with the same intent as the seed, which cites
// flow.md for each. Head Warden is Warden plus structure configuration.
const WARDEN_PERMISSIONS: readonly string[] = [
  'application:decide',
  'allocation:create',
  'allocation:manage_noshow',
  'movement:decide',
  'case:manage',
  'checkout:manage',
  'grievance:manage',
  'responsibility:assign',
  'headcount:manage',
  'closure:manage',
  'guest_stay:manage',
];

export const ROLE_PERMISSIONS: ReadonlyArray<{ role: string; permission: string }> = [
  ...WARDEN_PERMISSIONS.map((permission) => ({ role: 'warden', permission })),
  ...WARDEN_PERMISSIONS.map((permission) => ({ role: 'head_warden', permission })),
  { role: 'head_warden', permission: 'structure:configure' },
];

/**
 * Upserts the catalogue into one tenant. Safe on every boot.
 *
 * Upsert rather than the seed's delete-then-insert, which cannot be used here:
 * `hostel.user_roles.role` references `role_levels`, so deleting a role a live
 * assignment points at fails — the seed's own comment records finding that the
 * hard way. Both tables have natural primary keys (`role`, and
 * `(role, permission)`), so a merge is straightforward.
 *
 * A permission REMOVED from the arrays above is not deleted here. Withdrawing
 * one is a real change in what people can do, and it should be a deliberate
 * migration that says so, not a silent consequence of an edit.
 */
export async function writeRoleCatalogue(db: Knex): Promise<number> {
  await db('role_levels')
    .insert([...ROLE_LEVELS])
    .onConflict('role')
    .merge(['level']);

  await db('role_permissions')
    .insert([...ROLE_PERMISSIONS])
    .onConflict(['role', 'permission'])
    .merge();

  return ROLE_PERMISSIONS.length;
}
