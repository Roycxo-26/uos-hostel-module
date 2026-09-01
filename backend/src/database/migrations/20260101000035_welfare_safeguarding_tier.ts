import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.09 depth (TODO.md Batch 24, items 95-99),
// scoped against the manager's own "Authorised Safeguarding Role" policy
// reply. That reply names nine distinct roles; this migration collapses
// them into two mechanisms rather than nine new platform roles, matching
// how the policy itself actually describes access working — "Access must
// depend on: Case assignment. Approved purpose. Permission. Data scope.
// Effective time period" is a case-team model, not a role list:
//
//   - Four STANDING roles (Designated/Deputy Safeguarding Lead, Welfare
//     Officer, Counsellor) reuse `responsibility_assignments` — same
//     precedent Batch 21 already set for duty-roster privilege types
//     (effective_from/effective_to already IS a time-bound grant).
//   - Everyone else the policy names (Security/Safety Officer, Medical
//     Officer, Dean/Registrar/committee, Privacy/Legal/Auditor) is
//     explicitly "only when assigned" / "only after formal referral" /
//     "case-specific, time-bound" — a per-case grant, not a standing role.
//     New `case_access_grants` table.
//
//   95. `cases.case_type` widened with 'welfare_concern' /
//       'safeguarding_concern' — reusing the whole mature Cases workflow
//       (triage/investigate/decide/appeal/reopen) rather than a parallel
//       case system, same "deepen, don't duplicate" reasoning as every
//       other depth batch this phase.
//   96. `case_access_grants` (below) IS the field-level access control —
//       nobody sees a welfare/safeguarding case's detail without being on
//       its team. "Step-up auth" (a second live authentication step at
//       read time) has no home in this codebase yet — no session/MFA
//       step-up mechanism exists anywhere, platform-auth territory, not
//       built here; named as a real, deliberate scope cut, not silently
//       dropped. `read_only` on a grant is the masking mechanism that
//       genuinely fits this pass: an Auditor/Legal grant can view but the
//       service layer refuses every mutation from it.
//   97. `cases.decision_outcome` widened with 'informal_resolution' /
//       'warning' / 'support_plan' / 'formal_discipline'. `support_plan`'s
//       "different downstream effect" is `follow_up_due_at` — a mandatory
//       review date the other five outcomes don't carry.
//   98. `cases.missing_resident_checklist` (jsonb) — same shape as Batch
//       22's `reopening_checklist`. The escalation shape itself is Batch
//       23's own 30m/3h/12h sweep; its 12-hour tier now opens a genuine
//       'safeguarding_concern' case instead of a plain 'incident' — see
//       jobs/flagOverdueMovements.ts's own updated comment.
//   99. Referral IS a `case_access_grants` row (role_label='dean_committee',
//       time-bound) — no separate state machine needed. The emergency
//       privilege restriction is new: six columns on `cases`, mirroring
//       the reason+review-date shape this codebase already uses for a
//       room/bed status block (migration 22), with a mandatory post-review
//       outcome rather than an open-ended flag.
export async function up(knex: Knex): Promise<void> {
  // --- 95. Case type -------------------------------------------------------
  await knex.raw('ALTER TABLE hostel.cases DROP CONSTRAINT cases_case_type_check');
  await knex.raw(`
    ALTER TABLE hostel.cases
      ADD CONSTRAINT cases_case_type_check
      CHECK (case_type IN ('complaint', 'incident', 'welfare_concern', 'safeguarding_concern'))
  `);

  // --- 97. Decision outcome -------------------------------------------------
  await knex.raw('ALTER TABLE hostel.cases DROP CONSTRAINT cases_decision_outcome_check');
  await knex.raw(`
    ALTER TABLE hostel.cases
      ADD CONSTRAINT cases_decision_outcome_check
      CHECK (decision_outcome IS NULL OR decision_outcome IN (
        'upheld', 'dismissed', 'other',
        'informal_resolution', 'warning', 'support_plan', 'formal_discipline'
      ))
  `);
  await knex.schema.withSchema('hostel').alterTable('cases', (t) => {
    t.timestamp('follow_up_due_at').nullable();
  });

  // --- 98. Missing-resident checklist ---------------------------------------
  await knex.schema.withSchema('hostel').alterTable('cases', (t) => {
    t.jsonb('missing_resident_checklist').nullable();
  });

  // --- 99. Emergency privilege restriction ----------------------------------
  await knex.schema.withSchema('hostel').alterTable('cases', (t) => {
    t.boolean('emergency_restriction_active').notNullable().defaultTo(false);
    t.text('emergency_restriction_reason').nullable();
    t.uuid('emergency_restriction_imposed_by').nullable();
    t.timestamp('emergency_restriction_imposed_at').nullable();
    t.timestamp('emergency_restriction_review_due_at').nullable();
    t.timestamp('emergency_restriction_reviewed_at').nullable();
    t.uuid('emergency_restriction_reviewed_by').nullable();
    t.string('emergency_restriction_review_outcome', 10).nullable();
  });
  await knex.raw(`
    ALTER TABLE hostel.cases
      ADD CONSTRAINT cases_emergency_restriction_review_outcome_check
      CHECK (emergency_restriction_review_outcome IS NULL OR emergency_restriction_review_outcome IN ('continued', 'lifted'))
  `);

  // --- Standing safeguarding roles (reusing responsibility_assignments) ----
  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT responsibility_assignments_privilege_type_check');
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN (
        'attendance_taker', 'verifier', 'room_head', 'floor_incharge',
        'duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact',
        'safeguarding_lead', 'safeguarding_deputy', 'welfare_officer', 'counsellor'
      ))
  `);

  // --- 96/99. Case-specific, time-bound access grants -----------------------
  await knex.schema.withSchema('hostel').createTable('case_access_grants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('case_id').notNullable().references('id').inTable('hostel.cases');
    t.uuid('granted_to_user_id').notNullable();
    t.string('role_label', 30).notNullable();
    t.boolean('read_only').notNullable().defaultTo(false);
    t.text('purpose').nullable();
    t.uuid('granted_by').notNullable();
    t.timestamp('granted_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('expires_at').nullable();
    t.timestamp('revoked_at').nullable();
    t.uuid('revoked_by').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('security_officer', 'medical_officer', 'dean_committee', 'privacy_legal_auditor')", ['role_label']);
    t.index(['case_id', 'granted_to_user_id']);
  });
  await knex.raw('ALTER TABLE hostel.case_access_grants ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY case_access_grants_isolation ON hostel.case_access_grants
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
  await knex.schema.withSchema('hostel').dropTableIfExists('case_access_grants');

  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT IF EXISTS responsibility_assignments_privilege_type_check');
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN (
        'attendance_taker', 'verifier', 'room_head', 'floor_incharge',
        'duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact'
      ))
  `);

  await knex.raw('ALTER TABLE hostel.cases DROP CONSTRAINT IF EXISTS cases_emergency_restriction_review_outcome_check');
  await knex.schema.withSchema('hostel').alterTable('cases', (t) => {
    t.dropColumn('emergency_restriction_active');
    t.dropColumn('emergency_restriction_reason');
    t.dropColumn('emergency_restriction_imposed_by');
    t.dropColumn('emergency_restriction_imposed_at');
    t.dropColumn('emergency_restriction_review_due_at');
    t.dropColumn('emergency_restriction_reviewed_at');
    t.dropColumn('emergency_restriction_reviewed_by');
    t.dropColumn('emergency_restriction_review_outcome');
    t.dropColumn('missing_resident_checklist');
    t.dropColumn('follow_up_due_at');
  });

  await knex.raw('ALTER TABLE hostel.cases DROP CONSTRAINT IF EXISTS cases_decision_outcome_check');
  await knex.raw("UPDATE hostel.cases SET decision_outcome = 'other' WHERE decision_outcome NOT IN ('upheld', 'dismissed', 'other')");
  await knex.raw("ALTER TABLE hostel.cases ADD CONSTRAINT cases_decision_outcome_check CHECK (decision_outcome IS NULL OR decision_outcome IN ('upheld', 'dismissed', 'other'))");

  await knex.raw('ALTER TABLE hostel.cases DROP CONSTRAINT IF EXISTS cases_case_type_check');
  await knex.raw("UPDATE hostel.cases SET case_type = 'incident' WHERE case_type NOT IN ('complaint', 'incident')");
  await knex.raw("ALTER TABLE hostel.cases ADD CONSTRAINT cases_case_type_check CHECK (case_type IN ('complaint', 'incident'))");
}
