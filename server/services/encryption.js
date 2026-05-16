// server/services/encryption.js
// AES-256-GCM authenticated encryption for stored API keys.
// ENCRYPTION_SECRET → 32-byte key via scrypt. Never store the secret in the DB.
import crypto from 'crypto';

const SECRET = process.env.ENCRYPTION_SECRET;

if (!SECRET) {
  console.warn(
    '[encryption] ENCRYPTION_SECRET not set — using insecure dev fallback. ' +
    'Set this variable in Railway before storing real user keys.'
  );
}

// scrypt derives a fixed 32-byte key from whatever-length secret the user provides.
// Salt is a fixed constant — unique per application, not per record.
// Per-record randomness comes from the 12-byte IV, not the key.
const KEY = crypto.scryptSync(
  SECRET ?? 'devos-local-dev-fallback-do-not-use-in-prod',
  'devos-aes-salt-v1',
  32
);

const ALGORITHM = 'aes-256-gcm';

export function encrypt(plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const body   = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  // Format: <iv>:<authTag>:<ciphertext>  — all base64url so safe to store anywhere
  return `${iv.toString('base64url')}:${tag.toString('base64url')}:${body.toString('base64url')}`;
}

export function decrypt(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Ciphertext format invalid');
  const [ivB64, tagB64, bodyB64] = parts;
  const iv  = Buffer.from(ivB64,  'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const body = Buffer.from(bodyB64, 'base64url');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
