import type { Knex } from 'knex';

// flow.md §13: every create/change/approve/reject/return/override/export
// action logged. Org-scoped RLS only (not campus) — Head Warden/Admin roles
// operate across multiple campuses/hostels and need to see the full org
// trail; campus-level visibility narrowing, if ever needed, belongs at the
// application/reporting layer, not baked into the audit table's own RLS.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('audit_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('actor_user_id').references('user_id').inTable('hostel.shadow_users');
    t.string('action', 100).notNullable();
    t.string('entity_type', 60).notNullable();
    t.uuid('entity_id');
    t.jsonb('before_state');
    t.jsonb('after_state');
    t.string('reason', 500);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['org_id', 'entity_type', 'entity_id']);
  });

  await knex.raw('ALTER TABLE hostel.audit_log ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY audit_log_isolation ON hostel.audit_log
      FOR ALL TO hostel_app
      USING (org_id::text = current_setting('app.current_org_id', true))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('audit_log');
}
