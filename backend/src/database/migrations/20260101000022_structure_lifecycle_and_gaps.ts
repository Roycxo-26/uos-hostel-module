import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.01 depth pass (TODO.md Batch 12, items 43-48).
// Five independent, additive changes to the Structure hierarchy:
//
//   43. Four-state entity lifecycle (active/suspended/deactivated/retired)
//       for hostels/blocks/floors, replacing their flat `active` boolean;
//       rooms already had a two-value `status` enum (active/inactive) —
//       widened to the same four values instead of adding a parallel
//       column. `active` boolean columns are DROPPED, not kept alongside —
//       confirmed via a repo-wide search (see service.ts/repository.ts
//       comments) that nothing outside this module ever reads them, so
//       there is no second consumer to keep in sync.
//   44. `entity_code_aliases` — generic old-code -> entity resolution table,
//       covering all five levels (hostel/block/floor/room/bed) with one
//       table rather than five near-identical ones.
//   45. `rooms.restrictions` (one free-text field) split into
//       `permitted_population` / `occupancy_compatibility_rule` /
//       `safety_restriction`.
//   46/47. `beds.status_reason` + `beds.status_review_date`, and the same
//       two columns on `rooms` — a blocked/maintenance bed or a
//       suspended/safety-blocked room now carries its reason as a queryable
//       field, not just a transient audit-log entry. Reusing one shape
//       (reason + review_date) across both levels rather than inventing a
//       bed-specific and a room-specific version of the same idea; this is
//       also the hook D17.17 (Batch 16) needs for a real room-level safety
//       block, since rooms.status now supports 'suspended' generally.
//   48. No schema change — the capacity-vs-bed-count cross-check
//       (service.ts) is pure application logic against existing columns.
export async function up(knex: Knex): Promise<void> {
  // --- 43. Lifecycle status -------------------------------------------
  const LIFECYCLE_CHECK = "?? IN ('active', 'suspended', 'deactivated', 'retired')";

  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.string('status', 20).notNullable().defaultTo('active');
  });
  await knex.raw('UPDATE hostel.hostels SET status = CASE WHEN active THEN \'active\' ELSE \'deactivated\' END');
  await knex.raw(`ALTER TABLE hostel.hostels ADD CONSTRAINT hostels_status_check CHECK (${LIFECYCLE_CHECK.replace('??', 'status')})`);
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.dropColumn('active');
  });

  await knex.schema.withSchema('hostel').alterTable('blocks', (t) => {
    t.string('status', 20).notNullable().defaultTo('active');
  });
  await knex.raw('UPDATE hostel.blocks SET status = CASE WHEN active THEN \'active\' ELSE \'deactivated\' END');
  await knex.raw(`ALTER TABLE hostel.blocks ADD CONSTRAINT blocks_status_check CHECK (${LIFECYCLE_CHECK.replace('??', 'status')})`);
  await knex.schema.withSchema('hostel').alterTable('blocks', (t) => {
    t.dropColumn('active');
  });

  await knex.schema.withSchema('hostel').alterTable('floors', (t) => {
    t.string('status', 20).notNullable().defaultTo('active');
  });
  await knex.raw('UPDATE hostel.floors SET status = CASE WHEN active THEN \'active\' ELSE \'deactivated\' END');
  await knex.raw(`ALTER TABLE hostel.floors ADD CONSTRAINT floors_status_check CHECK (${LIFECYCLE_CHECK.replace('??', 'status')})`);
  await knex.schema.withSchema('hostel').alterTable('floors', (t) => {
    t.dropColumn('active');
  });

  // rooms.status already exists (migration 4) as text(20) with a two-value
  // check constraint. Widen in place: drop the old constraint, migrate the
  // one existing value that no longer matches ('inactive' -> 'deactivated'),
  // add the new four-value constraint.
  await knex.raw('ALTER TABLE hostel.rooms DROP CONSTRAINT IF EXISTS rooms_status_check');
  await knex.raw("UPDATE hostel.rooms SET status = 'deactivated' WHERE status = 'inactive'");
  await knex.raw(`ALTER TABLE hostel.rooms ADD CONSTRAINT rooms_status_check CHECK (${LIFECYCLE_CHECK.replace('??', 'status')})`);

  // --- 46/47. Reason + review-date on rooms and beds -------------------
  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.text('status_reason').nullable();
    t.date('status_review_date').nullable();
  });
  await knex.schema.withSchema('hostel').alterTable('beds', (t) => {
    t.text('status_reason').nullable();
    t.date('status_review_date').nullable();
  });

  // --- 45. Split rooms.restrictions into three fields -------------------
  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.text('permitted_population').nullable();
    t.text('occupancy_compatibility_rule').nullable();
    t.text('safety_restriction').nullable();
  });
  // Best-effort carry-forward: the old free-text blob doesn't know which of
  // the three new fields it was describing, so it lands in
  // occupancy_compatibility_rule (the closest general-purpose match) rather
  // than being silently discarded. A human can re-triage per room later;
  // that's a data-quality decision, not something a migration should guess.
  await knex.raw(`
    UPDATE hostel.rooms
    SET occupancy_compatibility_rule = restrictions
    WHERE restrictions IS NOT NULL AND restrictions <> ''
  `);
  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.dropColumn('restrictions');
  });

  // --- 44. Code alias table ---------------------------------------------
  await knex.schema.withSchema('hostel').createTable('entity_code_aliases', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('entity_type', 10).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('old_code', 30).notNullable();
    t.timestamp('superseded_at').notNullable().defaultTo(knex.fn.now());
    t.check("?? IN ('hostel', 'block', 'floor', 'room', 'bed')", ['entity_type']);
    // Not globally unique on (entity_type, old_code) — the same short code
    // ('101', 'A') legitimately recurs across different hostels/floors; a
    // lookup always needs the resolving scope alongside the code, same as
    // every other uniqueness rule in this hierarchy (see migration 4).
    t.index(['org_id', 'campus_id', 'entity_type', 'old_code']);
  });
  await knex.raw('ALTER TABLE hostel.entity_code_aliases ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY entity_code_aliases_isolation ON hostel.entity_code_aliases
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
  await knex.schema.withSchema('hostel').dropTableIfExists('entity_code_aliases');

  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.string('restrictions', 500).nullable();
  });
  await knex.raw(`
    UPDATE hostel.rooms
    SET restrictions = occupancy_compatibility_rule
    WHERE occupancy_compatibility_rule IS NOT NULL
  `);
  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.dropColumn('permitted_population');
    t.dropColumn('occupancy_compatibility_rule');
    t.dropColumn('safety_restriction');
  });

  await knex.schema.withSchema('hostel').alterTable('beds', (t) => {
    t.dropColumn('status_reason');
    t.dropColumn('status_review_date');
  });
  await knex.schema.withSchema('hostel').alterTable('rooms', (t) => {
    t.dropColumn('status_reason');
    t.dropColumn('status_review_date');
  });

  await knex.raw('ALTER TABLE hostel.rooms DROP CONSTRAINT IF EXISTS rooms_status_check');
  await knex.raw("UPDATE hostel.rooms SET status = 'inactive' WHERE status <> 'active'");
  await knex.raw("ALTER TABLE hostel.rooms ADD CONSTRAINT rooms_status_check CHECK (status IN ('active', 'inactive'))");

  await knex.raw('ALTER TABLE hostel.floors DROP CONSTRAINT IF EXISTS floors_status_check');
  await knex.schema.withSchema('hostel').alterTable('floors', (t) => {
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.raw("UPDATE hostel.floors SET active = (status = 'active')");
  await knex.schema.withSchema('hostel').alterTable('floors', (t) => {
    t.dropColumn('status');
  });

  await knex.raw('ALTER TABLE hostel.blocks DROP CONSTRAINT IF EXISTS blocks_status_check');
  await knex.schema.withSchema('hostel').alterTable('blocks', (t) => {
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.raw("UPDATE hostel.blocks SET active = (status = 'active')");
  await knex.schema.withSchema('hostel').alterTable('blocks', (t) => {
    t.dropColumn('status');
  });

  await knex.raw('ALTER TABLE hostel.hostels DROP CONSTRAINT IF EXISTS hostels_status_check');
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.raw("UPDATE hostel.hostels SET active = (status = 'active')");
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.dropColumn('status');
  });
}
