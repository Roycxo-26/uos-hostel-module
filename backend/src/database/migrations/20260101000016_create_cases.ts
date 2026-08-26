import type { Knex } from 'knex';

// UOS HOSTEL BR.md §9 (Complaint/Incident/Discipline Flow) — TODO.md Batch
// 6, UOS-135. One `cases` table for both Complaints and Incidents — the BR
// itself uses one merged state machine for both (§9's flowchart doesn't
// fork by case_type), same collapsing precedent as Transfer's
// normal/emergency and Movement's gate_pass/leave. `case_type` is a
// reporting flag, not a behavioral fork. Matches ux-flow.md §1's Screen Map
// ("Hostel Complaint" + "Incident Report" as two forms over one tracker).
//
// Status enum collapses flow.md §6.8's finer states (Triaged is folded
// into the single 'assigned' transition, matching how createAllocation
// already collapses Proposed/BedLocked/Confirmed into one write):
//   reported -> assigned -> in_progress -> resolved -> closed -> reopened
//                                        -> notice_issued -> decided -> appealed -> decided (loop) -> resolved
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('cases', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('reporter_user_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('case_type', 20).notNullable().defaultTo('complaint');
    t.string('category', 100).notNullable();
    t.string('description', 2000).notNullable();
    t.uuid('room_id').references('id').inTable('hostel.rooms'); // BR §9: "location auto-fill" — optional, not every case is room-specific
    t.string('severity', 10); // null until triaged
    // BR §16 controls: "guardian, welfare, discipline and emergency
    // information is specially restricted." Visibility enforced in
    // cases/service.ts, not by RLS alone — RLS is org/campus scope, this is
    // a finer per-record rule on top of it.
    t.boolean('confidential').notNullable().defaultTo(false);
    t.string('status', 20).notNullable().defaultTo('reported');
    t.uuid('assigned_to').references('user_id').inTable('hostel.shadow_users');
    t.jsonb('evidence').notNullable().defaultTo('[]'); // same stopgap reference-array pattern as applications.attachments
    t.string('investigation_notes', 2000);
    t.string('notice_text', 1000); // BR §9: "notice and fair response opportunity" before a disciplinary decision
    t.string('decision_outcome', 20); // 'upheld' | 'dismissed' | 'other'
    t.string('decision_reason', 1000);
    t.uuid('decided_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('decided_at');
    t.string('appeal_reason', 1000);
    // BR §15: "UOS-151 Desk; Hostel retains resident/room context." No live
    // Desk integration exists — stopgap reference, same reasoning as every
    // other cross-module stub in this codebase (see README's known gaps).
    t.jsonb('desk_ticket_reference');
    t.string('reopen_reason', 500);
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'status']);
    t.check(
      "?? IN ('reported','assigned','in_progress','resolved','notice_issued','decided','appealed','closed','reopened')",
      ['status']
    );
    t.check("?? IN ('complaint','incident')", ['case_type']);
    t.check("?? IS NULL OR ?? IN ('low','medium','high','critical')", ['severity', 'severity']);
    t.check("?? IS NULL OR ?? IN ('upheld','dismissed','other')", ['decision_outcome', 'decision_outcome']);
  });

  await knex.raw('ALTER TABLE hostel.cases ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY cases_isolation ON hostel.cases
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
  await knex.schema.withSchema('hostel').dropTableIfExists('cases');
}
