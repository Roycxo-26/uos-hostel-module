import type { Knex } from 'knex';

// Backing tables for @uos/auth's optional reference permission layer
// (getPermissions/hasPermission/requirePermission/assertCanGrant). These
// hold THIS module's own roles — flow.md §5.1's Head Warden/Warden/Student
// (Floor Incharge/Room CR are additional, time-bound responsibilities, not
// base roles — see attendance_responsibility_assignments in the business
// migration, not this table). Distinct from the platform's org_role
// (org_admin/campus_admin/super_admin), which never appears here — see
// src/app/*/routes.ts's requireHostelPermission for how the two combine.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('role_levels', (t) => {
    t.string('role', 50).primary();
    t.integer('level').notNullable(); // higher = more privileged; assertCanGrant compares numerically
  });

  await knex.schema.withSchema('hostel').createTable('role_permissions', (t) => {
    t.string('role', 50).notNullable().references('role').inTable('hostel.role_levels').onDelete('CASCADE');
    t.string('permission', 100).notNullable(); // '<resource>:<action>', e.g. 'application:decide'
    t.jsonb('scope').nullable(); // ABAC constraint — null = unrestricted
    t.primary(['role', 'permission']);
  });

  // One active role per user per campus — a PARTIAL campus_scope user can
  // hold a different role at each campus they're assigned to.
  await knex.schema.withSchema('hostel').createTable('user_roles', (t) => {
    t.uuid('user_id').notNullable().references('user_id').inTable('hostel.shadow_users').onDelete('CASCADE');
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('role', 50).notNullable().references('role').inTable('hostel.role_levels');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.primary(['user_id', 'campus_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('user_roles');
  await knex.schema.withSchema('hostel').dropTableIfExists('role_permissions');
  await knex.schema.withSchema('hostel').dropTableIfExists('role_levels');
}
