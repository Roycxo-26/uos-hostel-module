import type { Knex } from 'knex';

// UOS_Final.docx audit (12 Sep 2026), section 6.4 — every delegation record
// must support "exclusions" (specific things the delegate should NOT be
// allowed to decide, even though the general delegation covers their role)
// alongside "instant revocation" (already covered — migration 11's own
// `active` flag). Real gap found checking this: not only was `exclusions`
// missing, nothing anywhere in the app could create/list/revoke a
// delegation at all — approver_delegations (migration 11) was pure
// infrastructure, read-only, unreachable in practice. This migration adds
// the missing column; backend/src/app/delegations builds the missing
// create/list/revoke surface.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('approver_delegations', (t) => {
    // Entity-type strings this delegation must NOT cover, even though the
    // delegate otherwise holds `role`'s authority — e.g. a Head Warden
    // delegating routine approvals to a Warden while on leave, but
    // deliberately keeping 'resident_privilege_change' (suspend/reinstate)
    // to decide personally. Empty array (the default) = no exclusions,
    // same behaviour as before this migration. See
    // utils/approvalResolution.ts's DELEGATABLE_ENTITY_TYPES for the valid
    // values.
    t.jsonb('exclusions').notNullable().defaultTo('[]');

    // Same revoke-audit shape as hostel.case_access_grants (migration 35)
    // and hostel.roommate_requests (migration 47): who ended it, when, and
    // (this table's own addition, since every OTHER field on this row is
    // already a reasoned decision) why — matters here specifically because
    // an early revocation is itself an approval-authority event, the exact
    // kind of thing this codebase's audit trail exists to explain later.
    t.timestamp('revoked_at').nullable();
    t.uuid('revoked_by').nullable().references('user_id').inTable('hostel.shadow_users');
    t.string('revoked_reason', 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('hostel').alterTable('approver_delegations', (t) => {
    t.dropColumn('exclusions');
    t.dropColumn('revoked_at');
    t.dropColumn('revoked_by');
    t.dropColumn('revoked_reason');
  });
}
