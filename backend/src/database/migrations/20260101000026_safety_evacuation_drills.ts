import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.11 + D17.17 (TODO.md Batch 16, items 63-67) —
// treated as one build per the gap ledger's own recommendation: the BRD's
// #1 P0 Red-Team finding, and daily Headcount's tables are the reusable
// foundation for both the drill lifecycle and emergency muster.
//
//   63. Safety-profile fields on `hostels` — one `safety_profile` jsonb
//       (certificate reference, evacuation capacity, assembly points, fire
//       system status references, drill cadence…), same "many optional
//       tenant-defined references, don't force a rigid schema" reasoning
//       migration 9 already used for hostels.category_policy, not dozens of
//       individual columns for values this schema has no way to verify
//       anyway (they're references to D13/D22/D25 records this domain
//       doesn't own).
//   64. `hostels.safety_status` — the ten-value BRD projection, plus
//       `safety_status_owner` + `safety_data_as_of` so "who says so, and as
//       of when" travels with the value instead of being implied. Item 67's
//       hook needs a MACHINE-READABLE room-level safety block, not just a
//       free-text reason — `rooms.status_reason_category` (new this
//       migration) is what Batch 12's status_reason text field was
//       missing for that.
//   65. `evacuation_drills` + `evacuation_drill_entries` — the drill
//       lifecycle, reusing Headcount's exact session/entry shape
//       (scope_type/scope_id, prefill-then-mark, staff or scoped
//       Room-Head/Floor-Incharge authority) rather than inventing a
//       parallel structure.
//   66. Emergency muster is NOT a separate table — `drill_type` distinguishes
//       a planned drill from a real emergency on the SAME table/lifecycle,
//       matching how the BRD itself (D17.17) treats them as sibling cases
//       of one capability, not two. A real_emergency muster skips the
//       planning/coverage-validation steps and starts immediately.
//   67. No schema change of its own — the allocation/offer-blocking hook
//       is pure application logic in allocations/service.ts, reading
//       rooms.status_reason_category and hostels.safety_status.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.string('safety_status', 40).notNullable().defaultTo('NOT_ASSESSED');
    t.text('safety_status_owner').nullable();
    t.timestamp('safety_data_as_of').nullable();
    t.jsonb('safety_profile').nullable();
  });
  await knex.raw(`
    ALTER TABLE hostel.hostels
      ADD CONSTRAINT hostels_safety_status_check
      CHECK (safety_status IN (
        'NOT_ASSESSED','COMPLIANT_CURRENT','INSPECTION_DUE','FINDING_OPEN_NON_CRITICAL',
        'FINDING_OPEN_CRITICAL','SAFETY_RESTRICTION_ACTIVE','EVACUATION_READINESS_DEGRADED',
        'CERTIFICATE_EXPIRED_OR_UNKNOWN','MANUAL_VERIFICATION_REQUIRED','CLOSED_FOR_SAFETY'
      ))
  `);

  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.string('status_reason_category', 20).nullable();
  });
  await knex.raw(`
    ALTER TABLE hostel.rooms
      ADD CONSTRAINT rooms_status_reason_category_check
      CHECK (status_reason_category IS NULL OR status_reason_category IN ('safety', 'maintenance', 'policy', 'other'))
  `);

  await knex.schema.withSchema('hostel').createTable('evacuation_drills', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('hostel_id').notNullable().references('id').inTable('hostel.hostels');
    t.string('drill_type', 20).notNullable().defaultTo('planned_drill');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.string('status', 20).notNullable().defaultTo('planned');
    t.jsonb('assembly_points').nullable();
    t.date('planned_date').nullable();
    t.uuid('opened_by').references('user_id').inTable('hostel.shadow_users');
    t.uuid('closed_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('started_at').nullable();
    t.timestamp('completed_at').nullable();
    t.text('findings').nullable();
    t.jsonb('corrective_actions').nullable();
    t.integer('unresolved_count').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.check("?? IN ('planned_drill', 'real_emergency')", ['drill_type']);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check("?? IN ('planned', 'coverage_validated', 'notified', 'in_progress', 'completed', 'cancelled')", ['status']);
    t.index(['org_id', 'campus_id', 'hostel_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('evacuation_drill_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('drill_id').notNullable().references('id').inTable('hostel.evacuation_drills');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('status', 20).notNullable().defaultTo('unresolved');
    t.text('note').nullable();
    t.uuid('recorded_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('recorded_at').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('accounted_for', 'unresolved', 'excused_on_leave')", ['status']);
    t.unique(['drill_id', 'student_id']);
  });

  for (const table of ['evacuation_drills', 'evacuation_drill_entries']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('evacuation_drill_entries');
  await knex.schema.withSchema('hostel').dropTableIfExists('evacuation_drills');

  await knex.raw('ALTER TABLE hostel.rooms DROP CONSTRAINT IF EXISTS rooms_status_reason_category_check');
  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.dropColumn('status_reason_category');
  });

  await knex.raw('ALTER TABLE hostel.hostels DROP CONSTRAINT IF EXISTS hostels_safety_status_check');
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.dropColumn('safety_profile');
    t.dropColumn('safety_data_as_of');
    t.dropColumn('safety_status_owner');
    t.dropColumn('safety_status');
  });
}
