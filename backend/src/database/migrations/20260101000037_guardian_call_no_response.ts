import type { Knex } from 'knex';

// D17.10 follow-up (management's own clarification on the communication
// architecture): guardian call confirmation has three real outcomes, not
// two — "record Call Confirmed – Approve / Decline / No Response with
// mandatory remarks". Batch 23 only built approve/decline; this closes
// that gap, found from the manager's own message rather than the BRD.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.movement_guardian_confirmations DROP CONSTRAINT movement_guardian_confirmations_call_outcome_check');
  await knex.raw(`
    ALTER TABLE hostel.movement_guardian_confirmations
      ADD CONSTRAINT movement_guardian_confirmations_call_outcome_check
      CHECK (call_outcome IS NULL OR call_outcome IN ('approve', 'decline', 'no_response'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.movement_guardian_confirmations DROP CONSTRAINT IF EXISTS movement_guardian_confirmations_call_outcome_check');
  await knex.raw("UPDATE hostel.movement_guardian_confirmations SET call_outcome = 'decline' WHERE call_outcome = 'no_response'");
  await knex.raw(`
    ALTER TABLE hostel.movement_guardian_confirmations
      ADD CONSTRAINT movement_guardian_confirmations_call_outcome_check
      CHECK (call_outcome IS NULL OR call_outcome IN ('approve', 'decline'))
  `);
}
