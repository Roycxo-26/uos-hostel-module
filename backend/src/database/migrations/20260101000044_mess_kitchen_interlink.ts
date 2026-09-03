import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.16 (TODO.md Batch 30, item 123). "HOSTEL -
// v.1.md" §24 — "the largest of the deferred items by far," per that
// batch's own note, but not because the BUILD is large: §24.1's ownership
// table is explicit that D18 (Mess) owns the menu, meal plan, attendance,
// diet controls, food safety and food feedback outright, and D19 owns
// credential/access. Building any of that here would mean building
// someone else's module, the exact boundary this session has held every
// time (Visitor's DEV-SIMULATED credential instead of a real D19; Batch
// 29's LOCAL_FALLBACK ticket instead of a real D22/D13). D17.16's real,
// D17-owned job is narrower: publish the residence facts §24.4 names, and
// honestly report a D18 that was never connected — §24.7's own "D18
// unavailable" behaviour is not a fallback path here, it's simply always
// true in this standalone build, named as such rather than faked.
//
// One table: an outbox of the eight `d17.*` events §24.4 names, always
// `delivery_status='queued'` (§24.7: "queues absence/guest events for
// retry... does not create a competing meal ledger or claim final
// count"). No menu/attendance/diet/feedback tables — those are D18's.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('mess_kitchen_outbox_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').nullable().references('user_id').inTable('hostel.shadow_users');
    t.string('event_type', 40).notNullable();
    t.jsonb('payload').notNullable().defaultTo('{}');
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.string('delivery_status', 20).notNullable().defaultTo('queued');
    t.timestamps(true, true);
    t.check(
      `?? IN (
        'd17.occupancy-started.v1', 'd17.occupancy-ended.v1',
        'd17.outpass-departed.v1', 'd17.outpass-returned.v1',
        'd17.leave-approved.v1', 'd17.leave-cancelled.v1',
        'd17.visitor-meal-approved.v1', 'd17.temporary-absence-updated.v1'
      )`,
      ['event_type']
    );
    t.check("?? IN ('queued', 'delivered', 'failed')", ['delivery_status']);
    t.index(['org_id', 'campus_id', 'event_type']);
  });

  await knex.raw('ALTER TABLE hostel.mess_kitchen_outbox_events ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY mess_kitchen_outbox_events_isolation ON hostel.mess_kitchen_outbox_events
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
  await knex.schema.withSchema('hostel').dropTableIfExists('mess_kitchen_outbox_events');
}
