// server/services/auth.js
// Google OAuth2 — per-user token storage.
// Primary store: Postgres (via user_integrations) — survives Railway restarts.
// Fallback: tokens/{userId}.json — used for local dev and as in-memory cache.

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as integrations from './integrations.js';
import { getPool } from './db.js';
import { decrypt } from './encryption.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = path.join(__dirname, '..', 'tokens');
const LEGACY_TOKEN_PATH = path.join(__dirname, '..', 'tokens.json');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
];

function ensureTokensDir() {
  if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });
}

function tokenPath(userId) {
  ensureTokensDir();
  return path.join(TOKENS_DIR, `${String(userId)}.json`);
}

// Migrate old single-file tokens.json → tokens/{userId}.json on first use
function migrateLegacy() {
  if (!fs.existsSync(LEGACY_TOKEN_PATH)) return;
  try {
    const data = JSON.parse(fs.readFileSync(LEGACY_TOKEN_PATH, 'utf8'));
    const userId = data.connectedUserId;
    if (!userId) return;
    const dest = tokenPath(userId);
    if (!fs.existsSync(dest)) {
      const { connectedUserId: _, ...tokens } = data;
      fs.writeFileSync(dest, JSON.stringify(tokens));
      console.log(`[auth] migrated tokens.json → tokens/${userId}.json`);
    }
  } catch {
    // ignore migration errors
  }
}

migrateLegacy();

export function createOAuth2Client() {
  const baseURL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'http://localhost:3001';

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${baseURL}/api/auth/google/callback`
  );
}

export async function getAuthClient(userId) {
  const client = createOAuth2Client();
  const tPath  = tokenPath(userId);

  // Try local file first (fast path)
  if (!fs.existsSync(tPath)) {
    // File missing (e.g. Railway restart before restoreAllFromDB finished) — fall back to DB
    try {
      const raw = await integrations.getKey(String(userId), 'google', 'GOOGLE_OAUTH_TOKENS');
      if (raw) {
        const tokens = JSON.parse(raw);
        fs.writeFileSync(tPath, JSON.stringify(tokens));
        console.log(`[auth] restored tokens for user ${userId} from DB (on-demand)`);
      }
    } catch {
      // DB not available — continue with unconfigured client
    }
  }

  if (fs.existsSync(tPath)) {
    const tokens = JSON.parse(fs.readFileSync(tPath, 'utf8'));
    client.setCredentials(tokens);

    // When Google auto-refreshes an access token, persist both to file and DB
    client.on('tokens', updated => {
      const existing = fs.existsSync(tPath) ? JSON.parse(fs.readFileSync(tPath, 'utf8')) : {};
      const merged   = { ...existing, ...updated };
      fs.writeFileSync(tPath, JSON.stringify(merged));
      integrations.saveKey(String(userId), 'google', 'GOOGLE_OAUTH_TOKENS', JSON.stringify(merged))
        .catch(() => {});
    });
  }

  return client;
}

// Save tokens to both the local file (fast reads) and DB (survives restarts).
export async function saveTokens(tokens, userId) {
  if (!userId) throw new Error('userId is required to save Google tokens');
  const tPath = tokenPath(userId);
  fs.writeFileSync(tPath, JSON.stringify(tokens));
  try {
    await integrations.saveKey(String(userId), 'google', 'GOOGLE_OAUTH_TOKENS', JSON.stringify(tokens));
  } catch (err) {
    // DB not available in local dev — file storage is sufficient
    console.warn('[auth] Could not persist tokens to DB:', err.message);
  }
}

// Called at server startup: restores Google token files from DB.
// Fixes the Railway case where the container filesystem is wiped on every restart.
export async function restoreAllFromDB() {
  const pool = getPool();
  if (!pool) return; // local dev — filesystem is persistent
  try {
    const r = await pool.query(
      `SELECT user_id, key_value FROM user_integrations
       WHERE service = 'google' AND key_name = 'GOOGLE_OAUTH_TOKENS'`
    );
    let count = 0;
    for (const row of r.rows) {
      try {
        const plain  = decrypt(row.key_value);
        const tokens = JSON.parse(plain);
        const tPath  = tokenPath(row.user_id);
        if (!fs.existsSync(tPath)) {
          fs.writeFileSync(tPath, JSON.stringify(tokens));
          count++;
        }
      } catch { /* skip corrupted rows */ }
    }
    if (count > 0) console.log(`[auth] restored ${count} Google token file(s) from DB`);
  } catch (err) {
    console.error('[auth] restoreAllFromDB failed:', err.message);
  }
}

export function isConnected(userId) {
  const tPath = tokenPath(userId);
  if (!fs.existsSync(tPath)) return false;
  try {
    const tokens = JSON.parse(fs.readFileSync(tPath, 'utf8'));
    return !!(tokens.refresh_token || (tokens.expiry_date && tokens.expiry_date > Date.now()));
  } catch {
    return false;
  }
}

export function getConnectedUserIds() {
  ensureTokensDir();
  try {
    return fs.readdirSync(TOKENS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

export function getAuthUrl(state = '') {
  const opts = { access_type: 'offline', scope: SCOPES, prompt: 'consent' };
  if (state) opts.state = state;
  return createOAuth2Client().generateAuthUrl(opts);
}

export default { createOAuth2Client, getAuthClient, saveTokens, isConnected, getAuthUrl, getConnectedUserIds, restoreAllFromDB };
