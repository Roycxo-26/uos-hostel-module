import path from 'node:path';
import dotenv from 'dotenv';
import type { Knex } from 'knex';

// Real bug, found running this for real: the Knex CLI changes the working
// directory to this file's own directory (src/database/) BEFORE requiring
// it — `import 'dotenv/config'` then resolves `.env` relative to that
// changed cwd (src/database/.env, which doesn't exist) instead of the
// backend root's real .env, and every var below silently comes back
// undefined. Loading with an explicit absolute path sidesteps the cwd
// dependency entirely.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Runtime migrations don't go through this file — src/index.ts's boot
// sequence runs them per-tenant via registry.migrateAll(), since each tenant
// lives in its own database. This config exists only for the Knex CLI
// (`knex migrate:make`, an ad-hoc `knex migrate:latest` against one local
// dev database) — point LOCAL_DEV_DATABASE_URL at whichever tenant DB you're
// developing against (in standalone mode, the same DB as DEV_DB_HOST/PORT/NAME).
const config: Knex.Config = {
  client: 'pg',
  connection: process.env.LOCAL_DEV_DATABASE_URL,
  // Second real bug, also only found by actually running this: the
  // standalone-mode bootstrap SQL (README "Standalone dev mode") revokes
  // PUBLIC's access to the `public` schema — correct, matches production's
  // Gate 2 — but that also means Postgres's default search_path
  // ("$user", public) no longer resolves to anywhere hostel_admin/hostel_app
  // can create or see tables, so unqualified CREATE TABLE fails with
  // "no schema has been selected to create in". The real app doesn't hit
  // this — @uos/auth's createTenantRegistry sets `searchPath: ['hostel']`
  // itself (see src/registry.ts) — but this CLI-only config talks to
  // Postgres directly and needs the same pin explicitly.
  searchPath: [process.env.MODULE_SCHEMA ?? 'hostel'],
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export default config;
