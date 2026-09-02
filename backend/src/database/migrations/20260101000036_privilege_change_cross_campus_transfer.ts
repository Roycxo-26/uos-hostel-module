import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.07 depth (TODO.md Batch 25, items 100-102).
//
//   100. `resident_privilege_changes` — a genuinely separate object from a
//        bed transfer, per the BRD's own framing (§15.2): access zones,
//        visitor-hosting entitlement, outpass rule profile, mess
//        entitlement, temporary/restricted status. None of these move a
//        resident's bed, so forcing them through transfer_requests (which
//        always requires an old_bed_id/current_allocation_id) would be
//        the wrong shape.
//   101. `transfer_requests.destination_campus_id` — nullable, null means
//        "same campus" (every existing row, unchanged behaviour). When
//        set, this is a cross-campus transfer and the RLS policy is
//        widened (see below) so the DESTINATION campus's own Warden can
//        actually see the row to accept it — without this, a row owned by
//        the source campus's `campus_id` would be structurally invisible
//        to anyone scoped to the destination campus, the exact "inter-
//        campus data-scope check" the BRD names (§15.6) as a real
//        requirement, not an implementation detail to gloss over.
//   102. `transfer_requests.change_category` — the BRD's own 17-item
//        change-type list (§15.1), minus the ones that are genuinely
//        privilege changes (temporary access privilege, mess-eligibility
//        change, access-zone actions, hostel-privilege suspension/
//        restoration — those went into item 100's table instead) — 13
//        remain, added ALONGSIDE `transfer_type` rather than replacing it:
//        `transfer_type` ('normal'/'emergency') still drives who has to
//        approve (Warden vs Head Warden per BR §7), `change_category` is
//        the finer BRD classification layered on top. Charge/rate-
//        difference disclosure at transfer time (§15.3) stays explicitly
//        blocked on Batch 27 (Finance) existing, named here rather than
//        faked with a field nothing populates.
export async function up(knex: Knex): Promise<void> {
  // --- 101. Cross-campus transfer -----------------------------------------
  await knex.schema.withSchema('hostel').alterTable('transfer_requests', (t) => {
    t.uuid('destination_campus_id').nullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('destination_accepted_by').nullable();
    t.timestamp('destination_accepted_at').nullable();
    t.text('credential_remapping_notes').nullable();
  });

  // Widen the isolation policy so a row is visible to EITHER the source
  // campus (campus_id, the existing behaviour) OR the destination campus
  // (destination_campus_id, new) — same-campus rows have a null
  // destination_campus_id, so that extra OR clause is simply never true
  // for them and nothing about existing behaviour changes.
  await knex.raw(`
    ALTER POLICY transfer_requests_isolation ON hostel.transfer_requests
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
          OR destination_campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);

  // --- 102. Change category ------------------------------------------------
  await knex.schema.withSchema('hostel').alterTable('transfer_requests', (t) => {
    t.string('change_category', 40).nullable();
  });
  await knex.raw(`
    ALTER TABLE hostel.transfer_requests
      ADD CONSTRAINT transfer_requests_change_category_check
      CHECK (change_category IS NULL OR change_category IN (
        'bed_change', 'room_change', 'floor_wing_block_transfer', 'hostel_to_hostel_transfer',
        'campus_to_campus_transfer', 'temporary_maintenance_relocation', 'accessibility_accommodation_move',
        'safety_welfare_emergency_move', 'conflict_resolution_move', 'administrative_reassignment',
        'resident_requested_voluntary_move', 'extension_of_stay', 'early_termination'
      ))
  `);

  // --- 100. Resident privilege changes -------------------------------------
  await knex.schema.withSchema('hostel').createTable('resident_privilege_changes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('privilege_type', 30).notNullable();
    t.string('action', 20).notNullable();
    // Free-form — each privilege_type has a genuinely different shape
    // (an access-zone change isn't shaped like a mess-entitlement change),
    // same "flexible jsonb over a rigid schema nothing can verify anyway"
    // reasoning migration 9's category_policy and migration 26's
    // safety_profile already established.
    t.jsonb('previous_configuration').nullable();
    t.jsonb('proposed_configuration').notNullable();
    t.timestamp('effective_from').notNullable();
    t.timestamp('effective_to').nullable();
    t.uuid('initiator_user_id').notNullable();
    t.text('reason').notNullable();
    t.string('status', 20).notNullable().defaultTo('requested');
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    t.timestamp('resident_acknowledged_at').nullable();
    // BRD's own "linked conduct/welfare/maintenance/Finance references" —
    // a generic pointer, same stopgap shape cases.desk_ticket_reference
    // already uses for a cross-domain reference this codebase can't
    // itself resolve or validate.
    t.string('linked_reference_type', 30).nullable();
    t.uuid('linked_reference_id').nullable();
    // BRD's own "reversal/supersession history" — a self-reference, same
    // pattern operational_notices.superseded_by already uses for "this
    // record's current meaning moved to a newer one, without erasing the
    // original."
    t.uuid('superseded_by').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('access_zone', 'visitor_hosting', 'outpass_rule_profile', 'mess_entitlement', 'temporary_access', 'hostel_privilege_status')", ['privilege_type']);
    t.check("?? IN ('grant', 'restrict', 'suspend', 'restore')", ['action']);
    t.check("?? IN ('requested', 'approved', 'rejected', 'cancelled', 'reversed')", ['status']);
    t.index(['org_id', 'campus_id', 'student_id', 'status']);
  });
  await knex.raw(`
    ALTER TABLE hostel.resident_privilege_changes
      ADD CONSTRAINT resident_privilege_changes_superseded_by_foreign
      FOREIGN KEY (superseded_by) REFERENCES hostel.resident_privilege_changes(id)
  `);

  await knex.raw('ALTER TABLE hostel.resident_privilege_changes ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY resident_privilege_changes_isolation ON hostel.resident_privilege_changes
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
  await knex.schema.withSchema('hostel').dropTableIfExists('resident_privilege_changes');

  await knex.raw('ALTER TABLE hostel.transfer_requests DROP CONSTRAINT IF EXISTS transfer_requests_change_category_check');
  await knex.schema.withSchema('hostel').alterTable('transfer_requests', (t) => {
    t.dropColumn('change_category');
  });

  await knex.raw(`
    ALTER POLICY transfer_requests_isolation ON hostel.transfer_requests
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);

  await knex.schema.withSchema('hostel').alterTable('transfer_requests', (t) => {
    t.dropColumn('destination_campus_id');
    t.dropColumn('destination_accepted_by');
    t.dropColumn('destination_accepted_at');
    t.dropColumn('credential_remapping_notes');
  });
}
