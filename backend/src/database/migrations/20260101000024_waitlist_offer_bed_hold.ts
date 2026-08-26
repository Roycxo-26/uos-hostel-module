import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.03 (TODO.md Batch 14, items 53-58) — the gap
// ledger's own #1 priority: the direct-assign flow (migration 5) works day
// to day but has no waitlist, no bed-hold concept, and no real offer/accept
// step behind it. Three new tables + a widened allocation status enum.
//
//   53. `waitlist_entries` — one row per application waiting for a bed.
//       `rank` is deliberately NOT a stored column: a persisted rank goes
//       stale the instant another entry is added/withdrawn/re-scored, and
//       "re-ranking on capacity change" (the gap ledger's own requirement)
//       is trivially true for a computed value and a real bug risk for a
//       stored one. service.ts computes it at read time instead
//       (ROW_NUMBER() OVER (ORDER BY priority_score DESC, created_at ASC)).
//   54. `bed_holds` — the six BRD hold types. One active (unreleased) hold
//       per bed, enforced the same way this whole schema enforces every
//       other "only one active X" rule: a partial unique index, not
//       application-level locking.
//   55. `allocation_offers` — the missing "propose a bed, resident accepts
//       or declines within a deadline" step. `allocations.status` already
//       defined 'proposed'/'bed_locked'/'confirmed' (migration 5) but
//       nothing ever transitioned through them — accepting an offer now
//       does, for real, as distinct audited transitions (see service.ts).
//   56. No new column — the no-bed reason taxonomy is a pure application
//       classifier over existing bed/room data (see service.ts's
//       classifyNoBedReason), nothing to persist.
//   58. Four more allocation states this migration widens the check
//       constraint for: 'no_show_warning' (+ `no_show_warned_at`, same
//       idempotency pattern as movement_requests.return_reminder_sent_at),
//       'cancelled_by_resident', 'deferred', 'reassigned'.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('waitlist_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('application_id').notNullable().references('id').inTable('hostel.hostel_applications');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    // Denormalized from the application's own preferences at entry-creation
    // time — nullable, since a student may not have named a specific
    // hostel preference; a null-hostel entry is scoped campus-wide instead.
    t.uuid('hostel_id').nullable().references('id').inTable('hostel.hostels');
    t.decimal('priority_score', 10, 2).notNullable().defaultTo(0);
    t.string('status', 20).notNullable().defaultTo('active');
    t.text('notes').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('active','offered','expired','withdrawn','fulfilled')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });
  // One ACTIVE waitlist entry per application — re-joining after a withdraw
  // is a fresh entry (fresh created_at, fresh FIFO position), not a reused
  // row, so history of prior withdrawals stays intact rather than being
  // overwritten.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_waitlist_entry_per_application
      ON hostel.waitlist_entries (application_id)
      WHERE status IN ('active', 'offered')
  `);

  await knex.schema.withSchema('hostel').createTable('bed_holds', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('bed_id').notNullable().references('id').inTable('hostel.beds');
    t.string('hold_type', 20).notNullable();
    // Polymorphic reference (which offer/transfer/etc. created this hold) —
    // deliberately not a hard FK: the referenced table varies by hold_type,
    // and some hold types (policy_reservation) have no referenced row at
    // all, just a staff reason.
    t.string('reference_type', 20).nullable();
    t.uuid('reference_id').nullable();
    t.uuid('held_by').references('user_id').inTable('hostel.shadow_users');
    t.text('reason').nullable();
    t.timestamp('expires_at').nullable();
    t.timestamp('released_at').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('recommendation','offer','accepted_offer','transfer','emergency','policy_reservation')", ['hold_type']);
    t.index(['org_id', 'campus_id', 'bed_id']);
  });
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_hold_per_bed
      ON hostel.bed_holds (bed_id)
      WHERE released_at IS NULL
  `);

  await knex.schema.withSchema('hostel').createTable('allocation_offers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('application_id').notNullable().references('id').inTable('hostel.hostel_applications');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('bed_id').notNullable().references('id').inTable('hostel.beds');
    t.uuid('bed_hold_id').nullable().references('id').inTable('hostel.bed_holds');
    t.uuid('offered_by').references('user_id').inTable('hostel.shadow_users');
    t.string('status', 20).notNullable().defaultTo('pending');
    t.timestamp('accept_deadline').notNullable();
    t.timestamp('decided_at').nullable();
    t.text('decline_reason').nullable();
    t.timestamps(true, true);
    t.check("?? IN ('pending','accepted','declined','expired','withdrawn')", ['status']);
    t.index(['org_id', 'campus_id', 'status']);
  });
  // One pending offer per bed and per application at a time — the same
  // concurrency discipline as everywhere else in this schema (see
  // uq_one_active_allocation_per_bed/student, migration 5).
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_pending_offer_per_bed
      ON hostel.allocation_offers (bed_id)
      WHERE status = 'pending'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_pending_offer_per_application
      ON hostel.allocation_offers (application_id)
      WHERE status = 'pending'
  `);

  for (const table of ['waitlist_entries', 'bed_holds', 'allocation_offers']) {
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

  // --- 58. Four more allocation states ----------------------------------
  const row = await knex('pg_constraint')
    .select('conname')
    .whereRaw("conrelid = 'hostel.allocations'::regclass")
    .andWhere('contype', 'c')
    .andWhereRaw("pg_get_constraintdef(oid) ILIKE '%status%'")
    .first();
  if (!row) throw new Error('Could not find the status CHECK constraint on hostel.allocations — inspect pg_constraint manually before proceeding');
  await knex.raw(`ALTER TABLE hostel.allocations DROP CONSTRAINT ??`, [row.conname]);
  await knex.raw(`
    ALTER TABLE hostel.allocations
      ADD CONSTRAINT allocations_status_check
      CHECK (status IN (
        'proposed','bed_locked','confirmed','awaiting_check_in','checked_in_active',
        'no_show_review','released','extended_hold','transfer_pending','checkout_pending','ended',
        'no_show_warning','cancelled_by_resident','deferred','reassigned'
      ))
  `);

  await knex.schema.withSchema('hostel').alterTable('allocations', (t) => {
    t.timestamp('no_show_warned_at').nullable();
    t.uuid('bed_hold_id').nullable().references('id').inTable('hostel.bed_holds');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('allocations', (t) => {
    t.dropColumn('bed_hold_id');
    t.dropColumn('no_show_warned_at');
  });
  await knex.raw('ALTER TABLE hostel.allocations DROP CONSTRAINT allocations_status_check');
  await knex.raw(`
    UPDATE hostel.allocations SET status = 'released'
    WHERE status IN ('no_show_warning','cancelled_by_resident','deferred','reassigned')
  `);
  await knex.raw(`
    ALTER TABLE hostel.allocations
      ADD CONSTRAINT allocations_status_check
      CHECK (status IN ('proposed','bed_locked','confirmed','awaiting_check_in','checked_in_active','no_show_review','released','extended_hold','transfer_pending','checkout_pending','ended'))
  `);

  await knex.schema.withSchema('hostel').dropTableIfExists('allocation_offers');
  await knex.schema.withSchema('hostel').dropTableIfExists('bed_holds');
  await knex.schema.withSchema('hostel').dropTableIfExists('waitlist_entries');
}
