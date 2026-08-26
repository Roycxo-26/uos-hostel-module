import type { Knex } from 'knex';

// UOS HOSTEL BR.md §7 (Transfer/Relocation) — TODO.md Batch 3, the second
// half of UOS-133 (Check-In/Occupancy/Transfer — the first half was built
// long before this table existed). flow.md §6.5.
//
// Deliberately reuses the existing `allocations` and `checkins` tables
// rather than inventing parallel ones:
//   - `allocations.status` has carried 'transfer_pending' and 'ended' since
//     the very first migration, unused until now — this is what actually
//     puts them to use, the same kind of pre-existing-but-dormant column
//     the no-show job (migration 10 / jobs/expireNoShowAllocations.ts)
//     found and activated for 'no_show_review'.
//   - BR §7's "new-room inventory handover" is structurally identical to
//     Check-In's undertaking/condition-notes/photos — completing a
//     transfer writes a new `checkins` row against the new allocation,
//     reusing that table instead of a parallel "handover" concept.
//
// Status enum is collapsed from flow.md §6.5's finer states
// (NewBedReserved/Handover/AtomicSwitch/OldRoomInspection all become one
// 'completed' transition) — same collapsing precedent as
// createAllocation/createCheckIn already established for their own source
// state machines.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('transfer_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('current_allocation_id').notNullable().references('id').inTable('hostel.allocations');
    t.uuid('old_bed_id').notNullable().references('id').inTable('hostel.beds');
    t.uuid('new_bed_id').references('id').inTable('hostel.beds'); // chosen at decide time, not request time — mirrors Allocation's own request/decide split
    t.uuid('new_allocation_id').references('id').inTable('hostel.allocations'); // set once executed
    t.string('reason', 500).notNullable();
    // BR §7: "Emergency relocation: authorized role + reason + temporary
    // destination + retrospective review deadline." Not a separate table —
    // one Transfer/Relocation domain with a type flag, matching how the BR
    // itself presents normal transfer and emergency relocation as two
    // variants of the same §7 flow, not two systems.
    t.string('transfer_type', 20).notNullable().defaultTo('normal');
    t.timestamp('retrospective_review_deadline'); // required for transfer_type='emergency', enforced in the service layer
    t.string('status', 20).notNullable().defaultTo('requested');
    t.string('decision_reason', 500);
    t.uuid('decided_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('decided_at');
    t.uuid('executed_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('executed_at');
    t.string('old_room_inspection_notes', 1000);
    t.string('old_bed_outcome', 20); // 'available' | 'blocked' — set at execute time
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'status']);
    t.check("?? IN ('requested','approved','rejected','cancelled','completed')", ['status']);
    t.check("?? IN ('normal','emergency')", ['transfer_type']);
  });

  // BR §11 rule 2: "Duplicate active... transfer... requests must be
  // rejected... without creating a second business action." One
  // in-flight transfer per allocation at a time.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_transfer_per_allocation
      ON hostel.transfer_requests (current_allocation_id)
      WHERE status IN ('requested', 'approved')
  `);

  await knex.raw('ALTER TABLE hostel.transfer_requests ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY transfer_requests_isolation ON hostel.transfer_requests
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
  await knex.schema.withSchema('hostel').dropTableIfExists('transfer_requests');
}
