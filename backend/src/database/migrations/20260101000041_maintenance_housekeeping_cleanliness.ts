import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.08 (TODO.md Batch 29, items 116-119). Source
// spec'd from "HOSTEL - v.1.md" §16 — not BR.md, which only names this
// capability in passing. §16.1's own service-ownership table draws a hard
// line this migration respects: D17 owns Floor Warden pre-verification and
// room/bed operational-block decisions; D22 (Desk) owns the actual ticket
// lifecycle/SLA; D13 owns facility work orders and asset history. None of
// D22/D13 exist in this standalone build, so §16.8's own named fallback
// applies: D17 runs a LOCAL_FALLBACK ticket itself, displayed as such,
// "must not fabricate a D22 ticket or D13 work-order completion."
//
// Two tables this batch does NOT duplicate, found by checking first:
// Batch 19's sanitation_inspections already scores COMMON-AREA cleanliness
// (washroom/corridor/etc.) — cleanliness_inspections below is deliberately
// narrowed to 'room'/'washroom' (a resident's own room), the one §16.6
// object that table doesn't cover. Batch 19's pest_control_treatments
// already models §16.5's "pest-control task" end to end (finding ->
// scheduled -> treated -> reinspected, with its own recurrence_of); this
// migration does not add a housekeeping task_type for it.
//
//   116. `maintenance_tickets` — the LOCAL_FALLBACK ticket + Floor Warden
//        verification decision, one row (D22 doesn't exist to split the
//        two across). Emergency/safety-critical categories bypass
//        verification per §16.4's own mandatory rule (enforced in
//        service.ts, not schema). `duplicate_of_ticket_id` is a manual
//        staff link, not automatic fuzzy-match detection (§16.4: "may
//        suggest merge/link but cannot silently discard a report" — this
//        build never auto-discards anything either way).
//   117. `housekeeping_tasks` — schedule/template/assignment/checklist/
//        missed/rework/supervisor-inspection. `room_entry_id` links to
//        Batch 18's room_entries (purpose already had a
//        'scheduled_housekeeping' value, unused until now) rather than
//        modelling room-access permission a second time.
//   118. `cleanliness_inspections` — see the note above on why this is
//        room/washroom-scoped, not a common-area duplicate.
//   119. No new table — §16.7's composite gate is computed, not stored
//        (see maintenance/types.ts's computeRoomReadiness). Nothing to
//        migrate for it.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('maintenance_tickets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('room_id').nullable().references('id').inTable('hostel.rooms');
    t.text('location_note').nullable();
    t.uuid('raised_by').notNullable();
    t.string('category', 30).notNullable();
    t.text('description').notNullable();
    t.string('priority', 10).notNullable().defaultTo('normal');
    t.boolean('is_emergency').notNullable().defaultTo(false);
    t.text('evidence_photo_url').nullable();
    t.string('status', 30).notNullable().defaultTo('reported');
    t.boolean('verification_required').notNullable().defaultTo(true);
    t.uuid('verifier_user_id').nullable();
    t.timestamp('verified_at').nullable();
    t.string('verification_decision', 20).nullable();
    t.text('verification_reason').nullable();
    t.uuid('duplicate_of_ticket_id').nullable();
    t.uuid('assigned_to_user_id').nullable();
    t.text('assigned_to_provider').nullable();
    t.text('manual_external_reference').nullable();
    t.date('due_date').nullable();
    t.text('resolution_notes').nullable();
    t.text('resolution_evidence_url').nullable();
    t.timestamp('resolved_at').nullable();
    t.uuid('resolved_by').nullable();
    t.timestamp('resident_confirmed_at').nullable();
    t.text('reopen_reason').nullable();
    t.text('cancelled_reason').nullable();
    t.boolean('is_local_fallback').notNullable().defaultTo(true);
    // §16.3/16.4 SLA-breach escalation — idempotent flag, same shape as
    // transfer_requests.restoration_blocked_at, so the sweep job never
    // re-escalates (or re-notifies) the same ticket twice.
    t.timestamp('sla_escalated_at').nullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('electrical','plumbing','water_supply','furniture','room_appliance','washroom','housekeeping','pest_control','internet_it','security','access_credential','food_mess_service','safety_emergency','common_area_issue','other')",
      ['category']
    );
    t.check("?? IN ('low', 'normal', 'high', 'critical')", ['priority']);
    t.check(
      `?? IN (
        'reported', 'pending_verification', 'returned_for_information', 'rejected', 'verified',
        'emergency_routed', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened', 'cancelled'
      )`,
      ['status']
    );
    t.check("?? IS NULL OR ?? IN ('approved', 'returned', 'rejected')", ['verification_decision', 'verification_decision']);
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['room_id']);
  });
  await knex.raw(`
    ALTER TABLE hostel.maintenance_tickets
      ADD CONSTRAINT maintenance_tickets_duplicate_of_foreign
      FOREIGN KEY (duplicate_of_ticket_id) REFERENCES hostel.maintenance_tickets(id)
  `);

  await knex.schema.withSchema('hostel').createTable('housekeeping_tasks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('scope_type', 10).notNullable();
    t.uuid('scope_id').notNullable();
    t.string('task_type', 30).notNullable();
    t.date('scheduled_date').notNullable();
    t.uuid('assigned_to_user_id').nullable();
    t.text('preferred_time').nullable();
    t.uuid('room_entry_id').nullable().references('id').inTable('hostel.room_entries');
    t.jsonb('checklist').nullable();
    t.string('status', 20).notNullable().defaultTo('scheduled');
    t.timestamp('completed_at').nullable();
    t.uuid('completed_by').nullable();
    t.text('missed_reason').nullable();
    t.uuid('rework_of_task_id').nullable();
    t.text('consumable_request_reference').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'floor', 'hostel')", ['scope_type']);
    t.check("?? IN ('daily', 'weekly', 'monthly', 'checkout_deep_clean')", ['task_type']);
    t.check("?? IN ('scheduled', 'in_progress', 'completed', 'missed', 'rework_required', 'cancelled')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['scope_type', 'scope_id']);
  });
  await knex.raw(`
    ALTER TABLE hostel.housekeeping_tasks
      ADD CONSTRAINT housekeeping_tasks_rework_of_foreign
      FOREIGN KEY (rework_of_task_id) REFERENCES hostel.housekeeping_tasks(id)
  `);

  await knex.schema.withSchema('hostel').createTable('cleanliness_inspections', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('area_type', 20).notNullable();
    // Polymorphic (room_id for both 'room' and 'washroom' — an attached
    // washroom shares its room's id, same reasoning resident_privilege_
    // changes.linked_reference_id already uses for a cross-domain pointer
    // this table can't itself enforce a single FK target for).
    t.uuid('scope_id').notNullable();
    t.uuid('housekeeping_task_id').nullable().references('id').inTable('hostel.housekeeping_tasks');
    t.uuid('inspector_user_id').notNullable();
    t.timestamp('inspected_at').notNullable().defaultTo(knex.fn.now());
    t.integer('cleanliness_score').notNullable();
    t.boolean('waste_segregation_ok').nullable();
    t.boolean('prohibited_accumulation_flag').notNullable().defaultTo(false);
    t.boolean('safety_hazard_flag').notNullable().defaultTo(false);
    // §16.6: "A maintenance defect must not unfairly reduce a resident
    // cleanliness score when it is institution-owned and unresolved." This
    // build records the flag as evidence rather than algorithmically
    // adjusting the stored score — the actual scoring/rewards algorithm is
    // D17.15 (TODO.md Batch 30, not yet built), named as the real
    // consumer of this flag once it exists.
    t.boolean('maintenance_defect_noted').notNullable().defaultTo(false);
    t.text('maintenance_defect_notes').nullable();
    t.text('energy_water_notes').nullable();
    t.text('resident_participation_notes').nullable();
    t.text('photo_url').nullable();
    t.text('resident_comments').nullable();
    t.date('correction_deadline').nullable();
    t.uuid('reinspection_of_id').nullable();
    t.string('appeal_status', 20).notNullable().defaultTo('none');
    t.text('appeal_reason').nullable();
    t.uuid('appeal_decided_by').nullable();
    t.timestamp('appeal_decided_at').nullable();
    t.text('appeal_decision_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('room', 'washroom')", ['area_type']);
    t.check('?? BETWEEN 1 AND 5', ['cleanliness_score']);
    t.check("?? IN ('none', 'appealed', 'upheld', 'overturned')", ['appeal_status']);
    t.index(['org_id', 'campus_id', 'area_type', 'scope_id']);
  });
  await knex.raw(`
    ALTER TABLE hostel.cleanliness_inspections
      ADD CONSTRAINT cleanliness_inspections_reinspection_of_foreign
      FOREIGN KEY (reinspection_of_id) REFERENCES hostel.cleanliness_inspections(id)
  `);

  for (const table of ['maintenance_tickets', 'housekeeping_tasks', 'cleanliness_inspections']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('cleanliness_inspections');
  await knex.schema.withSchema('hostel').dropTableIfExists('housekeeping_tasks');
  await knex.schema.withSchema('hostel').dropTableIfExists('maintenance_tickets');
}
