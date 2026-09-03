import type { Knex } from 'knex';

// HOSTEL-GAP-ANALYSIS.md D17.23 (TODO.md Batch 30, item 124). "HOSTEL
// V1.1.md" §24G / D17-LAW-41. Fourth of Batch 30's seven items.
//
// D17-LAW-41: "D17 may own service-order and resident handoff context
// while D12/D11/D19/Finance retain stock, vendor, wallet and money
// ownership. Lost/damaged-item compensation follows approved financial
// controls." Same boundary this session has held for Finance (Batch 27),
// packages (Batch 28) and Mess (item 123) — this table has no linen-stock
// or vendor-contract columns, and compensation is raised as a real
// financial_events 'refund' row (Batch 27's own table, via repo-to-repo),
// never a parallel wallet write.
//
// §24G.4 lists 11 core states + 9 exception states; this build stores 14,
// folding: BAG_CREATED into 'requested' (a bag/token is data on the
// request, not a separate moment); DROPPED into 'picked_up' (the
// service_type field already distinguishes drop-off from pickup — the
// lifecycle position is the same either way); COUNT_VERIFIED into the
// picked_up->in_process transition itself (service.ts refuses that
// transition until a pickup count is on record, rather than storing a
// separate state for it); NOTIFIED into 'ready_for_return' (marking it
// ready is what triggers the notification, not a separate stored step).
// SLA_BREACH is a timestamp flag (sla_breached_at) plus a sweep job, not a
// status — an order can breach its SLA while sitting in any of several
// statuses, not replace whichever one it was in. PAYMENT_OR_ENTITLEMENT_
// PENDING and VENDOR_EXCEPTION are not modelled as states at all — the
// former is D19/Finance's own gating to do, not D17's (LAW-41 again); the
// latter is captured as free-text notes on whichever real state
// (cancelled/damaged/lost) the exception actually resolves into, named
// rather than invented as a fourth exception bucket with no clear own
// transitions.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('laundry_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.uuid('student_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('service_type', 30).notNullable();
    t.text('pickup_drop_location').nullable();
    t.text('bag_token_id').nullable();
    t.string('status', 30).notNullable().defaultTo('requested');
    t.timestamp('requested_pickup_at').nullable();
    t.timestamp('actual_pickup_at').nullable();
    t.integer('pickup_count').nullable();
    t.decimal('pickup_weight', 8, 2).nullable();
    t.jsonb('item_categories').nullable();
    t.text('condition_exceptions_at_handoff').nullable();
    t.text('provider_reference').nullable();
    t.integer('sla_hours').notNullable().defaultTo(48);
    t.timestamp('sla_breached_at').nullable();
    t.integer('returned_count').nullable();
    t.text('returned_condition_notes').nullable();
    t.timestamp('returned_at').nullable();
    t.timestamp('resident_acknowledged_at').nullable();
    t.text('exception_reason').nullable();
    t.uuid('resolved_by').nullable();
    t.timestamp('resolved_at').nullable();
    t.text('resolution_notes').nullable();
    // §24G.3 "charge/entitlement/wallet reference" / "complaint/service-
    // recovery reference" — both plain text references, per LAW-41 never
    // a real wallet/ledger write and never an auto-linked Case (same
    // "manual reference, not auto-linked" reasoning Batch 28's visitor
    // INCIDENT_REVIEW and Batch 30's off-campus issue-handoff already use).
    t.text('charge_entitlement_reference').nullable();
    t.text('complaint_reference').nullable();
    t.text('cancelled_reason').nullable();
    t.text('reopen_reason').nullable();
    t.uuid('created_by').notNullable();
    t.timestamps(true, true);
    t.check(
      "?? IN ('linen_exchange', 'garment_laundry', 'scheduled_floor_pickup', 'drop_counter', 'token_bag', 'self_service_washer', 'outsourced_vendor', 'emergency_linen_replacement', 'paid_premium')",
      ['service_type']
    );
    t.check(
      `?? IN (
        'requested', 'accepted', 'picked_up', 'in_process', 'ready_for_return', 'returned',
        'resident_acknowledged', 'closed', 'count_dispute', 'lost_item', 'damaged_item',
        'unclaimed_return', 'cancelled', 'reopened'
      )`,
      ['status']
    );
    t.index(['org_id', 'campus_id', 'status']);
    t.index(['student_id']);
  });

  await knex.raw('ALTER TABLE hostel.laundry_orders ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY laundry_orders_isolation ON hostel.laundry_orders
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
  await knex.schema.withSchema('hostel').dropTableIfExists('laundry_orders');
}
