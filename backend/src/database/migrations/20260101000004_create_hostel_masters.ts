import type { Knex } from 'knex';

// flow.md §4.2 Hostel-owned masters, in hierarchy order: Hostel -> Block ->
// Floor -> Room -> Bed. Every table carries org_id + campus_id and has RLS
// enabled — per the template's "pick RLS or explicit filtering per table, be
// consistent" rule, this migration picks RLS for all of it (matching the
// template's own example_items) rather than mixing the two. campus_id is
// denormalized onto every table rather than only the top-level `hostels` —
// Postgres RLS policies only see columns on the table they're defined on,
// there's no "inherit scoping from a parent via join" mechanism.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('hostels', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('code', 20).notNullable();
    t.string('name', 120).notNullable();
    t.string('gender_policy', 10).notNullable();
    t.integer('capacity').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['org_id', 'campus_id', 'code']);
    t.check("?? IN ('male', 'female', 'co-ed')", ['gender_policy']);
  });

  await knex.schema.withSchema('hostel').createTable('blocks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('hostel_id').notNullable().references('id').inTable('hostel.hostels');
    t.string('code', 20).notNullable();
    t.string('name', 120).notNullable();
    t.uuid('warden_user_id').references('user_id').inTable('hostel.shadow_users');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['hostel_id', 'code']);
  });

  await knex.schema.withSchema('hostel').createTable('floors', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('block_id').notNullable().references('id').inTable('hostel.blocks');
    t.string('number', 10).notNullable();
    t.string('name', 60);
    t.uuid('floor_incharge_user_id').references('user_id').inTable('hostel.shadow_users');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['block_id', 'number']);
  });

  await knex.schema.withSchema('hostel').createTable('rooms', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('floor_id').notNullable().references('id').inTable('hostel.floors');
    t.string('code', 20).notNullable();
    t.string('room_type', 40).notNullable().defaultTo('standard');
    t.integer('capacity').notNullable().defaultTo(1);
    t.boolean('accessibility').notNullable().defaultTo(false);
    t.string('restrictions', 500);
    t.string('status', 20).notNullable().defaultTo('active');
    t.timestamps(true, true);
    t.unique(['floor_id', 'code']);
    t.check("?? IN ('active', 'inactive')", ['status']);
  });

  // flow.md §6.1 Bed state machine
  await knex.schema.withSchema('hostel').createTable('beds', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('room_id').notNullable().references('id').inTable('hostel.rooms');
    t.string('code', 10).notNullable();
    t.string('status', 20).notNullable().defaultTo('available');
    t.timestamps(true, true);
    t.unique(['room_id', 'code']);
    t.index(['org_id', 'campus_id', 'status']);
    t.check("?? IN ('available', 'reserved', 'allocated', 'occupied', 'blocked', 'maintenance')", ['status']);
  });

  for (const table of ['hostels', 'blocks', 'floors', 'rooms', 'beds']) {
    await knex.raw(`ALTER TABLE hostel.${table} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY ${table}_isolation ON hostel.${table}
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('beds');
  await knex.schema.withSchema('hostel').dropTableIfExists('rooms');
  await knex.schema.withSchema('hostel').dropTableIfExists('floors');
  await knex.schema.withSchema('hostel').dropTableIfExists('blocks');
  await knex.schema.withSchema('hostel').dropTableIfExists('hostels');
}
