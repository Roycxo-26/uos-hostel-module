import type { Knex } from 'knex';

// UOS HOSTEL BR.md §8 (Leave, Movement and Headcount) — TODO.md Batch 5,
// first half. One `movement_requests` table for both Gate Pass (same-day)
// and Leave (overnight/multi-day) — the BR itself merges these into one
// state machine (flow.md §6.6, revised), unlike the older rule book's two
// separate workflows (HST-WF-07/08). `movement_type` is a reporting flag
// only, not a behavioral fork.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('movement_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('movement_type', 10).notNullable().defaultTo('gate_pass'); // 'gate_pass' | 'leave' — reporting only
    t.string('destination', 200).notNullable();
    t.string('purpose', 500).notNullable();
    t.timestamp('requested_out').notNullable();
    t.timestamp('requested_return').notNullable();
    t.string('status', 20).notNullable().defaultTo('requested');
    t.string('decision_reason', 500);
    t.uuid('decided_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('decided_at');
    // "Gate records exit/entry" (BR §8) — no live Gate integration exists
    // yet (flow.md §11's own IntegrationSyncState pattern reserved for when
    // it does), so these are staff-recorded for Phase 1, same as
    // flow.md §15's own "Gate/device offline -> manual controlled entry"
    // exception rule, applied as the default rather than the fallback.
    t.timestamp('actual_exit_at');
    t.uuid('exit_recorded_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('actual_return_at');
    t.uuid('return_recorded_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['org_id', 'student_id', 'status']); // for the overdue-sweep job and the headcount "approved_out" lookup
    t.check("?? IN ('requested','approved','rejected','cancelled','out','returned','overdue')", ['status']);
    t.check("?? IN ('gate_pass','leave')", ['movement_type']);
    t.check('?? > ??', ['requested_return', 'requested_out']);
  });

  // BR §11 rule 2: one active movement request per resident at a time —
  // same duplicate-prevention pattern as transfer_requests.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_movement_per_student
      ON hostel.movement_requests (student_id)
      WHERE status IN ('requested', 'approved', 'out', 'overdue')
  `);

  await knex.raw('ALTER TABLE hostel.movement_requests ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY movement_requests_isolation ON hostel.movement_requests
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
  await knex.schema.withSchema('hostel').dropTableIfExists('movement_requests');
}
