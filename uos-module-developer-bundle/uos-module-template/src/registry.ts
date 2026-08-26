import { createTenantRegistry } from '@uos/auth';
import { isStandalone } from './config/env';

// The core multi-tenant primitive — org_id -> Knex, lazy, pooled,
// schema-pinned to this module's own schema. Everything that touches the
// database goes through this, never a hand-rolled knex() instance.
//
// Two tiers, same function, same scopedRequest/getTrx behavior either way —
// there is no separate single-tenant code path anywhere downstream of this:
//   - Live platform (default): fetches the tenant list from the auth server
//     (`catalog`). One deployment serves every tenant.
//   - Standalone dev (DEV_STANDALONE=true) / premium on-prem: `staticTenants`
//     with one fixed entry — no live auth-server involved. Same tier @uos/auth
//     ships for single-tenant on-prem deployments, repurposed here for local
//     development without needing the whole platform running. See README's
//     "Standalone dev mode" section.
const credentials = {
  app: {
    user: process.env.DB_APP_USER!,
    password: process.env.DB_APP_PASSWORD!,
  },
  admin: {
    user: process.env.DB_ADMIN_USER!,
    password: process.env.DB_ADMIN_PASSWORD!,
  },
};

export const registry = createTenantRegistry(
  isStandalone()
    ? {
        staticTenants: [
          {
            orgId: process.env.DEV_ORG_ID!,
            dbHost: process.env.DEV_DB_HOST!,
            dbPort: parseInt(process.env.DEV_DB_PORT!, 10),
            dbName: process.env.DEV_DB_NAME!,
          },
        ],
        credentials,
        searchPath: [process.env.MODULE_SCHEMA!],
      }
    : {
        catalog: {
          baseUrl: process.env.AUTH_SERVER_URL!,
          secret: process.env.INTERNAL_SYNC_SECRET!,
        },
        credentials,
        searchPath: [process.env.MODULE_SCHEMA!],
      }
);
