import type { Knex } from 'knex';

// flow.md §6.2, §6.3, §9.1 — Application -> Allocation -> Check-In. FKs that
// used to point at this module's own local `users` table now point at
// `shadow_users(user_id)` instead — note the primary key column name change
// (`id` -> `user_id`), per uos-module-developer-bundle/FOR_YOUR_CLAUDE_CODE.md
// §4 step 7.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('hostel_applications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('term', 40).notNullable();
    t.jsonb('preferences').notNullable().defaultTo('{}');
    t.string('status', 20).notNullable().defaultTo('submitted');
    t.string('decision_reason', 500);
    t.uuid('decided_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('decided_at');
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'status']);
    t.check(
      "?? IN ('draft','submitted','under_review','waitlisted','rejected','allocation_ready','allocated','closed','cancelled')",
      ['status']
    );
  });

  // flow.md §6.2 Allocation state machine
  await knex.schema.withSchema('hostel').createTable('allocations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('application_id').references('id').inTable('hostel.hostel_applications');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('bed_id').notNullable().references('id').inTable('hostel.beds');
    t.string('status', 20).notNullable().defaultTo('proposed');
    t.timestamp('check_in_deadline');
    t.uuid('approver_user_id').references('user_id').inTable('hostel.shadow_users');
    t.string('no_show_reason', 500);
    t.timestamp('effective_from');
    t.timestamp('effective_to');
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'status']);
    t.check(
      "?? IN ('proposed','bed_locked','confirmed','awaiting_check_in','checked_in_active','no_show_review','released','extended_hold','transfer_pending','checkout_pending','ended')",
      ['status']
    );
  });

  // THE critical invariant from flow.md §6.2 / §18 DoD: one active bed
  // assignment, and one active allocation per student.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_allocation_per_bed
      ON hostel.allocations (bed_id)
      WHERE status IN ('bed_locked','confirmed','awaiting_check_in','checked_in_active')
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_allocation_per_student
      ON hostel.allocations (student_id)
      WHERE status IN ('bed_locked','confirmed','awaiting_check_in','checked_in_active')
  `);

  // flow.md §6.3 Check-In state machine, collapsed to one row per allocation
  // (see the earlier flow.md build's own note — Verification/UndertakingPending/
  // ConditionCheck sub-states are fields, not separate rows, since Phase 1
  // doesn't need a queue view of "in-progress" check-ins).
  await knex.schema.withSchema('hostel').createTable('checkins', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('allocation_id').notNullable().unique().references('id').inTable('hostel.allocations');
    t.boolean('undertaking_accepted').notNullable().defaultTo(false);
    t.string('condition_notes', 1000);
    t.uuid('checked_in_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('checked_in_at').notNullable().defaultTo(knex.fn.now());
  });

  for (const table of ['hostel_applications', 'allocations', 'checkins']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('checkins');
  await knex.schema.withSchema('hostel').dropTableIfExists('allocations');
  await knex.schema.withSchema('hostel').dropTableIfExists('hostel_applications');
}
