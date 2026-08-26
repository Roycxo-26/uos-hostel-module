import './pgDateTypeFix'; // must run before any pg connection is used — see that file's own comment
import 'dotenv/config';
import path from 'node:path';
import { assertBootConditions, createSyncListener } from '@uos/auth';
import { validateEnv, isStandalone } from './config/env';
import { registry } from './registry';
import { redis } from './redis';
import { createApp } from './app';
import { expireAllocationOffersAllTenants, sendNoShowWarningsAllTenants } from './jobs/expireAllocationOffers';
import { expireNoShowAllocationsAllTenants } from './jobs/expireNoShowAllocations';
import { flagOverdueKeysAllTenants } from './jobs/flagOverdueKeys';
import { flagOverdueMovementsAllTenants, sendMovementReturnRemindersAllTenants } from './jobs/flagOverdueMovements';
import { restoreTemporaryRelocationsAllTenants } from './jobs/restoreTemporaryRelocations';

const MIGRATIONS_CONFIG = {
  directory: path.resolve(__dirname, 'database/migrations'),
  extension: 'ts',
  loadExtensions: ['.ts'],
} as const;

// Outbox sync — only meaningful against a real auth-server. In standalone dev
// mode (DEV_STANDALONE=true) there's no live platform to poll, so this is
// never constructed at all rather than built with undefined config.
// See the @uos/auth README's createSyncListener section before changing this.
function buildSync() {
  return createSyncListener({
    baseUrl: process.env.AUTH_SERVER_URL!,
    secret: process.env.INTERNAL_SYNC_SECRET!,
    moduleId: process.env.MODULE_ID!,
    registry,
    getCursor: (orgId) =>
      registry
        .adminDb(orgId)<{ last_event_id: string | null }>('sync_state')
        .where('channel', 'events')
        .first()
        .then((row) => row?.last_event_id ?? null),
    setCursor: async (orgId, id) => {
      await registry.adminDb(orgId)('sync_state').insert({ channel: 'events', last_event_id: id }).onConflict('channel').merge();
    },
    handlers: {
      async onUserSync(data) {
        const db = registry.adminDb(data.orgId);
        await db('shadow_users')
          .insert({
            user_id: data.userId,
            org_id: data.orgId,
            name: data.name,
            email: data.email,
            phone: data.phone,
            org_role: data.orgRole,
            status: data.status,
            synced_at: db.fn.now(),
          })
          .onConflict('user_id')
          .merge();

        // A user can hold this module on more than one campus (PARTIAL scope) —
        // sync every matching assignment, one at a time. A batch insert fails
        // or succeeds atomically, so one bad row (e.g. a campus that hasn't
        // synced yet) would otherwise block every other valid assignment
        // behind it, not just itself.
        const moduleAssignments = data.moduleAssignments.filter((a) => a.moduleId === process.env.MODULE_ID);
        let firstError: unknown;
        for (const a of moduleAssignments) {
          try {
            await db('shadow_user_access')
              .insert({
                user_id: data.userId,
                org_id: data.orgId,
                campus_id: a.campusId,
                module_id: process.env.MODULE_ID,
                synced_at: db.fn.now(),
              })
              .onConflict(['user_id', 'campus_id', 'module_id'])
              .merge();
          } catch (err) {
            firstError ??= err;
          }
        }
        // Surface a failure so the event still gets retried/dead-lettered — the
        // rows that did succeed above are already committed (onConflict merge
        // is idempotent, so a retry won't reinsert them).
        if (firstError) throw firstError;
      },
      async onCampusSync(data) {
        const db = registry.adminDb(data.orgId);
        await db('shadow_campuses')
          .insert({
            campus_id: data.id,
            org_id: data.orgId,
            name: data.name,
            code: data.code,
            timezone: data.timezone,
            is_active: data.isActive,
            synced_at: db.fn.now(),
          })
          .onConflict('campus_id')
          .merge();
      },
    },
  });
}

