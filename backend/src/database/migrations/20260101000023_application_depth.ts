import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.02 depth pass (TODO.md Batch 13, items 49-52).
//
//   49. `application_type` — ten BRD types, replacing today's one implicit
//       "generic application" (default 'new_term', the common case, so
//       nothing already-submitted needs backfilling to a guessed value).
//   50. `eligibility_outcome` (seven-value BRD enum) + `eligibility_conditions`
//       (structured conditional-eligibility object) — additive alongside
//       `status`, not replacing it. `status` stays the workflow lifecycle
//       (submitted/rejected/etc.); `eligibility_outcome` is the reviewer's
//       structured judgement, settable at decision time. Still 100% manual
//       — no eligibility SOURCE integration exists (D05/Finance/welfare),
//       that's explicitly out of scope for this batch, per the gap ledger's
//       own "Not done" list for D17.02.
//   51. `withdrawn` + `reopened` added to the status enum (the existing
//       'cancelled' value already covers "institution cancels" — it's
//       defined but was never wired to an action, closed here too) +
//       `reopen_reason`, mirroring the Cases module's own reopen pattern
//       (migration 16 / 19) for consistency across the two modules that now
//       both support it.
//   52. `renewal_of_allocation_id` — an optional link from a `renewal`-type
//       application back to the allocation it continues, making a renewal
//       structurally distinct from a brand-new application. The deeper
//       renewal re-check pipeline (fee/deposit re-check, inventory/key
//       carryover) stays blocked on Finance (TODO.md Batch 27) and general
//       eligibility-source integration — not fabricated here.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.hostel_applications DROP CONSTRAINT hostel_applications_status_check');
  await knex.raw(`
    ALTER TABLE hostel.hostel_applications
      ADD CONSTRAINT hostel_applications_status_check
      CHECK (status IN ('draft','submitted','under_review','returned','waitlisted','rejected','allocation_ready','allocated','closed','cancelled','withdrawn','reopened'))
  `);

  await knex.schema.withSchema('hostel').alterTable('hostel_applications', (t) => {
    t.string('application_type', 30).notNullable().defaultTo('new_term');
    t.text('eligibility_outcome').nullable();
    t.jsonb('eligibility_conditions').nullable();
    t.text('reopen_reason').nullable();
    t.uuid('renewal_of_allocation_id').nullable().references('id').inTable('hostel.allocations');
  });

  await knex.raw(`
    ALTER TABLE hostel.hostel_applications
      ADD CONSTRAINT hostel_applications_application_type_check
      CHECK (application_type IN (
        'new_term','renewal','mid_term','short_stay','emergency','visiting',
        'staff','accessibility_request','hostel_transfer','off_campus_placement'
      ))
  `);
  await knex.raw(`
    ALTER TABLE hostel.hostel_applications
      ADD CONSTRAINT hostel_applications_eligibility_outcome_check
      CHECK (eligibility_outcome IS NULL OR eligibility_outcome IN (
        'eligible','conditionally_eligible','waiting_for_evidence','source_verification_pending',
        'ineligible_reconsiderable','ineligible_final','exception_review_required'
      ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.hostel_applications DROP CONSTRAINT IF EXISTS hostel_applications_eligibility_outcome_check');
  await knex.raw('ALTER TABLE hostel.hostel_applications DROP CONSTRAINT IF EXISTS hostel_applications_application_type_check');

  await knex.schema.withSchema('hostel').alterTable('hostel_applications', (t) => {
    t.dropColumn('renewal_of_allocation_id');
    t.dropColumn('reopen_reason');
    t.dropColumn('eligibility_conditions');
    t.dropColumn('eligibility_outcome');
    t.dropColumn('application_type');
  });

  await knex.raw("UPDATE hostel.hostel_applications SET status = 'closed' WHERE status IN ('withdrawn', 'reopened')");
  await knex.raw('ALTER TABLE hostel.hostel_applications DROP CONSTRAINT hostel_applications_status_check');
  await knex.raw(`
    ALTER TABLE hostel.hostel_applications
      ADD CONSTRAINT hostel_applications_status_check
      CHECK (status IN ('draft','submitted','under_review','returned','waitlisted','rejected','allocation_ready','allocated','closed','cancelled'))
  `);
}
