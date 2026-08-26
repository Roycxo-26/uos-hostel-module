import type { Knex } from 'knex';

// UOS HOSTEL BR.md §3 "Masters and Configuration" gap-closure, tracked in
// TODO.md Batch 1 items 1-2. Additive only — migration 20260101000004 already
// ran live, so this is a fresh migration rather than an edit to that file (an
// already-applied migration must never change shape under a DB that ran it).
//
// Two BR-required fields on the `hostels` master were missing:
//   - "effective-dated configuration" — added at the Hostel level only, not
//     cascaded to block/floor/room/bed. The BR's own §3 table lists
//     "effective dates" once, against the "Hostel hierarchy" row as a whole,
//     not per sub-level; if a future requirement needs per-block/floor
//     effective-dating, that's a deliberate follow-up, not silently assumed
//     here.
//   - "gender/category/accessibility policy" — gender_policy already existed
//     (migration 4). category_policy and accessibility_policy are new.
//     Deliberately NOT a fixed CHECK-constrained enum: flow.md §16
//     (HST-OD list) and the BR's own §3 "NEEDS DECISION — configure, do not
//     hard-code" callout explicitly list category/accessibility rules as
//     tenant-configurable, not a frozen value set. jsonb keeps this open per
//     tenant instead of forcing a schema migration every time a university's
//     category list changes.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.date('effective_from').nullable();
    t.date('effective_to').nullable();
    t.jsonb('category_policy').nullable(); // tenant-defined array of category codes, e.g. ["general", "reserved", "international"]
    t.text('accessibility_policy').nullable(); // hostel-level statement, distinct from rooms.accessibility (a per-room boolean)
  });

  await knex.raw(`
    ALTER TABLE hostel.hostels
      ADD CONSTRAINT hostels_effective_range_check
      CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.hostels DROP CONSTRAINT IF EXISTS hostels_effective_range_check');
  await knex.schema.withSchema('hostel').alterTable('hostels', (t) => {
    t.dropColumn('effective_from');
    t.dropColumn('effective_to');
    t.dropColumn('category_policy');
    t.dropColumn('accessibility_policy');
  });
}
