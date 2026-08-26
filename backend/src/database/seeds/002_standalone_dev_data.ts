import type { Knex } from 'knex';
import 'dotenv/config';
import { isStandalone } from '../../config/env';

/**
 * Dev-only test personas for standalone mode (README "Standalone dev mode").
 * shadow_users/shadow_campuses/user_roles are normally sync-owned — never
 * written by application code — but standalone mode has no live
 * auth-server to sync from, so this is the one place that's acceptable,
 * gated so it can never run anywhere else by accident.
 *
 * Matches the fixed UUIDs `npm run dev:mint-token` defaults to, so a token
 * minted with no flags (or --user-id=<one of these>) resolves to a shadow_users
 * row that actually exists. Mint a token per persona to test each role:
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000001 --role=org_admin
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000002 --role=campus_admin
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000003 --role=campus_admin
 *   npm run dev:mint-token -- --user-id=00000000-0000-0000-0000-000000000004 --role=campus_admin
 * (org_role above is the platform role on the token; the actual Hostel-module
 * role — head_warden/warden/student — comes from the user_roles rows below,
 * not from org_role. See src/middlewares/requireHostelPermission.ts.)
 */
export async function seed(knex: Knex): Promise<void> {
  if (!isStandalone()) {
    console.log('[hostel] DEV_STANDALONE is not "true" — skipping standalone dev seed (this is expected in live mode).');
    return;
  }

  const orgId = process.env.DEV_ORG_ID!;
  const campusId = '00000000-0000-0000-0000-0000000000c1'; // dev-mint-token's default --campus-id

  const users = [
    { user_id: '00000000-0000-0000-0000-000000000001', name: 'Dev Org Admin', email: 'orgadmin@dev.local' },
    { user_id: '00000000-0000-0000-0000-000000000002', name: 'Dev Head Warden', email: 'headwarden@dev.local' },
    { user_id: '00000000-0000-0000-0000-000000000003', name: 'Dev Warden', email: 'warden@dev.local' },
    { user_id: '00000000-0000-0000-0000-000000000004', name: 'Dev Student', email: 'student@dev.local' },
  ];

  await knex('hostel.shadow_campuses')
    .insert({
      campus_id: campusId,
      org_id: orgId,
      name: 'Dev Campus',
      code: 'DEV',
      timezone: 'UTC',
      is_active: true,
    })
    .onConflict('campus_id')
    .merge();

  await knex('hostel.shadow_users')
    .insert(
      users.map((u) => ({
        ...u,
        org_id: orgId,
        org_role: 'org_admin', // display only — see shadow_users' own column comment
        status: 'active',
      }))
    )
    .onConflict('user_id')
    .merge(['name', 'email', 'org_id', 'status']);

  await knex('hostel.user_roles')
    .insert([
      { user_id: users[1]!.user_id, campus_id: campusId, role: 'head_warden', is_active: true },
      { user_id: users[2]!.user_id, campus_id: campusId, role: 'warden', is_active: true },
      { user_id: users[3]!.user_id, campus_id: campusId, role: 'student', is_active: true },
    ])
    .onConflict(['user_id', 'campus_id'])
    .merge(['role', 'is_active']);

  console.log('[hostel] Standalone dev seed applied — 4 test personas ready, see this file\'s header for dev:mint-token commands.');
}
