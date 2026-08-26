import type { Knex } from 'knex';

// Shadow tables — read-only local copy of identity owned by the auth server.
// Written only by createSyncListener's handlers (see src/index.ts) in live
// mode, or seeded by hand for standalone dev (see database/seeds/ +
// README "Standalone dev mode"). Never written by application code. Shapes
// match the @uos/auth README exactly — don't improvise columns here even if
// it seems convenient.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('shadow_users', (t) => {
    t.uuid('user_id').primary();
    t.uuid('org_id').notNullable();
    t.string('name', 200).notNullable();
    t.string('email', 200).notNullable();
    t.string('phone', 50).nullable();
    t.string('org_role', 50).notNullable(); // display only — never read for permissions
    t.string('status', 20).notNullable();
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    t.check("?? IN ('active', 'inactive')", ['status']);
  });

  await knex.schema.withSchema('hostel').createTable('shadow_campuses', (t) => {
    t.uuid('campus_id').primary();
    t.uuid('org_id').notNullable();
    t.string('name', 200).notNullable();
    t.string('code', 50).notNullable();
    t.string('timezone', 50).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema('hostel').createTable('shadow_user_access', (t) => {
    t.uuid('user_id').notNullable().references('user_id').inTable('hostel.shadow_users').onDelete('CASCADE');
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('module_id').notNullable();
    t.timestamp('synced_at').notNullable().defaultTo(knex.fn.now());
    t.primary(['user_id', 'campus_id', 'module_id']);
  });
  await knex.raw('CREATE INDEX ON hostel.shadow_user_access (campus_id, module_id)');

  // Sync cursor — one row, redundant per-tenant storage per createSyncListener's
  // cursor design (resume = min across all known tenants' copies). Unused in
  // standalone dev mode (no sync listener is constructed — see src/index.ts)
  // but still created so the same migration set works in both modes.
  await knex.schema.withSchema('hostel').createTable('sync_state', (t) => {
    t.string('channel', 20).primary(); // 'events'
    t.string('last_event_id', 40).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('sync_state');
  await knex.schema.withSchema('hostel').dropTableIfExists('shadow_user_access');
  await knex.schema.withSchema('hostel').dropTableIfExists('shadow_campuses');
  await knex.schema.withSchema('hostel').dropTableIfExists('shadow_users');
}
