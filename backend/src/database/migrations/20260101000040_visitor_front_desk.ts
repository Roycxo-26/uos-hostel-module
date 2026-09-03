import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.06 (TODO.md Batch 28, items 111-115). "HOSTEL -
// v.1.md" §14 is the source spec — a much richer state machine (17 visitor
// states, an 11-state package lifecycle) than this migration builds
// outright; see the visitors module's own comments for exactly which
// states were collapsed and why, named rather than silently dropped.
//
//   111/112. New table `visitor_requests` — the genuinely new object.
//        Credential fields (opaque visitor ID, valid-from/until, hotlist)
//        live directly on this row rather than a separate
//        VisitorAuthorization table the source ER diagram names — this
//        build has no case where one request ever needs more than one
//        active credential, so a second table would be pure ceremony.
//        D19 (the real credential/Gate system) doesn't exist, so credential
//        issue is DEV-SIMULATED at approval time, same "named, not faked"
//        reasoning as the guardian OTP simulation (Batch 23).
//   113. Package custody — deliberately NOT a new table. `property_custody`
//        (Batch 18) already models exactly this lifecycle shape (received
//        -> collected, with a claimant + timestamp already on the row);
//        this migration only adds the package-specific columns that table
//        was missing (carrier/tracking/notification/identity-check) and
//        widens custody_type with 'package_delivery' (distinct from the
//        pre-existing 'package_dispute', which stays the exception path).
//   114. Wired in code (visitors/service.ts), not schema — see its own
//        comment on the slot-capacity check.
//   115. The frontend page itself, not this migration.
export async function up(knex: Knex): Promise<void> {
  // --- 113. Package custody depth on the existing Batch 18 table ----------
  await knex.schema.withSchema('hostel').alterTable('property_custody', (t) => {
    t.string('carrier', 100).nullable();
    t.string('tracking_number', 150).nullable();
    t.string('package_type', 30).nullable();
    t.boolean('restricted_item_flag').notNullable().defaultTo(false);
    t.timestamp('arrival_notified_at').nullable();
    t.integer('notification_attempts').notNullable().defaultTo(0);
    t.uuid('identity_verified_by').nullable();
    t.text('identity_verification_notes').nullable();
  });
  await knex.raw('ALTER TABLE hostel.property_custody DROP CONSTRAINT property_custody_custody_type_check');
  await knex.raw(`
    ALTER TABLE hostel.property_custody
      ADD CONSTRAINT property_custody_custody_type_check
      CHECK (custody_type IN (
        'found_property', 'checkout_belongings', 'emergency_secured', 'confiscated_item',
        'damaged_property', 'key_or_token', 'security_evidence_transfer', 'package_dispute',
        'package_delivery'
      ))
  `);

  // --- 111/112. Visitor requests -------------------------------------------
  await knex.schema.withSchema('hostel').createTable('visitor_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('host_user_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    // §14.1's authorised-host list. This build has no separate identity
    // record for Day Scholar/Department/Campus Office (unlike Resident/
    // Faculty/Staff, who are real shadow_users) — host_user_id always
    // resolves to a real authenticated user regardless of which category
    // they picked; this column is the BRD's own classification label, kept
    // for reporting, not a second identity system.
    t.string('host_type', 20).notNullable().defaultTo('resident');
    t.string('visitor_name', 150).notNullable();
    t.string('visitor_phone', 30).notNullable();
    t.text('visitor_photo_url').nullable();
    // §14.2 "identity-document reference/minimised verification result" —
    // a reference/description, never a raw ID number.
    t.text('visitor_id_reference').nullable();
    t.string('visitor_category', 30).nullable();
    t.text('purpose').notNullable();
    t.timestamp('requested_visit_start').notNullable();
    t.timestamp('requested_visit_end').notNullable();
    t.text('approved_zone_scope').nullable();
    t.string('emergency_contact', 100).nullable();
    t.string('status', 30).notNullable().defaultTo('requested');
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    // DEV-SIMULATED credential (see this migration's own header comment).
    t.string('credential_id', 40).nullable();
    t.timestamp('credential_valid_from').nullable();
    t.timestamp('credential_valid_until').nullable();
    t.boolean('credential_hotlisted').notNullable().defaultTo(false);
    t.text('credential_hotlisted_reason').nullable();
    t.timestamp('entered_at').nullable();
    t.uuid('entered_by').nullable();
    t.timestamp('exited_at').nullable();
    t.uuid('exited_by').nullable();
    t.timestamp('closed_at').nullable();
    t.uuid('closed_by').nullable();
    t.text('reopen_reason').nullable();
    t.text('cancelled_reason').nullable();
    t.uuid('cancelled_by').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('resident', 'day_scholar', 'faculty', 'staff', 'department', 'campus_office', 'other')", ['host_type']);
    t.check(
      "?? IS NULL OR ?? IN ('family', 'friend', 'vendor', 'official', 'delivery', 'other')",
      ['visitor_category', 'visitor_category']
    );
    t.check(
      `?? IN (
        'requested', 'returned_for_information', 'approved', 'denied', 'cancelled',
        'pass_issued', 'entered', 'exited', 'overstay', 'expired', 'closed', 'reopened'
      )`,
      ['status']
    );
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['host_user_id']);
  });

  await knex.raw('ALTER TABLE hostel.visitor_requests ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY visitor_requests_isolation ON hostel.visitor_requests
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
  await knex.schema.withSchema('hostel').dropTableIfExists('visitor_requests');

  await knex.raw('ALTER TABLE hostel.property_custody DROP CONSTRAINT IF EXISTS property_custody_custody_type_check');
  await knex.raw("DELETE FROM hostel.property_custody WHERE custody_type = 'package_delivery'");
  await knex.raw(`
    ALTER TABLE hostel.property_custody
      ADD CONSTRAINT property_custody_custody_type_check
      CHECK (custody_type IN (
        'found_property', 'checkout_belongings', 'emergency_secured', 'confiscated_item',
        'damaged_property', 'key_or_token', 'security_evidence_transfer', 'package_dispute'
      ))
  `);
  await knex.schema.withSchema('hostel').alterTable('property_custody', (t) => {
    t.dropColumn('carrier');
    t.dropColumn('tracking_number');
    t.dropColumn('package_type');
    t.dropColumn('restricted_item_flag');
    t.dropColumn('arrival_notified_at');
    t.dropColumn('notification_attempts');
    t.dropColumn('identity_verified_by');
    t.dropColumn('identity_verification_notes');
  });
}
