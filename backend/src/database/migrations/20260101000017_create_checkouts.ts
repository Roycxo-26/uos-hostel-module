import type { Knex } from 'knex';

// UOS HOSTEL BR.md §10 (Fees, Damage, Clearance and Checkout) — TODO.md
// Batch 7, UOS-136, the last of the six BR-HOS capability domains.
// ux-flow.md §3.3/§9.4's checkout flow is the exact shape this follows:
// initiate -> inspection -> (damage found?) -> clearances -> approve
// (normal if all clear, override + Head Warden if not) -> bed released.
//
// Deliberate architecture note, since flow.md §6.1 earlier speculated Bed
// would need new CHECKOUT_PENDING/INSPECTION statuses once this got built:
// having actually built it, that widening turned out to be unnecessary —
// same simplification Transfer already established for the OLD bed's fate
// (available or blocked, chosen at completion). The bed just stays
// 'occupied' through the whole checkout process; no new BedStatus values
// added here. flow.md is updated to reflect the actual decision, not the
// earlier speculation.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('checkouts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.uuid('allocation_id').notNullable().references('id').inTable('hostel.allocations');
    t.uuid('bed_id').notNullable().references('id').inTable('hostel.beds');
    t.string('reason', 500).notNullable();
    t.string('status', 20).notNullable().defaultTo('requested');
    t.string('inspection_notes', 2000);
    t.boolean('damage_found').notNullable().defaultTo(false);
    t.decimal('damage_charge_amount', 10, 2);
    t.string('damage_description', 1000);
    t.boolean('damage_disputed').notNullable().defaultTo(false);
    t.string('dispute_reason', 1000);
    // Stopgap manual confirmation — same reasoning as movement_requests'
    // staff-recorded exit/entry: no live Desk/Finance integration exists,
    // so a human confirms what those systems would otherwise report.
    t.boolean('desk_cleared').notNullable().defaultTo(false);
    t.boolean('finance_cleared').notNullable().defaultTo(false);
    t.string('override_reason', 500); // set only when approved despite incomplete clearances
    t.uuid('approved_by').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('approved_at');
    t.string('bed_outcome', 20); // 'available' | 'blocked' — set at completion
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'status']);
    t.check("?? IN ('requested','inspected','completed','cancelled')", ['status']);
    t.check("?? IS NULL OR ?? IN ('available','blocked')", ['bed_outcome', 'bed_outcome']);
  });

  // BR §11 rule 2: one active checkout per allocation.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_one_active_checkout_per_allocation
      ON hostel.checkouts (allocation_id)
      WHERE status IN ('requested', 'inspected')
  `);

  await knex.raw('ALTER TABLE hostel.checkouts ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY checkouts_isolation ON hostel.checkouts
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
  await knex.schema.withSchema('hostel').dropTableIfExists('checkouts');
}
