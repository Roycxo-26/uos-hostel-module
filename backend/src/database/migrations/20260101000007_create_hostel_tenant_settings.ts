import type { Knex } from 'knex';

// White-label configuration (source rule book Ch. 6; Master Rule Book §1.4
// "configuration before customisation"). One row per org — org-level, not
// campus-level (an institution's branding/terminology doesn't vary by
// campus in this module's model), so RLS here is org_id only, matching the
// same org-only pattern @uos/auth's own shadow_campuses uses.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').createTable('tenant_settings', (t) => {
    t.uuid('org_id').primary();
    // { institutionName, logoUrl, primaryColor }
    t.jsonb('branding').notNullable().defaultTo('{}');
    // { hostelLabel, blockLabel, floorLabel, roomLabel, bedLabel,
    //   wardenLabel, headWardenLabel, floorInchargeLabel, roomCrLabel }
    t.jsonb('terminology').notNullable().defaultTo('{}');
    // { showBlockLevel, showFloorLevel, enableVisitorSlots, enableSports,
    //   enableMealAttendance, enableSpecialDiet, enableParentAccess }
    t.jsonb('feature_flags').notNullable().defaultTo('{}');
    // Tenant-chosen values for flow.md §16's Open Decisions — the rule for
    // each is fixed in application code, only the value lives here.
    t.jsonb('policy_defaults').notNullable().defaultTo('{}');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').references('user_id').inTable('hostel.shadow_users');
  });

  await knex.raw('ALTER TABLE hostel.tenant_settings ENABLE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY tenant_settings_isolation ON hostel.tenant_settings
      FOR ALL TO hostel_app
      USING (org_id::text = current_setting('app.current_org_id', true))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').dropTableIfExists('tenant_settings');
}
