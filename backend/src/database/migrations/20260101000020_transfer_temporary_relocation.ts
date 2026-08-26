import type { Knex } from 'knex';

// UOS HOSTEL BR.md §7 "temporary destination + retrospective review
// deadline" — UAT.md's own flagged gap (Batch 10): transfer_type='emergency'
// was built as a one-way move only. This migration is what makes it a real
// round trip: a Head Warden marks an emergency relocation `is_temporary`,
// the already-existing `retrospective_review_deadline` column doubles as the
// return-due date (it was required for emergency transfers since migration
// 12 and unused for anything beyond storage — same reused-dormant-field
// pattern as `no_show_review`/`transfer_pending` before it), and
// jobs/restoreTemporaryRelocations.ts sweeps for due ones and moves the
// resident back to their original bed automatically.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('transfer_requests', (t) => {
    t.boolean('is_temporary').notNullable().defaultTo(false);
    t.timestamp('restored_at'); // set once the round trip completes (or is determined moot — see the job's own comment)
    t.uuid('restore_transfer_id').references('id').inTable('hostel.transfer_requests'); // links to the system-generated return transfer
    // Set once, the first time the sweep finds the original bed still
    // unavailable — stops the job from re-notifying staff on every 5-minute
    // pass while they sort it out manually.
    t.timestamp('restoration_blocked_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('transfer_requests', (t) => {
    t.dropColumn('restoration_blocked_at');
    t.dropColumn('restore_transfer_id');
    t.dropColumn('restored_at');
    t.dropColumn('is_temporary');
  });
}
