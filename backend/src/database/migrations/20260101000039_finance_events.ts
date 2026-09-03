import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.05 (TODO.md Batch 27, items 108-110). The
// first genuinely net-new module built this session (Batch 25/26 both
// extended an existing module) — see README/HOSTEL-GAP-ANALYSIS.md's own
// note that D17.05 is one of the three largest pre-existing gaps.
//
//   108. `financial_events` — one table, one catalogue (hostel fee,
//        deposit, mess-fee reference, lost-key charge, late fee, damage
//        charge, waiver, refund). A financial-status PROJECTION, not a
//        ledger of record — BR-HOS-014 / BR.md line 349: "Hostel may
//        propose a charge but cannot fabricate payment confirmation." So
//        every event carries both a `status` (proposed -> finance_
//        confirmed, or disputed/reversed) and a `source` (hostel_manual vs
//        finance_authoritative) — see item 109.
//   109. The manual-evidence-vs-Finance-authoritative distinction is this
//        table's `source` column plus the propose/confirm split itself:
//        raising an event (any staff with finance_event:manage) always
//        starts `source='hostel_manual'`/`status='proposed'`; only a
//        distinct confirm action (finance_event:confirm — Head Warden, or
//        a standing Finance Officer responsibility holder, see below) can
//        move it to `source='finance_authoritative'`/`status=
//        'finance_confirmed'`. No live Finance system exists to call, so
//        confirm is a DEV-SIMULATED stand-in for the webhook/API
//        confirmation a real integration would eventually send — same
//        "named, not faked" reasoning as the guardian OTP simulation
//        (Batch 23). Checkout's own `finance_cleared` boolean is
//        deliberately NOT deleted/replaced by this table outright — see
//        TODO.md Batch 27's own write-up for why that's a named scope
//        boundary, not an oversight.
//   110. Refund/recovery instruction pipeline — 'refund' and 'waiver' are
//        themselves first-class event_types, not a status flag on a
//        charge: staff raises one (an instruction) referencing the
//        original charge via the existing generic linked_reference_type/
//        id columns (same reused-not-duplicated pattern
//        resident_privilege_changes and cases already use for their own
//        cross-domain pointers), and it goes through the exact same
//        propose -> confirm lifecycle as a charge does.
//
// Also widens responsibility_assignments' privilege_type with one new
// standing role, 'finance_officer' — BR.md line 75's own role table names
// a distinct Finance Officer ("post/confirm charge, receipt, deposit,
// refund or waiver result"), and this codebase's established precedent
// (safeguarding roles, Batch 24) is to reuse this table for a standing,
// campus-wide appointment rather than invent a new top-level
// hostel.role_levels role for it.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('financial_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('event_type', 30).notNullable();
    t.decimal('amount', 10, 2).notNullable();
    t.string('status', 20).notNullable().defaultTo('proposed');
    t.string('source', 20).notNullable().defaultTo('hostel_manual');
    t.text('description').notNullable();
    t.text('evidence_notes').nullable();
    // Generic cross-reference — a damage_charge event points back at the
    // checkout that raised it; a waiver/refund points back at the charge
    // event it offsets. Same stopgap shape resident_privilege_changes'
    // linked_reference_type/id already uses.
    t.string('linked_reference_type', 30).nullable();
    t.uuid('linked_reference_id').nullable();
    t.boolean('disputed').notNullable().defaultTo(false);
    t.text('dispute_reason').nullable();
    t.uuid('raised_by').notNullable();
    t.timestamp('raised_at').notNullable().defaultTo(knex.fn.now());
    t.uuid('confirmed_by').nullable();
    t.timestamp('confirmed_at').nullable();
    t.uuid('reversed_by').nullable();
    t.timestamp('reversed_at').nullable();
    t.text('reversal_reason').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('hostel_fee', 'deposit', 'mess_fee_reference', 'lost_key_charge', 'late_fee', 'damage_charge', 'waiver', 'refund')",
      ['event_type']
    );
    t.check("?? IN ('proposed', 'finance_confirmed', 'disputed', 'reversed')", ['status']);
    t.check("?? IN ('hostel_manual', 'finance_authoritative')", ['source']);
    t.index(['org_id', 'campus_id', 'student_id', 'status']);
  });

  await knex.raw('ALTER TABLE hostel.financial_events ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY financial_events_isolation ON hostel.financial_events
      FOR ALL TO hostel_app
      USING (
        org_id::text = current_setting('app.current_org_id', true)
        AND (
          current_setting('app.campus_scope', true) = 'ALL'
          OR campus_id::text = current_setting('app.current_campus_id', true)
        )
      )
  `);

  // --- Finance Officer standing role (reusing responsibility_assignments) --
  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT responsibility_assignments_privilege_type_check');
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN (
        'attendance_taker', 'verifier', 'room_head', 'floor_incharge',
        'duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact',
        'safeguarding_lead', 'safeguarding_deputy', 'welfare_officer', 'counsellor',
        'finance_officer'
      ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE hostel.responsibility_assignments DROP CONSTRAINT IF EXISTS responsibility_assignments_privilege_type_check');
  await knex.raw("DELETE FROM hostel.responsibility_assignments WHERE privilege_type = 'finance_officer'");
  await knex.raw(`
    ALTER TABLE hostel.responsibility_assignments
      ADD CONSTRAINT responsibility_assignments_privilege_type_check
      CHECK (privilege_type IN (
        'attendance_taker', 'verifier', 'room_head', 'floor_incharge',
        'duty_warden', 'floor_duty_officer', 'front_desk_shift', 'security_contact', 'emergency_contact',
        'safeguarding_lead', 'safeguarding_deputy', 'welfare_officer', 'counsellor'
      ))
  `);

  await knex.schema.withSchema('hostel').dropTableIfExists('financial_events');
}
