import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.26 (TODO.md Batch 30, item 126). "HOSTEL
// V1.1.md" §24J / D17-LAW-37. Last of Batch 30's seven items.
//
// §24J.1: "D17.26 expands the existing application roommate-preference
// field into an auditable, privacy-aware allocation input." Confirmed
// before building: applications.preferences (a jsonb object, migration 5)
// is exactly that existing field — this migration adds NO column to
// hostel_applications; the new compatibility questions (§24J.2, minus
// every sensitive attribute the law excludes) are added to that jsonb
// object's own Zod shape in applications/validators.ts instead, the same
// "the container already exists, only its own validator shape changes"
// pattern used repeatedly this session for jsonb fields.
//
// One new table: mutual roommate requests (§24J.3's own consent
// flowchart) — a genuinely new object, since a two-party consent
// exchange with expiry needs its own lifecycle, not a field on either
// resident's application.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('roommate_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('requesting_student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('requested_student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('term', 40).notNullable();
    t.text('message').nullable();
    t.string('status', 20).notNullable().defaultTo('pending');
    t.timestamp('expires_at').notNullable();
    t.timestamp('responded_at').nullable();
    t.text('decline_reason').nullable();
    t.uuid('revoked_by').nullable();
    t.timestamp('revoked_at').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('pending', 'accepted', 'declined', 'expired', 'revoked')", ['status']);
    t.check('?? <> ??', ['requesting_student_id', 'requested_student_id']);
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['requesting_student_id']);
    t.index(['requested_student_id']);
  });

  await knex.raw('ALTER TABLE hostel.roommate_requests ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY roommate_requests_isolation ON hostel.roommate_requests
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
  await knex.schema.withSchema('hostel').dropTableIfExists('roommate_requests');
}
