import type { Knex } from 'knex';

// Demonstrates the RLS pattern scopedRequest sets up: set_config() binds
// app.current_org_id / app.current_campus_id / app.campus_scope per request,
// and a policy filters automatically — exampleService.ts's queries have no
// WHERE org_id=... clause anywhere, on purpose. This is the safer default
// for a template: a forgotten WHERE clause in one route can't leak
// cross-tenant rows the way it could without RLS. If your module prefers
// explicit org_id filtering in application code instead (also valid — see
// how smru-inventory-management-server's storage layer does it), you can
// drop the POLICY/ENABLE ROW LEVEL SECURITY statements below and filter
// in exampleService.ts instead; nothing else in this template assumes one
// approach over the other.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('desk').createTable('example_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable();
    t.string('title', 200).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.raw('ALTER TABLE desk.example_items ENABLE ROW LEVEL SECURITY');
  // 'desk_app' — same placeholder as everywhere else in this file, rename
  // alongside the schema name. Must match DB_APP_USER exactly.
  await knex.raw(`
    CREATE POLICY example_items_isolation ON desk.example_items
      FOR ALL TO desk_app
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
  await knex.schema.withSchema('desk').dropTableIfExists('example_items');
}
