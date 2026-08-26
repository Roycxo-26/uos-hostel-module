import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.20 (TODO.md Batch 18, items 71-74). Four
// tables for one capability: staff entering an occupied room, the master
// key that lets them, what happens to a resident's belongings when
// custody changes hands, and a strict boundary around CCTV evidence this
// domain must never actually store.
//
//   71. `room_entries` — purpose/category, requesting/approving authority,
//       notice + consent, emergency-bypass reason, witness, actual
//       entry/exit timestamps.
//   72. `master_key_log` — issue/return/overdue/lost, one row per use, not
//       a standing "who has key X" pointer — a resident-privacy-relevant
//       history needs every use on record, not just the latest.
//   73. `property_custody` — lost-and-found through post-checkout
//       belongings through evidence transferred to Security, one shared
//       lifecycle (custody_type distinguishes the scenario) rather than
//       four near-identical tables.
//   74. `security_evidence_references` — deliberately tiny: a reference
//       ID, a time range, a case reference, a legal-hold flag. No footage
//       column exists anywhere in this schema, on purpose — see
//       service.ts's own comment on why that absence is the whole point.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('room_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('room_id').notNullable().references('id').inTable('hostel.rooms');
    t.string('purpose', 30).notNullable();
    t.string('status', 20).notNullable().defaultTo('requested');
    t.uuid('requested_by').references('user_id').inTable('hostel.shadow_users');
    t.uuid('approved_by').nullable().references('user_id').inTable('hostel.shadow_users');
    t.boolean('notice_given').notNullable().defaultTo(false);
    t.boolean('consent_given').nullable();
    t.text('emergency_bypass_reason').nullable();
    t.uuid('witness_user_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('planned_window_start').nullable();
    t.timestamp('planned_window_end').nullable();
    t.uuid('entered_by').nullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('entry_at').nullable();
    t.timestamp('exit_at').nullable();
    t.text('work_reference').nullable();
    t.text('evidence_notes').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('scheduled_housekeeping','scheduled_inspection','maintenance','welfare_check','security_investigation','emergency','pest_treatment','checkout_abandonment','asset_utility_inspection','legal_audit')",
      ['purpose']
    );
    t.check("?? IN ('requested','approved','notified','entered','completed','cancelled')", ['status']);
    t.index(['org_id', 'campus_id', 'room_id']);
  });

  await knex.schema.withSchema('hostel').createTable('master_key_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('key_identifier', 30).notNullable();
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.uuid('room_entry_id').nullable().references('id').inTable('hostel.room_entries');
    t.uuid('issued_to').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('issued_by').references('user_id').inTable('hostel.shadow_users');
    t.text('purpose').nullable();
    t.timestamp('issued_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('expected_return_at').notNullable();
    t.timestamp('returned_at').nullable();
    t.string('status', 20).notNullable().defaultTo('issued');
    t.text('lost_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor', 'block', 'hostel')", ['scope_type']);
    t.check("?? IN ('issued', 'returned', 'overdue', 'lost')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('property_custody', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('custody_type', 30).notNullable();
    t.text('item_description').notNullable();
    t.uuid('student_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.text('found_location').nullable();
    t.timestamp('found_at').nullable();
    t.uuid('collected_by').references('user_id').inTable('hostel.shadow_users');
    t.uuid('witness_user_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.text('condition_notes').nullable();
    t.text('storage_location').nullable();
    t.text('notice_notes').nullable();
    t.string('status', 20).notNullable().defaultTo('in_custody');
    t.uuid('claimant_user_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('released_at').nullable();
    t.text('released_to').nullable();
    t.text('disposal_reason').nullable();
    t.date('retention_until').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('found_property','checkout_belongings','emergency_secured','confiscated_item','damaged_property','key_or_token','security_evidence_transfer','package_dispute')",
      ['custody_type']
    );
    t.check("?? IN ('in_custody', 'claimed', 'released', 'transferred_to_security', 'disposed')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('security_evidence_references', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.text('reference_id').notNullable();
    t.timestamp('time_range_start').nullable();
    t.timestamp('time_range_end').nullable();
    t.text('case_reference').nullable();
    t.string('legal_hold_status', 10).notNullable().defaultTo('none');
    t.string('linked_entity_type', 30).nullable();
    t.uuid('linked_entity_id').nullable();
    t.text('notes').nullable();
    t.uuid('created_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamps(true, true);
    t.check("?? IN ('none', 'hold', 'released')", ['legal_hold_status']);
    t.index(['org_id', 'campus_id']);
  });

  for (const table of ['room_entries', 'master_key_log', 'property_custody', 'security_evidence_references']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('security_evidence_references');
  await knex.schema.withSchema('hostel').dropTableIfExists('property_custody');
  await knex.schema.withSchema('hostel').dropTableIfExists('master_key_log');
  await knex.schema.withSchema('hostel').dropTableIfExists('room_entries');
}
