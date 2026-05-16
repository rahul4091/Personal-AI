// server/services/integrations.js
// Per-user integration key storage.
// Postgres when available; JSON file fallback for local dev.
// Values are AES-256-GCM encrypted at rest. The decrypt key never touches the DB.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './db.js';
import { encrypt, decrypt } from './encryption.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE      = path.join(__dirname, '..', 'integrations.json');

// ─── JSON file helpers ────────────────────────────────────────────────────────

function readFile() {
  if (!existsSync(FILE)) return [];
  try { return JSON.parse(readFileSync(FILE, 'utf8')); }
  catch { return []; }
}

function writeFile(rows) {
  writeFileSync(FILE, JSON.stringify(rows, null, 2));
}

// ─── Core operations ──────────────────────────────────────────────────────────

/** Save (insert or overwrite) one key for a user. Value is encrypted before storage. */
export async function saveKey(userId, service, keyName, keyValue) {
  const encrypted = encrypt(keyValue);
  const pool = getPool();

  if (pool) {
    await pool.query(
      `INSERT INTO user_integrations (user_id, service, key_name, key_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, service, key_name)
       DO UPDATE SET key_value = EXCLUDED.key_value, updated_at = NOW()`,
      [userId, service, keyName, encrypted]
    );
    return;
  }

  const rows = readFile();
  const now  = new Date().toISOString();
  const idx  = rows.findIndex(
    r => String(r.userId) === String(userId) && r.service === service && r.keyName === keyName
  );
  const row = { userId: String(userId), service, keyName, keyValue: encrypted, updatedAt: now };
  if (idx >= 0) rows[idx] = row;
  else rows.push({ ...row, createdAt: now });
  writeFile(rows);
}

/** Get one decrypted value, or null if not stored. */
export async function getKey(userId, service, keyName) {
  const pool = getPool();

  if (pool) {
    const r = await pool.query(
      `SELECT key_value FROM user_integrations
       WHERE user_id = $1 AND service = $2 AND key_name = $3`,
      [userId, service, keyName]
    );
    if (!r.rows[0]) return null;
    return decrypt(r.rows[0].key_value);
  }

  const row = readFile().find(
    r => String(r.userId) === String(userId) && r.service === service && r.keyName === keyName
  );
  return row ? decrypt(row.keyValue) : null;
}

/** Delete one key. */
export async function deleteKey(userId, service, keyName) {
  const pool = getPool();

  if (pool) {
    await pool.query(
      `DELETE FROM user_integrations
       WHERE user_id = $1 AND service = $2 AND key_name = $3`,
      [userId, service, keyName]
    );
    return;
  }

  writeFile(
    readFile().filter(
      r => !(String(r.userId) === String(userId) && r.service === service && r.keyName === keyName)
    )
  );
}

/**
 * List which services + key names are configured for a user.
 * Returns an array of { service, keyName } — values are never included.
 */
export async function listKeys(userId) {
  const pool = getPool();

  if (pool) {
    const r = await pool.query(
      `SELECT service, key_name AS "keyName" FROM user_integrations WHERE user_id = $1`,
      [userId]
    );
    return r.rows;
  }

  return readFile()
    .filter(r => String(r.userId) === String(userId))
    .map(r => ({ service: r.service, keyName: r.keyName }));
}

/**
 * Get all decrypted keys for a user as a flat object { KEY_NAME: value }.
 * Used at request time to inject credentials into service calls.
 */
export async function getUserCredentials(userId) {
  const pool = getPool();
  let rows;

  if (pool) {
    const r = await pool.query(
      `SELECT service, key_name, key_value FROM user_integrations WHERE user_id = $1`,
      [userId]
    );
    rows = r.rows.map(row => ({ keyName: row.key_name, keyValue: row.key_value }));
  } else {
    rows = readFile()
      .filter(r => String(r.userId) === String(userId))
      .map(r => ({ keyName: r.keyName, keyValue: r.keyValue }));
  }

  const creds = {};
  for (const { keyName, keyValue } of rows) {
    try { creds[keyName] = decrypt(keyValue); }
    catch { /* skip corrupted entries */ }
  }
  return creds;
}

/** Delete all keys for a service (disconnect). */
export async function deleteService(userId, service) {
  const pool = getPool();

  if (pool) {
    await pool.query(
      `DELETE FROM user_integrations WHERE user_id = $1 AND service = $2`,
      [userId, service]
    );
    return;
  }

  writeFile(
    readFile().filter(
      r => !(String(r.userId) === String(userId) && r.service === service)
    )
  );
}

/**
 * List keys with metadata (updatedAt + masked key hint) for the settings UI.
 * Returns { service: { keyName: { updatedAt, keyHint } } }.
 */
export async function listKeysWithMeta(userId) {
  const pool = getPool();
  let rows;

  if (pool) {
    const r = await pool.query(
      `SELECT service, key_name AS "keyName", key_value AS "keyValue",
              updated_at AS "updatedAt"
       FROM user_integrations WHERE user_id = $1`,
      [userId]
    );
    rows = r.rows;
  } else {
    rows = readFile()
      .filter(r => String(r.userId) === String(userId))
      .map(r => ({ service: r.service, keyName: r.keyName, keyValue: r.keyValue, updatedAt: r.updatedAt ?? r.createdAt }));
  }

  const result = {};
  for (const row of rows) {
    let keyHint = '••••••••';
    try {
      const plain = decrypt(row.keyValue);
      keyHint = plain.length >= 10
        ? plain.slice(0, 6) + '••••' + plain.slice(-4)
        : plain.slice(0, 3) + '•••' + plain.slice(-2);
    } catch { /* corrupted — leave as dots */ }
    if (!result[row.service]) result[row.service] = {};
    result[row.service][row.keyName] = { updatedAt: row.updatedAt, keyHint };
  }
  return result;
}

/**
 * Resolve a single credential for a user.
 * Priority: DB value → process.env fallback.
 * This is how the personal .env setup stays working while new users use the DB.
 */
export async function resolveCredential(userId, keyName) {
  if (userId) {
    const dbValue = await getKey(userId, _serviceForKey(keyName), keyName).catch(() => null);
    if (dbValue) return dbValue;
  }
  return process.env[keyName] ?? null;
}

// Maps a key name to its service bucket (used for JSON fallback lookups)
function _serviceForKey(keyName) {
  const map = {
    NOTION_API_KEY: 'notion', NOTION_TASKS_DB_ID: 'notion', NOTION_NOTES_DB_ID: 'notion',
    GITHUB_TOKEN: 'github', GITHUB_REPOS: 'github', GITHUB_WEBHOOK_SECRET: 'github',
    SLACK_BOT_TOKEN: 'slack', SLACK_CHANNEL_ID: 'slack',
    TRELLO_API_KEY: 'trello', TRELLO_TOKEN: 'trello', TRELLO_BOARD_ID: 'trello',
    TODOIST_API_KEY: 'todoist',
    GEMINI_API_KEY: 'gemini', GROQ_API_KEY: 'groq',
    GOOGLE_CLIENT_ID: 'google', GOOGLE_CLIENT_SECRET: 'google',
    LINKEDIN_WEBHOOK_URL: 'linkedin',
  };
  return map[keyName] ?? 'other';
}
