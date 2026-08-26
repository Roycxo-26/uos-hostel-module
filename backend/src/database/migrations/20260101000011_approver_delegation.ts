import type { Knex } from 'knex';

// UOS HOSTEL BR.md §5.2 / flow.md §5A — the missing-approver delegation/
// escalation/bypass framework. TODO.md Batch 2. Built ahead of any consuming
// workflow (Transfer/Gate Pass/Complaints/Checkout — Batches 3, 5, 6, 7 —
// don't exist yet), deliberately, per the BR's own instruction to build this
// once rather than reinvent it per workflow.
export async function up(knex: Knex): Promise<void> {
  // A time-bound stand-in: while active, delegate_user_id may act with the
  // authority of `role` at `campus_id`. Deliberately separate from
  // hostel.user_roles (migration 3) — a delegation is a temporary, reasoned,
  // separately-audited stand-in, not a role grant/promotion, and must never
  // be confused with one in reporting or in `admin` endpoints.
  await knex.schema.withSchema('hostel').createTable('approver_delegations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('role', 50).notNullable().references('role').inTable('hostel.role_levels');
    t.uuid('delegate_user_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.timestamp('effective_from').notNullable();
    t.timestamp('effective_to').notNullable();
    t.string('reason', 500).notNullable();
    t.uuid('created_by').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.boolean('active').notNullable().defaultTo(true); // explicit early revocation, independent of effective_to
    t.timestamps(true, true);
    t.index(['org_id', 'campus_id', 'role', 'active']);
    t.check('?? > ??', ['effective_to', 'effective_from']);
  });

  // One row per resolved approval, for ANY future workflow (Transfer, Gate
  // Pass, Complaints, Checkout, and this module's own already-built
  // decideApplication/createAllocation if they're ever retrofitted — not
  // done in this pass, see utils/approvalResolution.ts's own comment).
  // entity_type/entity_id is a polymorphic reference, the same pattern
  // utils/audit.ts already uses for entityType/entityId — kept consistent
  // rather than inventing a second polymorphic-reference convention.
  await knex.schema.withSchema('hostel').createTable('approval_resolutions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable();
    t.uuid('campus_id').notNullable().references('campus_id').inTable('hostel.shadow_campuses');
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('required_role', 50).notNullable();
    // Nullable: a role-pool resolution (DELEGATED/ESCALATED) may have no
    // single named person who was "supposed to" approve — only NORMAL
    // resolutions are guaranteed to have one (the actor themselves).
    t.uuid('planned_approver_user_id').references('user_id').inTable('hostel.shadow_users');
    t.uuid('actual_approver_user_id').notNullable().references('user_id').inTable('hostel.shadow_users');
    t.string('mode', 20).notNullable();
    t.string('governing_rule', 200);
    t.string('reason', 1000);
    t.jsonb('evidence').notNullable().defaultTo('[]');
    t.timestamp('resolved_at').notNullable().defaultTo(knex.fn.now());
    // BR §5.2: "Emergency bypass produces a provisional decision where
    // policy requires later ratification." Only meaningful for mode=BYPASS,
    // left null otherwise.
    t.uuid('retrospective_reviewer_user_id').references('user_id').inTable('hostel.shadow_users');
    t.timestamp('retrospective_reviewed_at');
    t.string('retrospective_outcome', 20);
    t.index(['org_id', 'campus_id', 'entity_type', 'entity_id']);
    t.index(['org_id', 'mode']); // for a future "bypass pending ratification" queue
    t.check("?? IN ('NORMAL','DELEGATED','ESCALATED','BYPASS')", ['mode']);
    t.check("?? IS NULL OR ?? IN ('confirmed','amended','reversed')", ['retrospective_outcome', 'retrospective_outcome']);
  });

  for (const table of ['approver_delegations', 'approval_resolutions']) {
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
  await knex.schema.withSchema('hostel').dropTableIfExists('approval_resolutions');
  await knex.schema.withSchema('hostel').dropTableIfExists('approver_delegations');
}
