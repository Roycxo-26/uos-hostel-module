import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.15 (TODO.md Batch 30, item 122). "HOSTEL -
// v.1.md" §23. Second of Batch 30's seven items (121 is blocked on an
// anonymity-threshold policy decision the user deferred; 122 was already
// unblocked once Batch 29's cleanliness_inspections existed — §23.3 names
// "cleanliness score" as a scoring dimension whose real data source is
// exactly that table).
//
// §23.1: "an optional feature entitlement AND a per-hostel feature flag" —
// genuinely different shape from every other optional-workflow flag this
// codebase has (those are tenant-wide, in settings.featureFlags). A
// per-hostel toggle belongs on the hostel row itself, not a tenant-wide
// setting, so this ALTERs hostels rather than adding another
// featureFlags entry.
//
// §23.4 lists 14 lifecycle states; this build stores 8, folding: SCHEDULED
// into the draft->open transition (no separate future-dated schedule
// step); INSPECTION_ACTIVE into OPEN (scoring happens during the open
// window, not a separate state); MODERATION into SCORING_LOCKED (a score
// correction is a new row, not a state transition — see gamification_
// scores' own supersedes_score_id); RECOGNITION_ISSUED/REWARD_PENDING
// fold into fields on the winning entry once status reaches FINAL_RESULT,
// not separate competition-wide states; CORRECTED isn't a competition
// state at all for the same reason MODERATION isn't.
//
// §23.5 "Score edits retain before/after, actor, reason and evidence" —
// gamification_scores rows are never updated in place; a correction is a
// new row with supersedes_score_id pointing at the one it replaces, same
// "never rewrite, always record" pattern this session already uses
// everywhere (resident_privilege_changes.supersededBy, housekeeping's
// rework_of_task_id).
//
// §23.6/23.7: "A reward that has financial value requires an approved
// budget/Finance... D17 does not create wallet value directly" —
// reward_description is free text only; this migration adds no linkage
// to financial_events, deliberately.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.boolean('gamification_enabled').notNullable().defaultTo(false);
  });

  await knex.schema.withSchema('hostel').createTable('gamification_competitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('hostel_id').notNullable().references('id').inTable('hostel.hostels');
    t.string('competition_type', 40).notNullable();
    t.string('name', 200).notNullable();
    t.text('description').nullable();
    t.string('status', 20).notNullable().defaultTo('draft');
    // §23.3's per-dimension config, published before scoring starts —
    // array of {key, label, weight, scoreMin, scoreMax, evidenceRequired,
    // minimumInspections, treatMissingAsZero}. Free-form jsonb, same
    // "flexible shape nothing else can verify anyway" reasoning migration
    // 9's category_policy already established.
    t.jsonb('scoring_dimensions').notNullable().defaultTo('[]');
    t.string('eligible_scope_type', 10).notNullable().defaultTo('room');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.integer('appeal_window_days').notNullable().defaultTo(7);
    t.text('tie_breaker_rule').nullable();
    t.uuid('created_by').notNullable();
    t.text('cancelled_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor')", ['eligible_scope_type']);
    t.check(
      `?? IN (
        'draft', 'open', 'scoring_locked', 'provisional_result',
        'appeal_window', 'final_result', 'closed', 'cancelled'
      )`,
      ['status']
    );
    t.check('?? > ??', ['end_date', 'start_date']);
    t.index(['org_id', 'campus_id', 'hostel_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('gamification_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('competition_id').notNullable().references('id').inTable('hostel.gamification_competitions');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    // §23.7 "Leaderboard may show room/team aliases rather than personal
    // names" — a display label distinct from the real room code.
    t.string('alias', 100).nullable();
    t.decimal('total_score', 8, 3).nullable();
    t.integer('rank').nullable();
    t.boolean('is_winner').notNullable().defaultTo(false);
    t.string('recognition_status', 20).notNullable().defaultTo('none');
    t.text('reward_description').nullable();
    // §23.7 "Resident participation may be opt-out where policy requires."
    t.boolean('opted_out').notNullable().defaultTo(false);
    t.string('appeal_status', 20).notNullable().defaultTo('none');
    t.text('appeal_reason').nullable();
    t.uuid('appeal_decided_by').nullable();
    t.timestamp('appeal_decided_at').nullable();
    t.text('appeal_decision_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor')", ['scope_type']);
    t.check("?? IN ('none', 'issued')", ['recognition_status']);
    t.check("?? IN ('none', 'appealed', 'upheld', 'overturned')", ['appeal_status']);
    t.unique(['competition_id', 'scope_type', 'scope_id']);
    t.index(['org_id', 'campus_id', 'competition_id']);
  });

  await knex.schema.withSchema('hostel').createTable('gamification_scores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('entry_id').notNullable().references('id').inTable('hostel.gamification_entries');
    t.string('dimension_key', 50).notNullable();
    t.decimal('score', 8, 3).notNullable();
    t.uuid('scored_by').notNullable();
    t.timestamp('scored_at').notNullable().defaultTo(knex.fn.now());
    // e.g. a cleanliness_inspections id, or free text for a dimension with
    // no linked record of its own.
    t.text('evidence_reference').nullable();
    t.uuid('supersedes_score_id').nullable();
    t.text('edit_reason').nullable();
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'entry_id', 'dimension_key']);
  });
  await knex.raw(`
    ALTER TABLE hostel.gamification_scores
      ADD CONSTRAINT gamification_scores_supersedes_foreign
      FOREIGN KEY (supersedes_score_id) REFERENCES hostel.gamification_scores(id)
  `);

  for (const table of ['gamification_competitions', 'gamification_entries', 'gamification_scores']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('gamification_scores');
  await knex.schema.withSchema('hostel').dropTableIfExists('gamification_entries');
  await knex.schema.withSchema('hostel').dropTableIfExists('gamification_competitions');
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.dropColumn('gamification_enabled');
  });
}
