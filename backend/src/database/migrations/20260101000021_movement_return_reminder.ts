import type { Knex } from 'knex';

// Real gap, found live via SELF-TEST-GUIDE.md C7 — jobs/flagOverdueMovements.ts
// only ever notifies staff/resident once a movement is ALREADY overdue.
// There was nothing that told a Warden "this resident's approved return
// time is coming up, go check" beforehand — the only signal staff had was
// remembering to keep re-checking the Movement queue themselves. This adds
// a one-time-per-request reminder flag, same idempotent-by-construction
// shape as transfer_requests.restoration_blocked_at: once set, the sweep
// that reads it (jobs/flagOverdueMovements.ts) never fires it again for
// that row, regardless of how many more 5-minute sweeps pass before the
// resident actually returns or goes overdue.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('movement_requests', (t) => {
    t.timestamp('return_reminder_sent_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('movement_requests', (t) => {
    t.dropColumn('return_reminder_sent_at');
  });
}
