import type { Knex } from 'knex';

// UOS HOSTEL BR.md §13/§14 (old rule book) — Notifications. TODO.md Batch
// 9, item 20. No live delivery channel exists (email/SMS/push) — this is
// the in-app tray only, same "real for what's actually buildable, stubbed
// where it genuinely can't be" pattern as every other cross-module
// integration in this codebase (Desk tickets, Finance clearance, Gate
// exit/entry). `link` is a same-origin frontend route, not an external URL.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('user_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('type', 60).notNullable(); // e.g. 'application.decided', 'allocation.no_show' — matches the audit_log action naming convention
    t.string('title', 200).notNullable();
    t.string('body', 1000);
    t.string('link', 300); // frontend route, e.g. '/applications'
    t.boolean('read').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['org_id', 'campus_id', 'user_id', 'read']);
  });

  await knex.raw('ALTER TABLE hostel.notifications ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY notifications_isolation ON hostel.notifications
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
  await knex.schema.withSchema('hostel').dropTableIfExists('notifications');
}
