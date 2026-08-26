import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.18 (TODO.md Batch 17, items 68-70). Checks
// whether the computer's "who lives where" record matches what staff
// actually find on a room-by-room walk — distinct from daily Headcount
// (routine roll call) and Emergency Muster (evacuation headcount).
//
//   68. `occupancy_verification_sessions` — same scope_type/scope_id shape
//       Headcount and the new Safety-drill tables already use, plus the
//       eight BRD verification types.
//   69. `occupancy_verification_entries` — one row per expected resident,
//       the thirteen-value BRD anomaly enum, and an identity-verification-
//       method field the daily headcount entries never needed.
//   70. `correction_status` — no schema for a new "unauthorised-occupancy
//       case" object. A genuine mismatch is flagged and staff are
//       notified; the actual fix always goes through D17.07's existing
//       Transfer workflow (bed_id is never written here) — see
//       service.ts's own comment on why that's a deliberate absence, not
//       an oversight.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('occupancy_verification_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.string('verification_type', 30).notNullable();
    t.date('session_date').notNullable();
    t.string('status', 10).notNullable().defaultTo('open');
    t.text('notes').nullable();
    t.uuid('opened_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('opened_at').notNullable().defaultTo(knex.fn.now());
    t.uuid('closed_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('closed_at').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check(
      "?? IN ('scheduled','floor','spot','post_migration','post_transfer','post_holiday','emergency','audit_directed')",
      ['verification_type']
    );
    t.check("?? IN ('open', 'closed')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('occupancy_verification_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('session_id').notNullable().references('id').inTable('hostel.occupancy_verification_sessions');
    // Nullable — UNAUTHORISED_PERSON_PRESENT may have no known student to
    // attach the row to at all; unauthorised_person_note carries a
    // free-text description of who was actually found instead.
    t.uuid('student_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('expected_bed_id').notNullable().references('id').inTable('hostel.beds');
    t.uuid('observed_bed_id').nullable().references('id').inTable('hostel.beds');
    t.string('presence_status', 20).notNullable().defaultTo('not_observed');
    t.string('identity_verification_method', 30).nullable();
    t.string('anomaly_type', 40).notNullable().defaultTo('EXPECTED_AND_CONFIRMED');
    t.text('unauthorised_person_note').nullable();
    t.text('evidence_notes').nullable();
    t.string('correction_status', 30).notNullable().defaultTo('none');
    t.uuid('follow_up_owner').nullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('recorded_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('recorded_at').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('observed', 'not_observed', 'refused', 'unavailable')", ['presence_status']);
    t.check(
      `?? IN (
        'EXPECTED_AND_CONFIRMED','EXPECTED_NOT_PRESENT','PRESENT_WRONG_BED','PRESENT_WRONG_ROOM',
        'UNAUTHORISED_PERSON_PRESENT','DUPLICATE_OCCUPANCY_SUSPECTED','BED_PHYSICALLY_EMPTY_BUT_SYSTEM_OCCUPIED',
        'OCCUPANT_PRESENT_BUT_SYSTEM_EMPTY','RESIDENT_ON_APPROVED_ABSENCE','TEMPORARY_RELOCATION_NOT_SYNCED',
        'IDENTITY_UNVERIFIED','ROOM_ACCESS_NOT_COMPLETED','DATA_CORRECTION_REQUIRED'
      )`,
      ['anomaly_type']
    );
    t.check("?? IN ('none', 'explained_by_existing_record', 'needs_correction', 'referred_to_transfer', 'resolved')", ['correction_status']);
    t.index(['org_id', 'campus_id', 'session_id']);
  });

  for (const table of ['occupancy_verification_sessions', 'occupancy_verification_entries']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('occupancy_verification_entries');
  await knex.schema.withSchema('hostel').dropTableIfExists('occupancy_verification_sessions');
}
