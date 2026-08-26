import 'dotenv/config';
import path from 'node:path';
import { assertBootConditions, createSyncListener } from '@uos/auth';
import { validateEnv, isStandalone } from './config/env';
import { registry } from './registry';
import { redis } from './redis';
import { createApp } from './app';

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
      await registry
        .adminDb(orgId)('sync_state')
        .insert({ channel: 'events', last_event_id: id })
        .onConflict('channel')
        .merge();
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
        const moduleAssignments = data.moduleAssignments.filter(
          (a) => a.moduleId === process.env.MODULE_ID
        );
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
    throw new Error(
      `migration halted at org ${migration.failed.orgId}: ${migration.failed.error.message}`
    );
  }
  console.log(
    `[${process.env.MODULE_NAME}] migrated ${migration.succeeded.length} known tenant(s)`
  );

  await assertBootConditions({
    registry,
    redis,
    requiredEnv: standalone
      ? [
          'MODULE_ID',
          'MODULE_SCHEMA',
          'DB_APP_USER',
          'DB_APP_PASSWORD',
          'DB_ADMIN_USER',
          'DB_ADMIN_PASSWORD',
          'REDIS_URL',
        ]
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
    console.log(
      `[${process.env.MODULE_NAME}] standalone dev mode — outbox sync skipped, no live auth-server`
    );
  }

  const app = createApp();
  const port = parseInt(process.env.PORT!, 10);
  const server = app.listen(port, () =>
    console.log(`[${process.env.MODULE_NAME}] listening on :${port}`)
  );

  const shutdown = (signal: string): void => {
    console.log(
      `[${process.env.MODULE_NAME}] ${signal} received, shutting down`
    );
    server.close(() => {
      void Promise.all([
        sync ? sync.stop() : Promise.resolve(),
        registry.destroy(),
      ]).then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

boot().catch((err) => {
  console.error(`[${process.env.MODULE_NAME ?? 'module'}] Boot failed:`, err);
  process.exit(1);
});
