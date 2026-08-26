import fs from 'fs';

const ALWAYS_REQUIRED = [
  'PORT',
  'MODULE_NAME',
  'MODULE_ID',
  'MODULE_SCHEMA',
  'AUTH_PUBLIC_KEY_PATH',
  'DB_APP_USER',
  'DB_APP_PASSWORD',
  'DB_ADMIN_USER',
  'DB_ADMIN_PASSWORD',
  'REDIS_URL',
];

// Live platform mode — real auth-server, real tenant catalog, real outbox sync.
const LIVE_PLATFORM_REQUIRED = ['AUTH_SERVER_URL', 'INTERNAL_SYNC_SECRET'];

// DEV_STANDALONE=true — single local Postgres, self-signed dev token, no live
// auth-server. See README "Standalone dev mode" and scripts/dev-mint-token.ts.
const STANDALONE_REQUIRED = [
  'DEV_ORG_ID',
  'DEV_DB_HOST',
  'DEV_DB_PORT',
  'DEV_DB_NAME',
];

export function isStandalone(): boolean {
  return process.env.DEV_STANDALONE === 'true';
}

export function validateEnv(): void {
  const standalone = isStandalone();

  // Belt-and-suspenders: this flag exists to skip real platform wiring for
  // local development. It must never reach a production boot, even if
  // someone's .env gets copied somewhere it shouldn't.
  if (standalone && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEV_STANDALONE=true with NODE_ENV=production — refusing to boot. ' +
        'This bypasses the real auth-server, tenant catalog, and outbox sync. ' +
        'Unset DEV_STANDALONE before deploying.'
    );
  }

  const required = [
    ...ALWAYS_REQUIRED,
    ...(standalone ? STANDALONE_REQUIRED : LIVE_PLATFORM_REQUIRED),
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }

  if (!fs.existsSync(process.env.AUTH_PUBLIC_KEY_PATH!)) {
    throw new Error(
      `Public key not found at AUTH_PUBLIC_KEY_PATH="${process.env.AUTH_PUBLIC_KEY_PATH}". ` +
        (standalone
          ? 'Generate a throwaway local keypair: npm run keys:generate'
          : 'Get public.pem from the auth-server team and place it here.')
    );
  }

  if (standalone) {
    console.warn(
      '\n⚠️  STANDALONE DEV MODE — auth is a self-signed local token, not the real platform.\n' +
        '   Single local database, no outbox sync, no live auth-server. NEVER use in production.\n'
    );
  }
}
