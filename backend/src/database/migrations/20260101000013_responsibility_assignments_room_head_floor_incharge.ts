import type { Knex } from 'knex';

// UOS HOSTEL BR.md §2 actor table — TODO.md Batch 4: Room Head and Floor/
// Side In-charge as real, scoped, time-bound responsibility grants, not
// base roles. Confirmed nothing references the old table/name yet (only a
// doc comment), so renaming now — before Batch 5 (Headcount) builds real
// code on top of it — is cheap; it would not be later.
//
// This is deliberately NOT added to hostel.role_levels/role_permissions.
// Those are org-wide base roles (Student/Warden/Head Warden) with their own
// permission grants; Room Head and Floor/Side In-charge are the opposite —
// BR §2 scopes them to "Assigned room only" / "Assigned floor only", and
// this codebase's own established rule (flow.md §5.2, the seed's own
// comment) is that titles like these grant zero authority by themselves —
// only an active, scoped, effective-dated assignment does. This table
// already existed for exactly that purpose (migration 6, "attendance
// authority" specifically) — this migration renames it to the more general
// `responsibility_assignments` and widens privilege_type to cover the
// broader BR scope (room roster/headcount, floor headcount/movement
// exceptions/complaint triage), not just attendance-taking.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').renameTable('attendance_responsibility_assignments', 'responsibility_assignments');

  const constraintRow = await knex('pg_constraint')
    .select('conname')
    .whereRaw("conrelid = 'hostel.responsibility_assignments'::regclass")
    .andWhere('contype', 'c')
    .andWhereRaw("pg_get_constraintdef(oid) ILIKE '%privilege_type%'")
    .first();
  if (!constraintRow) {
    throw new Error('Could not find the privilege_type CHECK constraint on hostel.responsibility_assignments');
  }
  await knex.raw(`ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT ??`, [constraintRow.conname]);
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN ('attendance_taker', 'verifier', 'room_head', 'floor_incharge'))
  `);

  // Cosmetic but worth doing while it's cheap: the RLS policy keeps its old
  // name across a table rename unless renamed explicitly (Postgres renames
  // the table, not the policy's own identifier).
  await knex.raw(`
    ALTER POLICY attendance_responsibility_assignments_isolation
      ON hostel.responsibility_assignments
      RENAME TO responsibility_assignments_isolation
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER POLICY responsibility_assignments_isolation
      ON hostel.responsibility_assignments
      RENAME TO attendance_responsibility_assignments_isolation
  `);

  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT responsibility_assignments_privilege_type_check');
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT attendance_responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN ('attendance_taker', 'verifier'))
  `);

  await knex.schema.withSchema('hostel').renameTable('responsibility_assignments', 'attendance_responsibility_assignments');
}
