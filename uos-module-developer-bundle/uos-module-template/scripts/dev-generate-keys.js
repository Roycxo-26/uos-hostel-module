// Throwaway RS256 keypair for standalone dev mode ONLY. Signs and verifies
// entirely on this machine — never share this keypair, never point a real
// AUTH_PUBLIC_KEY_PATH at it, never commit keys/ (already gitignored).
// Real deployments get their public key from the auth-server team instead.
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../keys');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(path.join(dir, 'dev-private.pem'), privateKey);
fs.writeFileSync(path.join(dir, 'dev-public.pem'), publicKey);
console.log(
  'Throwaway dev keypair generated at keys/dev-private.pem and keys/dev-public.pem'
);
console.log(
  'Set AUTH_PUBLIC_KEY_PATH=./keys/dev-public.pem in .env, then run: npm run dev:mint-token'
);
