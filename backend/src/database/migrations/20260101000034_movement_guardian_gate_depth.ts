import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.10 depth (TODO.md Batch 23, items 90-94), scoped
// against the manager's own two policy replies (guardian-OTP-with-call-
// fallback, and a manual-first Gate flow that's hardware-ready without a
// redesign later):
//
//   90. `resident_guardians` (a student's own registered guardian contacts,
//       verified separately from any one outpass) + `movement_guardian_
//       confirmations` (one row per confirmation attempt — OTP or manual
//       call, never both on the same row, `method` distinguishes them).
//       `resident_guardians` didn't exist before this — the BRD's "guardian
//       confirmation requirement" had nowhere to point but an unused
//       feature flag (frontend's `enableParentAccess`, still untouched by
//       this batch — that flag is a different, broader "can parents access
//       anything at all" toggle, not this specific workflow).
//   91. `movement_requests.movement_type` widened from 2 values to 12 — the
//       BRD's own list (HOSTEL V1.1.md §18.1) minus "day outing" (already
//       `gate_pass`) and "unplanned absence reported after departure" (a
//       genuinely different shape — retroactive, not a forward request —
//       left out rather than forced into this type list; a real future
//       item, not silently assumed here).
//   92. Three new idempotent escalation-flag timestamps, same one-shot-flag
//       shape as the existing `return_reminder_sent_at` — see jobs/
//       flagOverdueMovements.ts's new tiered sweeps for what sets them.
//   93. `movement_extension_requests` — a new request_version + a fresh
//       guardian confirmation requirement, not a silent edit of the
//       original (`request_version` on movement_requests tracks which
//       version a confirmation belongs to, so an old confirmation can never
//       be mistaken for approval of a changed return time).
//   94. No schema of its own — the Gate console reuses `movement:manage` +
//       the existing recordExit/recordReturn actions; see movements/
//       service.ts's own comment on why a separate "Security" platform role
//       wasn't introduced for this pass.
export async function up(knex: Knex): Promise<void> {
  // --- 90. Guardian contacts + confirmations -----------------------------
  await knex.schema.withSchema('hostel').createTable('resident_guardians', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('name', 200).notNullable();
    t.string('relationship', 50).notNullable();
    t.string('mobile_number', 20).notNullable();
    t.boolean('is_primary').notNullable().defaultTo(false);
    t.boolean('verified').notNullable().defaultTo(false);
    t.uuid('verified_by').nullable();
    t.timestamp('verified_at').nullable();
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'student_id']);
  });

  await knex.schema.withSchema('hostel').createTable('movement_guardian_confirmations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('movement_request_id').notNullable().references('id').inTable('hostel.movement_requests');
    t.integer('request_version').notNullable().defaultTo(1);
    t.string('method', 10).notNullable();
    // OTP path — the code itself is NEVER stored in readable form, only its
    // hash, per the policy's own "OTP plaintext must never be stored" rule.
    t.text('otp_code_hash').nullable();
    t.timestamp('otp_generated_at').nullable();
    t.timestamp('otp_expires_at').nullable();
    t.integer('otp_attempt_count').notNullable().defaultTo(0);
    t.integer('otp_max_attempts').notNullable().defaultTo(3);
    // Call path.
    t.string('call_outcome', 10).nullable();
    t.text('call_remark').nullable();
    t.uuid('call_guardian_id').nullable().references('id').inTable('hostel.resident_guardians');
    t.string('status', 20).notNullable().defaultTo('pending');
    t.uuid('verified_by').nullable();
    t.timestamp('verified_at').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('otp', 'call')", ['method']);
    t.check("?? IS NULL OR ?? IN ('approve', 'decline')", ['call_outcome', 'call_outcome']);
    t.check("?? IN ('pending', 'verified', 'declined', 'expired', 'failed', 'invalidated')", ['status']);
    t.index(['movement_request_id', 'request_version']);
  });

  // --- 91. Widen movement_type -------------------------------------------
  await knex.raw('ALTER TABLE hostel.movement_requests DROP CONSTRAINT IF EXISTS movement_requests_movement_type_check');
  await knex.raw(`
    ALTER TABLE hostel.movement_requests
      ADD CONSTRAINT movement_requests_movement_type_check
      CHECK (movement_type IN (
        'gate_pass', 'leave', 'night_out', 'weekend_leave', 'vacation_leave',
        'academic_field_visit', 'official_university_movement', 'medical_leave',
        'emergency_leave', 'extended_leave', 'late_return_extension', 'mass_holiday_leave'
      ))
  `);
  await knex.schema.withSchema('hostel').alterTable('movement_requests', (t) => {
    t.string('movement_type', 30).notNullable().defaultTo('gate_pass').alter();
  });

  // --- 90/93. Guardian link, versioning, extension-adjusted return -------
  await knex.schema.withSchema('hostel').alterTable('movement_requests', (t) => {
    t.uuid('guardian_id').nullable().references('id').inTable('hostel.resident_guardians');
    t.integer('request_version').notNullable().defaultTo(1);
    t.timestamp('effective_return').nullable();
    // Emergency-leave provisional-approval path (policy's own "guardian-
    // contact follow-up must remain pending and auditable" rule) — approved
    // without a verified confirmation on record, and why.
    t.boolean('guardian_confirmation_bypassed').notNullable().defaultTo(false);
    t.text('guardian_confirmation_bypass_reason').nullable();
  });

  // --- 92. Staged escalation flags ----------------------------------------
  await knex.schema.withSchema('hostel').alterTable('movement_requests', (t) => {
    t.timestamp('escalated_30m_at').nullable();
    t.timestamp('escalated_3h_at').nullable();
    t.timestamp('escalated_12h_at').nullable();
  });

  // --- 93. Extension requests ---------------------------------------------
  await knex.schema.withSchema('hostel').createTable('movement_extension_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('movement_request_id').notNullable().references('id').inTable('hostel.movement_requests');
    t.timestamp('requested_new_return').notNullable();
    t.text('reason').notNullable();
    t.string('status', 20).notNullable().defaultTo('pending');
    // The confirmation this extension needs before it can be approved — a
    // fresh OTP/call cycle at the bumped request_version, same gate
    // decideMovement already applies to the original request.
    t.uuid('guardian_confirmation_id').nullable().references('id').inTable('hostel.movement_guardian_confirmations');
    t.uuid('created_by').notNullable();
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('pending', 'approved', 'rejected')", ['status']);
    t.index(['movement_request_id', 'status']);
  });

  for (const table of ['resident_guardians', 'movement_guardian_confirmations', 'movement_extension_requests']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('movement_extension_requests');
  await knex.schema.withSchema('hostel').dropTableIfExists('movement_guardian_confirmations');

  await knex.schema.withSchema('hostel').alterTable('movement_requests', (t) => {
    t.dropColumn('escalated_30m_at');
    t.dropColumn('escalated_3h_at');
    t.dropColumn('escalated_12h_at');
    t.dropColumn('guardian_confirmation_bypassed');
    t.dropColumn('guardian_confirmation_bypass_reason');
    t.dropColumn('effective_return');
    t.dropColumn('request_version');
    t.dropColumn('guardian_id');
  });

  await knex.raw('ALTER TABLE hostel.movement_requests DROP CONSTRAINT IF EXISTS movement_requests_movement_type_check');
  await knex.raw("UPDATE hostel.movement_requests SET movement_type = 'leave' WHERE movement_type NOT IN ('gate_pass', 'leave')");
  await knex.raw("ALTER TABLE hostel.movement_requests ADD CONSTRAINT movement_requests_movement_type_check CHECK (movement_type IN ('gate_pass', 'leave'))");

  await knex.schema.withSchema('hostel').dropTableIfExists('resident_guardians');
}
