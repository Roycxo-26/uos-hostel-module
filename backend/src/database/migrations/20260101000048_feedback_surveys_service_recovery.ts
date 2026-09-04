import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.14 (TODO.md Batch 30, item 121). "HOSTEL -
// v.1.md" §22. Was explicitly deferred pending a real decision (§22.4's
// "minimum response threshold before reporting" — a genuine privacy
// trade-off, not something to silently pick a number for): the user
// chose 5 as the tenant-wide default, seeded into
// policyDefaults.feedbackMinimumResponseThreshold and used to pre-fill
// every new campaign (a campaign may still set its own, higher or lower,
// per §22.3's own "minimum response threshold" being a per-campaign
// field, not a fixed platform constant).
//
// §22.4's four anonymity modes are real, structural differences in what
// gets stored, not just a display flag:
//   - identified/confidential: `respondent_user_id` is set.
//   - anonymous/aggregated_only: `respondent_user_id` stays NULL. Every
//     response still stores `submission_hash` (a one-way hash of
//     campaign+student+server salt) so duplicate submission can still be
//     refused without linking the response back to an identity in
//     ordinary operational data — §22.4's own "abuse protections use
//     privacy-preserving controls," implemented for real rather than
//     left as a comment.
//   - aggregated_only additionally never returns individual responses to
//     anyone, staff included — enforced in service.ts, not schema.
// "Confidential... limited reveal permission and audit" doesn't need a
// separate reveal-log table: revealing an identified respondent_user_id
// on a confidential response is just another audited action through the
// existing recordAudit() every other sensitive action in this codebase
// already goes through, gated by a new Head-Warden-only permission
// (feedback:reveal_identity) — same shape as finance_event:confirm/
// gamification:configure.
//
// §22.5 lists 10 lifecycle states; this build stores 6, folding
// VALIDATION into the draft->open transition itself, REMINDER_ACTIVE
// into 'open' (a reminder sweep is an action taken during the open
// window, not a separate stored state), and SERVICE_RECOVERY_ACTIVE into
// a computed "has open service-recovery cases" read rather than a status
// that would block the campaign's own lifecycle from otherwise
// progressing.
//
// §22.5: "Individual service-recovery cases are separate from the survey
// response so access and action can be controlled" — a genuinely
// separate table, `feedback_service_recovery_cases`, whose own
// `response_id` is nullable: for an anonymous/aggregated_only campaign a
// case can still be opened over a pattern of concerning comments without
// ever linking back to who wrote any one of them.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('feedback_campaigns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('name', 200).notNullable();
    t.text('purpose').nullable();
    t.string('target_scope_type', 10).notNullable();
    t.uuid('target_scope_id').notNullable();
    t.jsonb('topics').notNullable().defaultTo('[]');
    // §22.3 "question set/question type/rating scale/mandatory-optional
    // comments" — array of {key, label, questionType, ratingScale,
    // mandatory}, same flexible-jsonb-over-a-rigid-schema reasoning this
    // session already applies to gamification's own scoring_dimensions.
    t.jsonb('question_set').notNullable().defaultTo('[]');
    t.string('anonymity_mode', 20).notNullable().defaultTo('anonymous');
    t.timestamp('open_at').notNullable();
    t.timestamp('close_at').notNullable();
    t.text('recurrence').nullable();
    t.integer('minimum_response_threshold').notNullable().defaultTo(5);
    t.boolean('reminder_sent').notNullable().defaultTo(false);
    t.string('language', 10).notNullable().defaultTo('en');
    t.decimal('service_recovery_trigger_score', 4, 2).nullable();
    t.string('status', 20).notNullable().defaultTo('draft');
    t.uuid('created_by').notNullable();
    t.text('cancelled_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('hostel', 'floor', 'room')", ['target_scope_type']);
    t.check("?? IN ('identified', 'confidential', 'anonymous', 'aggregated_only')", ['anonymity_mode']);
    t.check("?? IN ('draft', 'open', 'closed', 'analysis_ready', 'archived', 'cancelled')", ['status']);
    t.check('?? > ??', ['close_at', 'open_at']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('feedback_responses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('campaign_id').notNullable().references('id').inTable('hostel.feedback_campaigns');
    t.uuid('respondent_user_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.string('submission_hash', 64).notNullable();
    t.string('topic', 50).notNullable();
    t.jsonb('answers').notNullable().defaultTo('{}');
    t.decimal('overall_rating', 4, 2).nullable();
    t.text('comment').nullable();
    t.boolean('flagged_for_review').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.check(
      `?? IN (
        'room_cleanliness', 'washroom_cleanliness', 'floor_common_area_cleanliness', 'housekeeping',
        'food_quality', 'food_quantity', 'menu_satisfaction', 'mess_hygiene', 'hospitality',
        'hostel_facilities', 'warden_support', 'security', 'maintenance', 'ticket_resolution',
        'visitor_front_desk_service', 'checkin_checkout_experience', 'overall_hostel_experience', 'other'
      )`,
      ['topic']
    );
    // One response per resident per campaign — enforced on the hash, not
    // the (nullable, often-absent) identity column, so this holds
    // equally for identified and anonymous campaigns alike.
    t.unique(['campaign_id', 'submission_hash']);
    t.index(['org_id', 'campus_id', 'campaign_id']);
  });

  await knex.schema.withSchema('hostel').createTable('feedback_service_recovery_cases', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('campaign_id').notNullable().references('id').inTable('hostel.feedback_campaigns');
    t.uuid('response_id').nullable().references('id').inTable('hostel.feedback_responses');
    t.text('trigger_reason').notNullable();
    t.string('status', 20).notNullable().defaultTo('open');
    // §22.6's own routing list (review queue, Desk ticket, housekeeping
    // inspection, Warden action, restricted case, ...) — a manual,
    // staff-entered cross-reference to whichever real record they raised
    // separately, same "not auto-linked" pattern this session has used
    // consistently since Batch 28's visitor-incident boundary, and for
    // exactly the same privacy reason here: automatic routing risks
    // exposing an anonymous respondent's identity through the very
    // record meant to help them.
    t.string('linked_reference_type', 30).nullable();
    t.uuid('linked_reference_id').nullable();
    t.uuid('assigned_to').nullable();
    t.text('resolution_notes').nullable();
    t.timestamp('closed_at').nullable();
    t.uuid('created_by').notNullable();
    t.timestamps(true, true);
    t.check("?? IN ('open', 'in_review', 'case_created', 'closed')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  for (const table of ['feedback_campaigns', 'feedback_responses', 'feedback_service_recovery_cases']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('feedback_service_recovery_cases');
  await knex.schema.withSchema('hostel').dropTableIfExists('feedback_responses');
  await knex.schema.withSchema('hostel').dropTableIfExists('feedback_campaigns');
}
