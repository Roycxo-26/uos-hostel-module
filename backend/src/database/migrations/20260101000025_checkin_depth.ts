import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.04 depth pass (TODO.md Batch 15, items 59-62).
//
//   59. `checkin_inventory_items` — structured, itemized inventory handover
//       (cot/mattress/cupboard/key/appliance…) with condition/quantity/
//       photo per item, replacing the single free-text `condition_notes`
//       field + flat photo array. Deliberately scoped to a per-check-in
//       RECORD, not a room-level master template — a "checklist by room
//       type" would need its own catalogue and is a real further step,
//       named as a follow-up rather than silently assumed here.
//   60. `checkins.acknowledgement_type` — the five distinct BRD responses
//       (accept-all / accept-with-comments / dispute-selected-item /
//       refuse-handover / request-alternate-room), replacing the single
//       pass/fail `undertaking_accepted` boolean for the room-handover
//       decision specifically (`undertaking_accepted` itself is untouched —
//       it's the separate hostel-rules undertaking, not the room-condition
//       acknowledgement). `checkins.officer_notes` (renamed in place from
//       the ambiguous `condition_notes`) and a new `resident_notes` give
//       officer and resident observations genuinely separate fields, per
//       the gap ledger's own wording.
//   61. Key custody — no new table; a key is just another
//       checkin_inventory_items row (item_category='key'). A full
//       master-key checkout/return LIFECYCLE (issue/overdue/lost
//       escalation) is D17.20's job (TODO.md Batch 18) — this only makes
//       sure a key handed over at check-in is captured as a real line, not
//       silently absent.
//   62. `defect_severity` on each inventory item — cosmetic /
//       service-impacting / safety-critical. A safety-critical item is
//       what actually gives this teeth: service.ts blocks check-in on one
//       unless staff explicitly override with a reason, same shape as the
//       Checkout module's own override-with-mandatory-reason pattern.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.checkins RENAME COLUMN condition_notes TO officer_notes');

  await knex.schema.withSchema('hostel').alterTable('checkins', (t) => {
    t.text('resident_notes').nullable();
    t.string('acknowledgement_type', 30).nullable();
    t.text('safety_override_reason').nullable();
  });
  await knex.raw(`
    ALTER TABLE hostel.checkins
      ADD CONSTRAINT checkins_acknowledgement_type_check
      CHECK (acknowledgement_type IS NULL OR acknowledgement_type IN (
        'accept_all','accept_with_comments','dispute_selected_item','refuse_handover','request_alternate_room'
      ))
  `);

  await knex.schema.withSchema('hostel').createTable('checkin_inventory_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('checkin_id').notNullable().references('id').inTable('hostel.checkins');
    t.string('item_name', 100).notNullable();
    t.string('item_category', 20).notNullable().defaultTo('other');
    t.integer('quantity').notNullable().defaultTo(1);
    t.string('condition', 20).notNullable().defaultTo('good');
    t.string('defect_severity', 20).nullable();
    t.text('photo_url').nullable();
    t.text('officer_notes').nullable();
    t.string('resident_response', 20).notNullable().defaultTo('accept');
    t.text('resident_notes').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('furniture','appliance','key','fixture','other')", ['item_category']);
    t.check("?? IN ('good','fair','damaged','missing')", ['condition']);
    t.check("?? IS NULL OR ?? IN ('cosmetic','service_impacting','safety_critical')", ['defect_severity', 'defect_severity']);
    t.check("?? IN ('accept','dispute')", ['resident_response']);
    t.index(['org_id', 'campus_id', 'checkin_id']);
  });
  await knex.raw('ALTER TABLE hostel.checkin_inventory_items ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY checkin_inventory_items_isolation ON hostel.checkin_inventory_items
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
  await knex.schema.withSchema('hostel').dropTableIfExists('checkin_inventory_items');

  await knex.raw('ALTER TABLE hostel.checkins DROP CONSTRAINT IF EXISTS checkins_acknowledgement_type_check');
  await knex.schema.withSchema('hostel').alterTable('checkins', (t) => {
    t.dropColumn('safety_override_reason');
    t.dropColumn('acknowledgement_type');
    t.dropColumn('resident_notes');
  });

  await knex.raw('ALTER TABLE hostel.checkins RENAME COLUMN officer_notes TO condition_notes');
}
