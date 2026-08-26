import type { Knex } from 'knex';

// flow.md §5.1 — the single most important RBAC correction in the source
// doc: Room CR / Floor Incharge titles grant zero attendance authority by
// themselves; this table is the explicit, scoped, effective-dated grant
// that actually does. Schema only in this pass — the Attendance module's
// API/UI is still on the "not yet built" list (see project README).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('attendance_responsibility_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('assignee_user_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('privilege_type', 20).notNullable();
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.timestamp('effective_from').notNullable().defaultTo(knex.fn.now());
    t.timestamp('effective_to');
    t.uuid('assigned_by').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('substitute_user_id').references('user_id').inTable('hostel.shadow_users');
    t.string('status', 20).notNullable().defaultTo('active');
    t.string('revoke_reason', 500);
    t.timestamps(true, true);
    t.check("?? IN ('attendance_taker', 'verifier')", ['privilege_type']);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check("?? IN ('draft', 'active', 'expired', 'revoked')", ['status']);
  });

  await knex.raw(`
    CREATE INDEX idx_ara_active_lookup
      ON hostel.attendance_responsibility_assignments (assignee_user_id, scope_type, scope_id)
      WHERE status = 'active'
  `);

  await knex.raw('ALTER TABLE hostel.attendance_responsibility_assignments ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY attendance_responsibility_assignments_isolation ON hostel.attendance_responsibility_assignments
      FOR ALL TO hostel_app
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('attendance_responsibility_assignments');
}
