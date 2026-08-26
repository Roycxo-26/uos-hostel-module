import type { Knex } from 'knex';

// Backing tables for @uos/auth's optional reference permission layer
// (getPermissions/hasPermission/requirePermission/assertCanGrant). Delete
// this migration if your module writes its own permission system instead —
// nothing else in this template requires it.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('desk').createTable('role_levels', (t) => {
    t.string('role', 50).primary();
    t.integer('level').notNullable(); // higher = more privileged; assertCanGrant compares numerically
  });

  await knex.schema.withSchema('desk').createTable('role_permissions', (t) => {
    t.string('role', 50)
      .notNullable()
      .references('role')
      .inTable('desk.role_levels')
      .onDelete('CASCADE');
    t.string('permission', 100).notNullable(); // '<resource>:<action>', e.g. 'example:read'
    t.jsonb('scope').nullable(); // ABAC constraint, e.g. { "max_amount": 50000 } — null = unrestricted
    t.primary(['role', 'permission']);
  });

  // One active role per user per campus — a PARTIAL campus_scope user can
  // hold a different role at each campus they're assigned to.
  await knex.schema.withSchema('desk').createTable('user_roles', (t) => {
    t.uuid('user_id')
      .notNullable()
      .references('user_id')
      .inTable('desk.shadow_users')
      .onDelete('CASCADE');
    t.uuid('campus_id')
      .notNullable()
      .references('campus_id')
      .inTable('desk.shadow_campuses');
    t.string('role', 50)
      .notNullable()
      .references('role')
      .inTable('desk.role_levels');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.primary(['user_id', 'campus_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('desk').dropTableIfExists('user_roles');
  await knex.schema.withSchema('desk').dropTableIfExists('role_permissions');
  await knex.schema.withSchema('desk').dropTableIfExists('role_levels');
}
