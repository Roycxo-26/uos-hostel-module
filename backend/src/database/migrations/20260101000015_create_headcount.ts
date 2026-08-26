import type { Knex } from 'knex';

// UOS HOSTEL BR.md §8 (Headcount) — TODO.md Batch 5, second half. First
// real consumer of hostel.responsibility_assignments (migration 13): a
// session can only be opened/marked by staff or a user with an ACTIVE
// room_head/floor_incharge assignment for that exact scope — see
// responsibilities/repository.ts's hasActive(), called from
// headcount/service.ts, not re-implemented here.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('headcount_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.date('session_date').notNullable();
    t.string('status', 10).notNullable().defaultTo('open');
    t.uuid('opened_by').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('opened_at').notNullable().defaultTo(knex.fn.now());
    t.uuid('closed_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('closed_at');
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'scope_type', 'scope_id', 'session_date']);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check("?? IN ('open', 'closed')", ['status']);
  });

  // BR §11 rule 2: one session per scope per day.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_session_per_scope_per_day
      ON hostel.headcount_sessions (scope_type, scope_id, session_date)
  `);

  await knex.schema.withSchema('hostel').createTable('headcount_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('session_id').notNullable().references('id').inTable('hostel.headcount_sessions');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    // BR §8: "present / approved out / missing / unknown" — the exact four
    // categories, not a boolean present/absent.
    t.string('status', 20).notNullable().defaultTo('unknown');
    t.string('note', 500);
    t.uuid('recorded_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('recorded_at');
    t.timestamps(true, true);
    t.unique(['session_id', 'student_id']);
    t.check("?? IN ('present', 'approved_out', 'missing', 'unknown')", ['status']);
  });

  for (const table of ['headcount_sessions', 'headcount_entries']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('headcount_entries');
  await knex.schema.withSchema('hostel').dropTableIfExists('headcount_sessions');
}
