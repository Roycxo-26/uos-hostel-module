// Mints a self-signed dev JWT for standalone mode — matches @uos/auth's
// AuthUser claims shape exactly, so requireAuth()/scopedRequest() work
// completely unmodified against it. Signed with the throwaway keypair from
// `npm run keys:generate`, never the real platform's key.
//
// Usage: npm run dev:mint-token [-- --role=campus_admin --campus-scope=ALL]
//
// Defaults to campus_scope=SINGLE with a fixed dummy campus_id — that's the
// realistic default for testing (most users are single-campus). campus_scope
// =ALL sends campus_id='' per AuthUser's own documented shape, which currently
// breaks @uos/auth's getPermissions() (blindly parametrizes campus_id into a
// uuid column) — flagged, not fixed here; avoid --campus-scope=ALL until
// that's addressed upstream.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

function arg(name: string, fallback: string): string {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found ? found.slice(flag.length) : fallback;
}

const privateKeyPath = path.resolve(__dirname, '../keys/dev-private.pem');
if (!fs.existsSync(privateKeyPath)) {
  console.error('No dev keypair found. Run: npm run keys:generate');
  process.exit(1);
}

if (!process.env.MODULE_ID || !process.env.DEV_ORG_ID) {
  console.error(
    'MODULE_ID and DEV_ORG_ID must be set in .env before minting a token.'
  );
  process.exit(1);
}

const campusScope = arg('campus-scope', 'SINGLE') as
  'SINGLE' | 'PARTIAL' | 'ALL';
const campusId = arg(
  'campus-id',
  campusScope === 'ALL' ? '' : '00000000-0000-0000-0000-0000000000c1'
);

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

const claims = {
  sub: arg('user-id', '00000000-0000-0000-0000-000000000001'),
  org_id: process.env.DEV_ORG_ID,
  campus_id: campusId,
  campus_scope: campusScope,
  ...(campusScope === 'PARTIAL' ? { allowed_campuses: [campusId] } : {}),
  org_role: arg('role', 'org_admin'),
  session_id: 'dev-session',
  is_super_admin: arg('super-admin', 'false') === 'true',
  module_id: process.env.MODULE_ID,
  token_type: 'scoped' as const,
};

const token = jwt.sign(claims, privateKey, {
  algorithm: 'RS256',
  expiresIn: '12h',
});

console.log(token);
console.error(
  '\n(claims above go to stdout as the bare token; use it as: Authorization: Bearer <token>)'
);
