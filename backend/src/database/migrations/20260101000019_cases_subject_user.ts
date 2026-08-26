import type { Knex } from 'knex';

// Real gap found while wiring notifications (TODO.md Batch 9), not caught
// when `cases` was first built (Batch 6): the table only ever had
// reporter_user_id — whoever filed the complaint/incident. That's correct
// for a Complaint (the reporter is the one tracking their own ticket), but
// wrong for discipline: BR §9's notice/decision is about the person being
// investigated, who is very often NOT the reporter (Student A reports
// Student B's conduct; B is who gets the notice, not A). Fixing it here
// rather than silently sending discipline notices to the wrong person.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('cases', (t) => {
    // Nullable and separate from reporter_user_id, not a rename: a
    // Complaint genuinely has no "subject," only a reporter. Falls back to
    // reporter_user_id in the service layer when absent, so existing rows
    // and the common complaint case need no special handling.
    t.uuid('subject_user_id').references('user_id').inTable('hostel.shadow_users');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('cases', (t) => {
    t.dropColumn('subject_user_id');
  });
}
