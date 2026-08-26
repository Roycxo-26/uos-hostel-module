import type { Knex } from 'knex';

/**
 * This module's own role/permission grants — flow.md §5.1/§5.2. Distinct
 * from the platform's org_role: Super Admin/Admin bypass all of this via
 * requireHostelPermission's is_super_admin/org_admin check (see
 * middlewares/requireHostelPermission.ts), so they need no row here at all.
 * Room Head/Floor In-charge are deliberately absent from role_levels below
 * — flow.md frames them as additional, time-bound responsibilities layered
 * on the Student base role (hostel.responsibility_assignments, migration
 * 13), not base roles with their own permission set. 'responsibility:assign'
 * below is who can GRANT that responsibility (Warden/Head Warden), not a
 * permission Room Head/Floor In-charge holders get themselves — nothing
 * built so far consumes an active assignment yet (that's the Headcount
 * module, TODO.md Batch 5), only the assignment mechanism itself exists.
 *
 * IMPORTANT — this seed only reaches ONE database (whichever
 * LOCAL_DEV_DATABASE_URL points at via the Knex CLI's `seed:up`). That's
 * exactly right for standalone dev mode (a single local Postgres) but is
 * NOT how a real multi-tenant rollout would get this data into every
 * tenant — registry.migrateAll() only runs schema migrations, not data
 * seeds, across the tenant catalog. A per-tenant-provision seeding step
 * (or an idempotent "ensure default hostel roles" call the module runs
 * itself against a newly-discovered org_id) is a real gap for live mode,
 * flagged here rather than solved — see project README "What's next".
 */
export async function seed(knex: Knex): Promise<void> {
  await knex('hostel.role_permissions').del();

  // Real bug, found re-running this seed for real after live personas
  // already held role assignments: role_levels can't be del()'d-then-
  // reinserted once hostel.user_roles.role references it — that FK has no
  // ON DELETE CASCADE (correctly: wiping a role DEFINITION must never
  // silently delete who holds it). Worked the first time only because
  // user_roles was still empty then. Upsert instead of delete+insert is the
  // actually-idempotent fix — safe whether this is the first run or the
  // fifth, and whether real assignments exist yet or not.
  await knex('hostel.role_levels')
    .insert([
      { role: 'student', level: 10 },
      { role: 'warden', level: 40 },
      { role: 'head_warden', level: 50 },
    ])
    .onConflict('role')
    .merge();

  const wardenPermissions = [
    'application:decide', // flow.md §11: Warden/Admin reviewer
    'allocation:create', // flow.md HST-WF-03: Warden locks & assigns bed
    'allocation:manage_noshow', // flow.md HST-WF-27: Warden No-Show Review
    'checkin:create', // flow.md HST-WF-04: Warden + Student
    // UOS HOSTEL BR.md §7: "Approve: Warden (normal) / Head Warden
    // (exceptional)". Both roles get this route-level permission; the
    // actual normal-vs-exceptional distinction is enforced by
    // authorizeApproval() inside transfers/service.ts, not by which role
    // holds this string — a Warden deciding an 'emergency' transfer still
    // fails there (requiredRole='head_warden') unless delegated.
    'transfer:decide',
    // BR §2 / flow.md HST-WF-22: Warden/Head Warden assign Room Head/Floor
    // In-charge — see hostel.responsibility_assignments (migration 13).
    'responsibility:assign',
    // BR §8: Warden/Head Warden decide gate pass/leave and record actual
    // gate movement (no live Gate integration — see movement_requests
    // migration's own comment).
    'movement:manage',
    // BR §8: staff can manage ANY headcount session; Room Head/Floor
    // In-charge holders get scope-limited access via an active
    // responsibility_assignments row instead of this permission — see
    // headcount/service.ts's canActOnScope. This permission is also what
    // gates the reconciliation queue (GET /headcount/sessions/reconciliation).
    'headcount:manage',
    // BR §9: Warden triages/investigates/resolves/issues notice; the actual
    // disciplinary decision goes through authorizeApproval(head_warden), not
    // this permission — see cases/service.ts's decideCase.
    'case:manage',
    // BR §10: Warden inspects/records clearances; the actual approval goes
    // through authorizeApproval (warden if clear, head_warden if
    // overriding) — see checkouts/service.ts's approveCheckout.
    'checkout:manage',
    // BR §16: viewing the audit trail is itself a stronger-than-view
    // permission — see audit/service.ts's own note on why it's also
    // self-logging.
    'audit:view',
    // HOSTEL-GAP-ANALYSIS.md D17.17 (TODO.md Batch 16) — safety-status
    // updates and evacuation-drill/emergency-muster actions. Staff-only
    // throughout; unlike Headcount there's no scoped Room-Head/Floor-
    // Incharge equivalent for safety in this BRD.
    'safety:manage',
    // HOSTEL-GAP-ANALYSIS.md D17.18 (TODO.md Batch 17) — physical
    // occupancy verification sessions. Staff-only, same reasoning.
    'occupancy_verification:manage',
    // HOSTEL-GAP-ANALYSIS.md D17.20 (TODO.md Batch 18) — room entry,
    // master-key, property custody and evidence-reference actions.
    // Staff-only, same reasoning.
    'room_access:manage',
    // HOSTEL-GAP-ANALYSIS.md D17.19 (TODO.md Batch 19) — common areas,
    // sanitation inspection, utility outages and pest control. Staff-only,
    // same reasoning.
    'common_area:manage',
    // HOSTEL-GAP-ANALYSIS.md D17.21 (TODO.md Batch 20) — grievance
    // assignment/decision/appeal actions and policy-version publishing.
    // Raising/responding/appealing/withdrawing a grievance and
    // acknowledging/declining a policy stay resident-initiated (no
    // permission needed — see grievances/route.ts's own comment).
    'grievance:manage',
    // HOSTEL-GAP-ANALYSIS.md D17.22 (TODO.md Batch 21) — publishing
    // operational notices and viewing a resident's emergency card.
    // Listing/acknowledging a delivered notice stays resident-initiated
    // (no permission needed).
    'operational_notice:manage',
  ];

  await knex('hostel.role_permissions').insert([
    ...wardenPermissions.map((permission) => ({ role: 'warden', permission })),
    // Head Warden gets everything Warden has, plus structure configuration
    // (flow.md §5.2: "Configure hostel structure: Head Warden Full assigned").
    ...wardenPermissions.map((permission) => ({ role: 'head_warden', permission })),
    { role: 'head_warden', permission: 'structure:configure' },
  ]);
}
