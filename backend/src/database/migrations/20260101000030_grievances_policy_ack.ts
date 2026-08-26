import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.21 (TODO.md Batch 20, items 79-82). The
// gap ledger's own note: "strongest reuse case of all ten new
// capabilities" — Cases already has almost every mechanic this needs
// (reporter/subject separation, confidentiality, notice-before-decision,
// appeal-preserves-original). A sibling table, not an overload of `cases`
// — grievances challenge an allocation/transfer/staff-behaviour/privacy/
// damage-assessment DECISION, not conduct/discipline.
//
//   79. `grievances` — a real but leaner lifecycle than the BRD's own
//       17-named-state list: several of those names (TRIAGE +
//       CONFLICT_CHECK, INTERIM_ACTION_ACTIVE, REFERRED) collapse into one
//       action or a side field rather than a separate stored status,
//       same "collapse steps the UI never actually shows as separate
//       human decisions" reasoning this codebase used for
//       createAllocation/createCheckIn — see service.ts's own comment.
//   80. No schema of its own — item 80's conflict-of-interest check is
//       enforced in application logic (this module's assignReviewer/
//       issueDecision/assignIndependentReviewer, AND retrofitted into
//       cases/service.ts's triageCase/decideCase in this same batch).
//   81. `policy_versions` + `policy_acknowledgements` — version/hash-
//       specific, campaign-style (publishing a version creates a pending
//       row for every currently-checked-in resident, the same prefill
//       pattern Headcount/Safety-drills/Occupancy-Verification already
//       use).
//   82. No schema of its own — the resident rights view (service.ts's
//       getMyRights) is a read-side aggregation over grievances +
//       policy_acknowledgements, nothing new to store.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('grievances', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('raised_by').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('scope', 30).notNullable();
    // The challenged actor, if any — the field item 80's conflict check
    // actually reads. Nullable: not every grievance names a specific
    // person (e.g. a service-quality complaint about a facility).
    t.uuid('subject_user_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.string('linked_entity_type', 30).nullable();
    t.uuid('linked_entity_id').nullable();
    t.text('description').notNullable();
    t.string('status', 30).notNullable().defaultTo('submitted');
    t.uuid('assigned_reviewer').nullable().references('user_id').inTable('hostel.shadow_users');
    t.text('information_request_notes').nullable();
    t.text('interim_action_notes').nullable();
    t.text('referred_to').nullable();
    t.text('decision_reason').nullable();
    t.text('remedy_notes').nullable();
    t.uuid('decided_by').nullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('decided_at').nullable();
    t.text('appeal_reason').nullable();
    t.timestamp('appeal_submitted_at').nullable();
    t.uuid('independent_reviewer').nullable().references('user_id').inTable('hostel.shadow_users');
    t.text('final_decision_reason').nullable();
    t.uuid('final_decided_by').nullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('final_decided_at').nullable();
    t.text('remediation_notes').nullable();
    t.text('reopen_reason').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('allocation','waitlist','transfer','staff_behaviour','service_quality','privacy_room_entry','damage_assessment','fee_charge','safety_sanitation','accessibility','retaliation','other')",
      ['scope']
    );
    t.check(
      "?? IN ('submitted','under_review','returned_for_information','decision_issued','appeal_submitted','independent_review','final_decision','resolved','closed','reopened','withdrawn')",
      ['status']
    );
    t.index(['org_id', 'campus_id', 'status']);
  });
  await knex.raw('ALTER TABLE hostel.grievances ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY grievances_isolation ON hostel.grievances
      FOR ALL TO hostel_app
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);

  await knex.schema.withSchema('hostel').createTable('policy_versions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('document_key', 60).notNullable();
    t.string('version', 30).notNullable();
    t.text('content_hash').nullable();
    t.string('title', 200).notNullable();
    t.boolean('mandatory').notNullable().defaultTo(true);
    t.uuid('published_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('published_at').notNullable().defaultTo(knex.fn.now());
    t.date('re_ack_deadline').nullable();
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'document_key']);
  });
  await knex.raw('ALTER TABLE hostel.policy_versions ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY policy_versions_isolation ON hostel.policy_versions
      FOR ALL TO hostel_app
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);

  await knex.schema.withSchema('hostel').createTable('policy_acknowledgements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('policy_version_id').notNullable().references('id').inTable('hostel.policy_versions');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('presented_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('viewed_at').nullable();
    t.string('state', 15).notNullable().defaultTo('pending');
    t.string('signature_method', 20).nullable();
    t.timestamp('acknowledged_at').nullable();
    t.text('decline_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('pending', 'accepted', 'declined')", ['state']);
    t.unique(['policy_version_id', 'student_id']);
    t.index(['org_id', 'campus_id', 'student_id']);
  });
  await knex.raw('ALTER TABLE hostel.policy_acknowledgements ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY policy_acknowledgements_isolation ON hostel.policy_acknowledgements
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
  await knex.schema.withSchema('hostel').dropTableIfExists('policy_acknowledgements');
  await knex.schema.withSchema('hostel').dropTableIfExists('policy_versions');
  await knex.schema.withSchema('hostel').dropTableIfExists('grievances');
}
