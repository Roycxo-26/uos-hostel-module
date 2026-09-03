import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.24 (TODO.md Batch 30, item 125). "HOSTEL
// V1.1.md" §24H. Fifth of Batch 30's seven items.
//
// §24H.4's own facility list (study room, recreation/TV room, gym, etc.)
// is deliberately NOT a new master table here — Batch 19 already built
// exactly this (`common_areas`, with area_type values covering
// 'study_room'/'recreation'/'gym'/'terrace'/etc.). The gap-analysis note
// this batch's own TODO.md line carries ("nothing to book a facility slot
// against") predates Batch 19 and is now stale, confirmed by checking
// before building rather than assumed. `facility_bookings` below
// references `common_areas` directly; no parallel facility concept.
//
// §24H.5 lists 12 booking states; this build stores 8, folding DRAFT into
// 'requested' (same simplification this session applies everywhere) and
// RESERVED into 'approved' (once approved for a specific slot it IS
// reserved — conflict detection happens at approval time, not as a
// separate stored step). FACILITY_CLOSED is not a booking status at all:
// it's a live check against the common_area's own `status` column
// (already real, from Batch 19) at request/approval time, not a
// redundant copy of that fact on this table. INCIDENT_REVIEW folds into
// a free-text `damage_incident_reference` on whichever real terminal
// state (cancelled/completed) the incident actually resolves into, same
// reasoning this session used for laundry's own VENDOR_EXCEPTION.
//
// §24H.6's "Room Head/resident representative" permission split needs no
// new schema at all — it reuses the existing responsibility_assignments
// system (room_head/floor_incharge, Batch 4) exactly the way headcount/
// service.ts's own canActOnScope already established: an organiser who
// holds an active assignment for a programme's own target scope gets
// elevated access to THAT programme without needing full
// residence_life:manage, same shape as a Room Head's headcount authority.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('facility_bookings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('common_area_id').notNullable().references('id').inTable('hostel.common_areas');
    t.uuid('requested_by').notNullable();
    t.text('purpose').notNullable();
    t.timestamp('start_at').notNullable();
    t.timestamp('end_at').notNullable();
    t.integer('attendee_count').nullable();
    t.string('status', 20).notNullable().defaultTo('requested');
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    t.timestamp('checked_in_at').nullable();
    t.timestamp('completed_at').nullable();
    t.timestamp('no_show_at').nullable();
    t.text('cancelled_reason').nullable();
    t.text('damage_incident_reference').nullable();
    t.timestamps(true, true);
    t.check('?? > ??', ['end_at', 'start_at']);
    t.check("?? IN ('requested', 'approved', 'rejected', 'checked_in', 'completed', 'cancelled', 'no_show', 'closed')", ['status']);
    t.index(['org_id', 'campus_id', 'common_area_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('residence_programmes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('programme_type', 40).notNullable();
    t.string('target_scope_type', 10).notNullable();
    t.uuid('target_scope_id').notNullable();
    t.uuid('organiser_user_id').notNullable();
    t.timestamp('scheduled_at').notNullable();
    t.text('location').nullable();
    t.uuid('facility_booking_id').nullable().references('id').inTable('hostel.facility_bookings');
    t.integer('capacity').nullable();
    t.boolean('registration_required').notNullable().defaultTo(false);
    t.text('accessibility_needs').nullable();
    t.boolean('consent_required').notNullable().defaultTo(false);
    t.string('status', 20).notNullable().defaultTo('requested');
    t.text('incident_safety_plan').nullable();
    t.text('feedback_summary').nullable();
    t.text('cost_budget_reference').nullable();
    t.text('outcome_notes').nullable();
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    t.uuid('created_by').notNullable();
    t.timestamps(true, true);
    t.check("?? IN ('hostel', 'floor')", ['target_scope_type']);
    t.check(
      `?? IN (
        'new_resident_orientation', 'floor_hostel_meeting', 'safety_awareness', 'cleanliness_waste_conservation',
        'peer_mentoring', 'study_support_session', 'sports_recreation', 'cultural_social',
        'volunteer_community_service', 'resident_committee_meeting', 'other'
      )`,
      ['programme_type']
    );
    t.check("?? IN ('requested', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('residence_programme_participants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('programme_id').notNullable().references('id').inTable('hostel.residence_programmes');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('registered_at').notNullable().defaultTo(knex.fn.now());
    t.boolean('attended').nullable();
    t.text('participation_notes').nullable();
    t.timestamps(true, true);
    t.unique(['programme_id', 'student_id']);
    t.index(['org_id', 'campus_id', 'programme_id']);
  });

  for (const table of ['facility_bookings', 'residence_programmes', 'residence_programme_participants']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('residence_programme_participants');
  await knex.schema.withSchema('hostel').dropTableIfExists('residence_programmes');
  await knex.schema.withSchema('hostel').dropTableIfExists('facility_bookings');
}
