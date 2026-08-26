import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.19 (TODO.md Batch 19, items 75-78) — the gap
// ledger's own flag: "no existing master data to build on," unlike every
// other batch so far. Five tables, genuinely from scratch.
//
//   75. `common_areas` — a master the Structure hierarchy has nothing like
//       today (hostels/blocks/floors/rooms/beds has no concept of a
//       shared washroom, study room, corridor…).
//   76. `sanitation_inspections` — scored inspection of a common area,
//       distinct from a resident room's own cleanliness/condition record.
//   77. `utility_outages` + `utility_outage_updates` — the outage
//       lifecycle needs two tables, not one: LAW-32's "ETA changes create
//       new update episodes; old promises remain auditable" means an ETA
//       revision can't just overwrite the old value in place, or the
//       audit trail this law requires wouldn't exist.
//   78. `pest_control_treatments` — finding through reinspection, with
//       `recurrence_of` a self-reference rather than its own status value
//       (a NEW finding pointing back at a prior closed one is what
//       "recurrence" means here, not a status on one row).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('common_areas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('hostel_id').notNullable().references('id').inTable('hostel.hostels');
    t.uuid('floor_id').nullable().references('id').inTable('hostel.floors');
    t.string('area_type', 30).notNullable();
    t.string('name', 120).notNullable();
    t.string('status', 20).notNullable().defaultTo('operational');
    t.text('opening_hours').nullable();
    t.integer('capacity').nullable();
    t.text('permitted_population').nullable();
    t.text('cleaning_schedule').nullable();
    t.date('next_inspection_date').nullable();
    t.text('safety_restriction').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('washroom','bathing_area','corridor','drinking_water','study_room','recreation','gym','terrace','common_kitchen','laundry_area','visitor_waiting','prayer_room','garden','lift','other')",
      ['area_type']
    );
    t.check("?? IN ('operational', 'closed', 'under_maintenance')", ['status']);
    t.index(['org_id', 'campus_id', 'hostel_id']);
  });

  await knex.schema.withSchema('hostel').createTable('sanitation_inspections', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('common_area_id').notNullable().references('id').inTable('hostel.common_areas');
    t.uuid('inspected_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('inspected_at').notNullable().defaultTo(knex.fn.now());
    t.integer('cleanliness_score').notNullable();
    t.boolean('odour_ventilation_ok').notNullable().defaultTo(true);
    t.boolean('water_availability_ok').notNullable().defaultTo(true);
    t.boolean('drainage_ok').notNullable().defaultTo(true);
    t.boolean('consumables_available').nullable();
    t.text('fixture_condition_notes').nullable();
    t.boolean('lighting_ok').notNullable().defaultTo(true);
    t.boolean('accessibility_ok').notNullable().defaultTo(true);
    t.text('waste_bin_condition').nullable();
    t.boolean('pest_indicator').notNullable().defaultTo(false);
    t.boolean('privacy_latch_ok').notNullable().defaultTo(true);
    t.text('safety_hazard_notes').nullable();
    t.text('photo_url').nullable();
    t.boolean('corrective_action_needed').notNullable().defaultTo(false);
    t.text('corrective_action_notes').nullable();
    t.string('status', 20).notNullable().defaultTo('passed');
    t.uuid('reinspection_of').nullable().references('id').inTable('hostel.sanitation_inspections');
    t.timestamps(true, true);
    t.check("?? BETWEEN 1 AND 5", ['cleanliness_score']);
    t.check("?? IN ('passed', 'failed', 'needs_reinspection')", ['status']);
    t.index(['org_id', 'campus_id', 'common_area_id']);
  });

  await knex.schema.withSchema('hostel').createTable('utility_outages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('hostel_id').notNullable().references('id').inTable('hostel.hostels');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.string('outage_type', 30).notNullable();
    t.string('severity', 10).notNullable().defaultTo('minor');
    t.string('status', 20).notNullable().defaultTo('reported');
    t.integer('affected_population_count').nullable();
    t.text('alternative_arrangement').nullable();
    t.uuid('reported_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('reported_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('estimated_restoration_at').nullable();
    t.timestamp('restored_at').nullable();
    t.uuid('verified_by').nullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('verified_at').nullable();
    t.text('closure_notes').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check(
      "?? IN ('water_shortage','drinking_water','hot_water','electricity','generator_backup','lift','internet','sewage_drainage','sanitation_closure','gas_fuel','other')",
      ['outage_type']
    );
    t.check("?? IN ('minor', 'major', 'critical')", ['severity']);
    t.check("?? IN ('reported', 'notified', 'restored', 'verified', 'closed')", ['status']);
    t.index(['org_id', 'campus_id', 'hostel_id', 'status']);
  });

  // LAW-32 gap-closure: ETA/status changes create new episodes, they don't
  // overwrite the promise a resident already saw.
  await knex.schema.withSchema('hostel').createTable('utility_outage_updates', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('outage_id').notNullable().references('id').inTable('hostel.utility_outages');
    t.string('update_type', 20).notNullable();
    t.text('old_value').nullable();
    t.text('new_value').nullable();
    t.uuid('updated_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamps(true, true);
    t.check("?? IN ('eta_change', 'status_change', 'note')", ['update_type']);
    t.index(['org_id', 'campus_id', 'outage_id']);
  });

  await knex.schema.withSchema('hostel').createTable('pest_control_treatments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('scope_type', 15).notNullable();
    t.uuid('scope_id').notNullable();
    t.text('finding_notes').notNullable();
    t.text('treatment_method').nullable();
    t.text('chemical_reference').nullable();
    t.string('status', 20).notNullable().defaultTo('finding_reported');
    t.timestamp('scheduled_at').nullable();
    t.timestamp('resident_notified_at').nullable();
    t.timestamp('treated_at').nullable();
    t.timestamp('re_entry_safe_at').nullable();
    t.timestamp('reinspected_at').nullable();
    t.text('reinspection_result').nullable();
    t.uuid('recurrence_of').nullable().references('id').inTable('hostel.pest_control_treatments');
    t.uuid('created_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamps(true, true);
    t.check("?? IN ('room', 'common_area', 'floor', 'hostel')", ['scope_type']);
    t.check("?? IN ('finding_reported', 'scheduled', 'resident_notified', 'treated', 'reinspected', 'closed')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });

  for (const table of ['common_areas', 'sanitation_inspections', 'utility_outages', 'utility_outage_updates', 'pest_control_treatments']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('pest_control_treatments');
  await knex.schema.withSchema('hostel').dropTableIfExists('utility_outage_updates');
  await knex.schema.withSchema('hostel').dropTableIfExists('utility_outages');
  await knex.schema.withSchema('hostel').dropTableIfExists('sanitation_inspections');
  await knex.schema.withSchema('hostel').dropTableIfExists('common_areas');
}
