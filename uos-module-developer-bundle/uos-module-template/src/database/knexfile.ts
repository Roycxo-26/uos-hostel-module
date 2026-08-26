import type { Knex } from 'knex';
import 'dotenv/config';

// Runtime migrations don't go through this file — src/index.ts's boot
// sequence runs them per-tenant via registry.migrateAll(), since each tenant
// lives in its own database. This config exists only for the Knex CLI
// (`knex migrate:make`, an ad-hoc `knex migrate:latest` against one local
// dev database) — point LOCAL_DEV_DATABASE_URL at whichever tenant DB you're
// developing against.
const config: Knex.Config = {
  client: 'pg',
  connection: process.env.LOCAL_DEV_DATABASE_URL,
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
