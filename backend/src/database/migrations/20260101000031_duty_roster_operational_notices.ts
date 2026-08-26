import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.22 (TODO.md Batch 21, items 83-86).
//
//   83. Five new `privilege_type` values on the EXISTING
//       `responsibility_assignments` table, not a parallel duty-roster
//       table — that table's `effective_from`/`effective_to` already IS a
//       duty window (a shift), and `substitute_user_id` already IS the
//       backup/acting-authority concept the BRD asks for. Building a
//       second table alongside it would duplicate exactly the shape this
//       item explicitly says to build on top of.
//   84. No schema of its own — coverage validation and the escalation-
//       resolution chain (service.ts's resolveDutyAuthority) are pure
//       read-side logic over the existing table plus `user_roles`.
//   85. No schema of its own — utils/notify.ts gains
//       notifyOccupantsInScope, a population-targeted sibling to the
//       existing role-targeted notifyCampusStaff.
//   86. `operational_notices` + `operational_notice_acknowledgements` —
//       delivery vs. acknowledgement kept genuinely distinct (a row is
//       created — "delivered" — the moment a notice is published to a
//       resident; `acknowledged_at` only gets set by their own explicit
//       action). `superseded_by` is a self-reference so an urgent update
//       replaces a notice's *current* meaning without erasing the
//       original — LAW-33's own wording.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT responsibility_assignments_privilege_type_check');
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN (
        'attendance_taker', 'verifier', 'room_head', 'floor_incharge',
        'duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact'
      ))
  `);

  await knex.schema.withSchema('hostel').createTable('operational_notices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.string('title', 200).notNullable();
    t.text('body').nullable();
    t.string('severity', 10).notNullable().defaultTo('normal');
    t.boolean('requires_acknowledgement').notNullable().defaultTo(false);
    t.uuid('published_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('published_at').notNullable().defaultTo(knex.fn.now());
    t.uuid('superseded_by').nullable().references('id').inTable('hostel.operational_notices');
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check("?? IN ('normal', 'critical')", ['severity']);
    t.index(['org_id', 'campus_id', 'scope_type', 'scope_id']);
  });
  await knex.raw('ALTER TABLE hostel.operational_notices ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY operational_notices_isolation ON hostel.operational_notices
      FOR ALL TO hostel_app
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);

  await knex.schema.withSchema('hostel').createTable('operational_notice_acknowledgements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('notice_id').notNullable().references('id').inTable('hostel.operational_notices');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('delivered_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('acknowledged_at').nullable();
    t.timestamps(true, true);
    t.unique(['notice_id', 'student_id']);
    t.index(['org_id', 'campus_id', 'student_id']);
  });
  await knex.raw('ALTER TABLE hostel.operational_notice_acknowledgements ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY operational_notice_acknowledgements_isolation ON hostel.operational_notice_acknowledgements
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
  await knex.schema.withSchema('hostel').dropTableIfExists('operational_notice_acknowledgements');
  await knex.schema.withSchema('hostel').dropTableIfExists('operational_notices');

  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT responsibility_assignments_privilege_type_check');
  await knex.raw(`
    UPDATE hostel.responsibility_assignments
    SET status = 'revoked'
    WHERE privilege_type IN ('duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact')
  `);
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN ('attendance_taker', 'verifier', 'room_head', 'floor_incharge'))
  `);
}
