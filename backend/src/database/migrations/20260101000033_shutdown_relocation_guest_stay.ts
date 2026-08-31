import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.25 (TODO.md Batch 22, items 87-89).
//
//   87. `closure_cases` + `closure_case_impacts` — a bulk case (shutdown OR
//       mass relocation, `case_type` distinguishing them, the same
//       one-table-two-meanings shape Batch 16 already used for planned
//       drill vs. real emergency) with one impact row per affected
//       resident, generalizing jobs/restoreTemporaryRelocations.ts's single-
//       resident atomic bed-switch to many residents with per-resident
//       reconciliation — see closures/service.ts's own comment on why this
//       is a staff-triggered bulk action, not a background sweep (a
//       relocation destination needs a human pick, unlike a temporary
//       relocation's own known return bed).
//   88. `closure_cases.reopening_checklist` (jsonb) — the reopening-
//       readiness gate. `hostels`/`floors`/`rooms` already have a `status`
//       column (Batch 12); what's new is a real check BEFORE a hostel/
//       floor/room scope can move back to 'active' while an open closure
//       case covers it — see structure/service.ts's updateHostel, which
//       now consults closures/repository.ts before allowing a direct
//       status='active' write.
//   89. `beds.bed_category` — 'resident' (default, unchanged for every
//       existing bed) or 'guest_short_stay'. A guest-category bed is
//       excluded from ordinary resident allocation (allocations/service.ts's
//       createAllocation/createOffer now reject it) — its own separate
//       availability pool is the new `guest_stays` table below.
export async function up(knex: Knex): Promise<void> {
  // --- 89. Guest/parent short-stay bed category -------------------------
  await knex.schema.withSchema('hostel').alterTable('beds', (t) => {
    t.string('bed_category', 20).notNullable().defaultTo('resident');
  });
  await knex.raw("ALTER TABLE hostel.beds ADD CONSTRAINT beds_bed_category_check CHECK (bed_category IN ('resident', 'guest_short_stay'))");

  await knex.schema.withSchema('hostel').createTable('guest_stays', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('bed_id').notNullable().references('id').inTable('hostel.beds');
    t.string('guest_name', 200).notNullable();
    t.string('guest_type', 20).notNullable();
    t.text('host_reference').nullable();
    t.text('purpose').nullable();
    t.date('arrival_date').notNullable();
    t.date('departure_date').nullable();
    t.boolean('identity_verified').notNullable().defaultTo(false);
    t.text('fee_reference').nullable();
    t.text('key_reference').nullable();
    t.text('meal_entitlement').nullable();
    t.boolean('policy_acknowledged').notNullable().defaultTo(false);
    t.string('status', 20).notNullable().defaultTo('reserved');
    t.text('checkout_notes').nullable();
    t.uuid('created_by').notNullable();
    t.timestamps(true, true);
    t.check("?? IN ('parent', 'visiting_faculty', 'other')", ['guest_type']);
    t.check("?? IN ('reserved', 'checked_in', 'checked_out', 'cancelled')", ['status']);
    t.index(['org_id', 'campus_id', 'bed_id', 'status']);
  });

  // --- 87/88. Closure cases + per-resident impacts -----------------------
  await knex.schema.withSchema('hostel').createTable('closure_cases', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('hostel_id').notNullable().references('id').inTable('hostel.hostels');
    t.string('case_type', 20).notNullable();
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.string('reason_category', 40).notNullable();
    t.text('reason_notes').nullable();
    t.string('status', 20).notNullable().defaultTo('proposed');
    t.date('planned_start_date').nullable();
    t.date('planned_end_date').nullable();
    t.timestamp('actual_start_date').nullable();
    t.timestamp('actual_end_date').nullable();
    t.text('exception_policy').nullable();
    // 88 — 24I.3's 12-step reopening workflow, collapsed to the 8 steps that
    // are genuinely separate inspectable readiness checks; the remaining
    // steps (Reopening Planned / Approved Reopening / Check-In Reconciliation
    // / Close Reopening Case) ARE this table's own status transitions, not
    // additional checklist items — see closures/validators.ts's
    // REOPENING_CHECKLIST_KEYS for the exact eight.
    t.jsonb('reopening_checklist').nullable();
    t.uuid('proposed_by').notNullable();
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('shutdown', 'mass_relocation')", ['case_type']);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check(`?? IN (
      'semester_vacation', 'maintenance_renovation', 'safety', 'pest_treatment',
      'low_occupancy_consolidation', 'emergency', 'event_operational',
      'water_sanitation_failure', 'structural_work', 'disaster'
    )`, ['reason_category']);
    t.check("?? IN ('proposed', 'approved', 'rejected', 'active_closure', 'reopening_planned', 'reopened', 'completed', 'cancelled')", ['status']);
    t.index(['org_id', 'campus_id', 'hostel_id', 'status']);
    t.index(['org_id', 'campus_id', 'scope_type', 'scope_id', 'status']);
  });

  await knex.schema.withSchema('hostel').createTable('closure_case_impacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('closure_case_id').notNullable().references('id').inTable('hostel.closure_cases');
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable();
    t.uuid('allocation_id').nullable();
    t.uuid('source_bed_id').nullable();
    t.string('outcome', 30).notNullable().defaultTo('pending');
    t.uuid('destination_bed_id').nullable();
    t.uuid('new_allocation_id').nullable();
    t.text('notes').nullable();
    t.timestamp('reconciled_at').nullable();
    t.uuid('reconciled_by').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('pending', 'relocated', 'checked_out', 'on_leave', 'exception_no_destination')", ['outcome']);
    // One impact row per resident per case — re-running the auto-populate
    // step on an already-populated case must not duplicate anyone.
    t.unique(['closure_case_id', 'student_id']);
  });

  for (const table of ['guest_stays', 'closure_cases', 'closure_case_impacts']) {
    await knex.raw(`ALTER TABLE hostel.${table} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY ${table}_isolation ON hostel.${table}
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('closure_case_impacts');
  await knex.schema.withSchema('hostel').dropTableIfExists('closure_cases');
  await knex.schema.withSchema('hostel').dropTableIfExists('guest_stays');

  await knex.raw('ALTER TABLE hostel.beds DROP CONSTRAINT IF EXISTS beds_bed_category_check');
  await knex.schema.withSchema('hostel').alterTable('beds', (t) => {
    t.dropColumn('bed_category');
  });
}
