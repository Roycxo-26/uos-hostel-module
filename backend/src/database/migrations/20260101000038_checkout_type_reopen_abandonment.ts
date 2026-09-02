import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.12 depth (TODO.md Batch 26, items 103-107).
//
//   103. `checkout_type` (5 values, including 'abandonment' for item 106) +
//        `prerequisite_checklist` (jsonb, same shape as Batch 22/24's own
//        checklist columns) — which keys apply is type-specific, resolved
//        in code (checkouts/validators.ts), not five different columns.
//   104. Five independently-trackable milestones. Two already existed
//        (desk_cleared, finance_cleared); three are new here (item return,
//        damage-assessment finalisation, room-ready-for-reuse). `approve
//        Checkout`'s clearance gate now checks all five, not two.
//        "Room ready for reuse" is a plain staff confirmation for now — the
//        real housekeeping/readiness signal is Batch 29 (Maintenance),
//        which doesn't exist yet, named here rather than faked.
//   105. `status` widened with 'reopened' — mirrors Cases' own reopen
//        pattern exactly (a real status value, not just an audit entry;
//        inspectCheckout's own TRIAGEABLE-style FROM-set widens to accept
//        it as a second starting point, same reasoning as cases/
//        service.ts's TRIAGEABLE_FROM).
//   106. `checkout_contact_attempts` (the contact-attempts log) +
//        `legal_waiting_period_ends_at` — an abandonment checkout can't be
//        approved until the waiting period has passed AND at least one
//        attempt is on record. Belongings routing reuses Batch 18's
//        `property_custody` table (`custody_type='checkout_belongings'`
//        already existed in that schema, unused until now) via a repo-to-
//        repo call, not a parallel storage concept.
//   107. `checkout_inventory_items` — `checkin_item_id` is the actual
//        before/after linkage (a real FK back to Batch 15's
//        `checkin_inventory_items`, not a name-matching heuristic), plus a
//        genuine `classification` field (normal_wear vs damage) distinct
//        from the raw `condition_at_checkout`. `charge_amount` is present
//        but deliberately manual-entry-only — no rate card exists to
//        compute it from, and no refund/recovery instruction pipeline to
//        Finance exists either (Batch 27 doesn't exist yet); both named as
//        real, deliberate scope boundaries rather than faked.
export async function up(knex: Knex): Promise<void> {
  // --- 103. Checkout type + prerequisite checklist ------------------------
  await knex.schema.withSchema('hostel').alterTable('checkouts', (t) => {
    t.string('checkout_type', 30).notNullable().defaultTo('end_of_term');
    t.jsonb('prerequisite_checklist').nullable();
  });
  await knex.raw(`
    ALTER TABLE hostel.checkouts
      ADD CONSTRAINT checkouts_checkout_type_check
      CHECK (checkout_type IN ('end_of_term', 'early_voluntary', 'disciplinary_removal', 'death_incapacity', 'abandonment'))
  `);

  // --- 104. Three new milestones (desk_cleared/finance_cleared already existed) ---
  await knex.schema.withSchema('hostel').alterTable('checkouts', (t) => {
    t.timestamp('item_return_verified_at').nullable();
    t.uuid('item_return_verified_by').nullable();
    t.timestamp('damage_assessment_finalized_at').nullable();
    t.uuid('damage_assessment_finalized_by').nullable();
    t.timestamp('room_ready_for_reuse_at').nullable();
    t.uuid('room_ready_for_reuse_by').nullable();
  });

  // --- 105. Reopen ----------------------------------------------------------
  await knex.raw('ALTER TABLE hostel.checkouts DROP CONSTRAINT checkouts_status_check');
  await knex.raw(`
    ALTER TABLE hostel.checkouts
      ADD CONSTRAINT checkouts_status_check
      CHECK (status IN ('requested', 'inspected', 'completed', 'cancelled', 'reopened'))
  `);
  await knex.schema.withSchema('hostel').alterTable('checkouts', (t) => {
    t.text('reopen_reason').nullable();
  });

  // --- 106. Abandonment: contact attempts + waiting period -----------------
  await knex.schema.withSchema('hostel').alterTable('checkouts', (t) => {
    t.timestamp('legal_waiting_period_ends_at').nullable();
  });
  await knex.schema.withSchema('hostel').createTable('checkout_contact_attempts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('checkout_id').notNullable().references('id').inTable('hostel.checkouts');
    t.uuid('attempted_by').notNullable();
    t.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
    t.string('method', 20).notNullable();
    t.string('outcome', 20).notNullable();
    t.text('notes').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('call', 'email', 'sms', 'in_person')", ['method']);
    t.check("?? IN ('no_response', 'invalid_contact', 'reached')", ['outcome']);
    t.index(['checkout_id']);
  });

  // --- 107. Itemized checkout inventory, linked back to check-in -----------
  await knex.schema.withSchema('hostel').createTable('checkout_inventory_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('checkout_id').notNullable().references('id').inTable('hostel.checkouts');
    t.uuid('checkin_item_id').nullable().references('id').inTable('hostel.checkin_inventory_items');
    t.string('item_name', 100).notNullable();
    t.string('item_category', 20).notNullable().defaultTo('other');
    t.string('condition_at_checkout', 20).notNullable().defaultTo('good');
    t.string('classification', 20).nullable();
    t.text('photo_url').nullable();
    t.text('officer_notes').nullable();
    t.decimal('charge_amount', 10, 2).nullable();
    t.timestamps(true, true);
    t.check("?? IN ('furniture', 'appliance', 'key', 'fixture', 'other')", ['item_category']);
    t.check("?? IN ('good', 'fair', 'damaged', 'missing')", ['condition_at_checkout']);
    t.check("?? IS NULL OR ?? IN ('normal_wear', 'damage', 'not_applicable')", ['classification', 'classification']);
    t.index(['checkout_id']);
  });

  for (const table of ['checkout_contact_attempts', 'checkout_inventory_items']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('checkout_inventory_items');
  await knex.schema.withSchema('hostel').dropTableIfExists('checkout_contact_attempts');

  await knex.schema.withSchema('hostel').alterTable('checkouts', (t) => {
    t.dropColumn('legal_waiting_period_ends_at');
    t.dropColumn('reopen_reason');
    t.dropColumn('item_return_verified_at');
    t.dropColumn('item_return_verified_by');
    t.dropColumn('damage_assessment_finalized_at');
    t.dropColumn('damage_assessment_finalized_by');
    t.dropColumn('room_ready_for_reuse_at');
    t.dropColumn('room_ready_for_reuse_by');
  });

  await knex.raw('ALTER TABLE hostel.checkouts DROP CONSTRAINT IF EXISTS checkouts_status_check');
  await knex.raw("UPDATE hostel.checkouts SET status = 'completed' WHERE status = 'reopened'");
  await knex.raw("ALTER TABLE hostel.checkouts ADD CONSTRAINT checkouts_status_check CHECK (status IN ('requested', 'inspected', 'completed', 'cancelled'))");

  await knex.raw('ALTER TABLE hostel.checkouts DROP CONSTRAINT IF EXISTS checkouts_checkout_type_check');
  await knex.schema.withSchema('hostel').alterTable('checkouts', (t) => {
    t.dropColumn('checkout_type');
    t.dropColumn('prerequisite_checklist');
  });
}