async function boot(): Promise<void> {
  validateEnv();
  const standalone = isStandalone();

  await registry.start();

  // Canary-first, halt-on-fail across every known tenant — see
  // registry.migrateAll's own doc comment in the @uos/auth README.
  const migration = await registry.migrateAll(MIGRATIONS_CONFIG);
  if (migration.failed) {
    throw new Error(`migration halted at org ${migration.failed.orgId}: ${migration.failed.error.message}`);
  }
  console.log(`[${process.env.MODULE_NAME}] migrated ${migration.succeeded.length} known tenant(s)`);

  await assertBootConditions({
    registry,
    redis,
    requiredEnv: standalone
      ? ['MODULE_ID', 'MODULE_SCHEMA', 'DB_APP_USER', 'DB_APP_PASSWORD', 'DB_ADMIN_USER', 'DB_ADMIN_PASSWORD', 'REDIS_URL']
      : [
          'AUTH_SERVER_URL',
          'AUTH_PUBLIC_KEY_PATH',
          'INTERNAL_SYNC_SECRET',
          'MODULE_ID',
          'MODULE_SCHEMA',
          'DB_APP_USER',
          'DB_APP_PASSWORD',
          'DB_ADMIN_USER',
          'DB_ADMIN_PASSWORD',
          'REDIS_URL',
        ],
  });

  const sync = standalone ? null : buildSync();
  if (sync) {
    await sync.start();
  } else {
    console.log(`[${process.env.MODULE_NAME}] standalone dev mode — outbox sync skipped, no live auth-server`);
  }

  const app = createApp();
  const port = parseInt(process.env.PORT!, 10);
  const server = app.listen(port, () => console.log(`[${process.env.MODULE_NAME}] listening on :${port}`));

  // BR §11 rule 11 gap-closure — see jobs/expireNoShowAllocations.ts. An
  // in-process interval is a deliberate, flagged stopgap: fine for Phase 1 /
  // single-instance dev and pilot, but running more than one instance of
  // this service without a distributed lock around this job would double-
  // process the same rows. Move to a real scheduler (or add a Redis-backed
  // lock here) before that becomes true — noted, not silently left for
  // someone to discover in production.
  const NO_SHOW_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  const noShowSweepTimer = setInterval(() => {
    void expireNoShowAllocationsAllTenants();
  }, NO_SHOW_SWEEP_INTERVAL_MS);
  void expireNoShowAllocationsAllTenants(); // also run once at boot, don't wait a full interval for the first sweep

  // Same stopgap-but-flagged reasoning as the no-show sweep above — fine for
  // one instance, needs a distributed lock before running more than one.
  const OVERDUE_MOVEMENT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  const overdueMovementSweepTimer = setInterval(() => {
    void flagOverdueMovementsAllTenants();
  }, OVERDUE_MOVEMENT_SWEEP_INTERVAL_MS);
  void flagOverdueMovementsAllTenants();

  // Earlier, softer sibling of the overdue sweep above — reminds staff/
  // resident a movement's return is coming up, before it's actually late.
  // Same interval/stopgap reasoning; see jobs/flagOverdueMovements.ts's own
  // comment on sendMovementReturnRemindersForOrg for what this closes.
  const returnReminderSweepTimer = setInterval(() => {
    void sendMovementReturnRemindersAllTenants();
  }, OVERDUE_MOVEMENT_SWEEP_INTERVAL_MS);
  void sendMovementReturnRemindersAllTenants();

  // Same stopgap-but-flagged reasoning as the two sweeps above — see
  // jobs/restoreTemporaryRelocations.ts for what this closes (UAT.md Batch
  // 10's temporary-relocation round-trip gap).
  const TEMP_RELOCATION_RESTORE_INTERVAL_MS = 5 * 60 * 1000;
  const tempRelocationRestoreTimer = setInterval(() => {
    void restoreTemporaryRelocationsAllTenants();
  }, TEMP_RELOCATION_RESTORE_INTERVAL_MS);
  void restoreTemporaryRelocationsAllTenants();

  // D17.03 (TODO.md Batch 14) — same stopgap-but-flagged reasoning as every
  // sweep above. Offer expiry closes the "decline/expiry-releases-the-hold
  // loop" gap; the no-show warning is the earlier, softer sibling of the
  // no-show sweep, same relationship the return-reminder sweep already has
  // to the overdue-movement sweep above.
  const OFFER_EXPIRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  const offerExpirySweepTimer = setInterval(() => {
    void expireAllocationOffersAllTenants();
  }, OFFER_EXPIRY_SWEEP_INTERVAL_MS);
  void expireAllocationOffersAllTenants();

  const noShowWarningSweepTimer = setInterval(() => {
    void sendNoShowWarningsAllTenants();
  }, OFFER_EXPIRY_SWEEP_INTERVAL_MS);
  void sendNoShowWarningsAllTenants();

  // D17.20 item 72 (TODO.md Batch 18) — same stopgap-but-flagged reasoning
  // as every sweep above.
  const overdueKeySweepTimer = setInterval(() => {
    void flagOverdueKeysAllTenants();
  }, OFFER_EXPIRY_SWEEP_INTERVAL_MS);
  void flagOverdueKeysAllTenants();

  const shutdown = (signal: string): void => {
    console.log(`[${process.env.MODULE_NAME}] ${signal} received, shutting down`);
    clearInterval(noShowSweepTimer);
    clearInterval(overdueMovementSweepTimer);
    clearInterval(returnReminderSweepTimer);
    clearInterval(tempRelocationRestoreTimer);
    clearInterval(offerExpirySweepTimer);
    clearInterval(noShowWarningSweepTimer);
    clearInterval(overdueKeySweepTimer);
    server.close(() => {
      void Promise.all([sync ? sync.stop() : Promise.resolve(), registry.destroy()]).then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

boot().catch((err) => {
  console.error(`[${process.env.MODULE_NAME ?? 'module'}] Boot failed:`, err);
  process.exit(1);
});
