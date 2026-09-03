import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.13 (TODO.md Batch 30, item 120). "HOSTEL -
// v.1.md" §21 — the first of Batch 30's seven deferred/optional
// entitlement items, worked top to bottom per that batch's own note.
//
// §21.1: "This is an optional feature entitlement." Gated by the new
// enableOffCampusHousing feature flag (settings/types.ts), same pattern as
// every other optional workflow this codebase already flags
// (enableVisitorSlots, enableSports, etc.) — see offCampus/service.ts's
// own comment on §21.4's module-off behaviour.
//
// §21.3: "D17 does not become the external landlord's accounting,
// property-management or legal lease system. It records the university's
// placement, approval and safety/operational references" — every
// contract/lease/safety field below is a text reference, never a modelled
// external record this codebase would have no authority over.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('off_campus_providers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('provider_name', 200).notNullable();
    t.text('address').notNullable();
    t.text('emergency_contact').nullable();
    t.string('compliance_status', 20).notNullable().defaultTo('pending');
    t.text('compliance_notes').nullable();
    t.text('safety_inspection_reference').nullable();
    t.text('default_contract_reference').nullable();
    // §21.2 "provider integration/manual status" — no real external
    // provider system exists to integrate with in this build, so this is
    // always 'manual'; the column exists so a future real integration has
    // somewhere honest to report itself, same reasoning as checkouts'
    // is_local_fallback and visitors' credential simulation.
    t.string('integration_status', 20).notNullable().defaultTo('manual');
    t.uuid('created_by').notNullable();
    t.timestamps(true, true);
    t.check("?? IN ('pending', 'approved', 'expired', 'rejected', 'suspended')", ['compliance_status']);
    t.check("?? IN ('manual', 'integrated')", ['integration_status']);
    t.index(['org_id', 'campus_id', 'compliance_status']);
  });

  await knex.schema.withSchema('hostel').createTable('off_campus_placements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('provider_id').notNullable().references('id').inTable('hostel.off_campus_providers');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('placement_type', 30).notNullable();
    t.string('status', 30).notNullable().defaultTo('requested');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.date('actual_exit_date').nullable();
    t.text('room_bed_reference').nullable();
    t.text('contract_reference').nullable();
    t.text('safety_inspection_reference').nullable();
    t.text('payment_owner_reference').nullable();
    t.uuid('decided_by').nullable();
    t.timestamp('decided_at').nullable();
    t.text('decision_reason').nullable();
    t.timestamp('last_occupancy_confirmed_at').nullable();
    t.date('next_occupancy_confirmation_due').nullable();
    // §21.2 "issue/complaint handoff" — a generic cross-reference, same
    // stopgap shape resident_privilege_changes/financial_events already
    // use for a pointer this table can't itself resolve or own (a Case
    // raised about this placement, if any).
    t.text('issue_handoff_reference').nullable();
    t.uuid('exit_confirmed_by').nullable();
    t.timestamp('exit_confirmed_at').nullable();
    t.text('exit_notes').nullable();
    t.text('cancelled_reason').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('private_accommodation', 'partner_residence', 'visiting_exchange', 'emergency_temporary', 'guest_short_stay', 'summer_vacation', 'overflow')",
      ['placement_type']
    );
    t.check(
      `?? IN (
        'requested', 'under_review', 'approved', 'rejected', 'active',
        'periodic_confirmation_due', 'exit_requested', 'exited', 'cancelled'
      )`,
      ['status']
    );
    t.check('?? > ??', ['end_date', 'start_date']);
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['student_id']);
  });

  for (const table of ['off_campus_providers', 'off_campus_placements']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('off_campus_placements');
  await knex.schema.withSchema('hostel').dropTableIfExists('off_campus_providers');
}
