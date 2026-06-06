// server/services/db.js
// Postgres when DATABASE_URL is set; JSON file fallback for local dev.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, '..', 'users.json');

let pool = null;

export function getPool() { return pool; }

export async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.log('[db] No DATABASE_URL — using JSON file store (users.json)');
    return;
  }
  try {
    const { default: pkg } = await import('pg');
    const Pool = pkg.Pool ?? pkg;
    // Neon (and most hosted Postgres) requires SSL.
    // rejectUnauthorized:false works everywhere; for Neon the cert is valid so
    // we can set it to true when the URL contains neon.tech.
    const isNeon = process.env.DATABASE_URL.includes('neon.tech');
    // Add uselibpqcompat to silence pg's SSL deprecation warning on Neon URLs
    const connStr = isNeon && !process.env.DATABASE_URL.includes('uselibpqcompat')
      ? process.env.DATABASE_URL.replace('sslmode=require', 'sslmode=require&uselibpqcompat=true')
      : process.env.DATABASE_URL;
    pool = new Pool({
      connectionString: connStr,
      ssl: isNeon ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
      // Neon serverless connections can be idle-dropped — keep pool small
      max: isNeon ? 5 : 10,
      idleTimeoutMillis: isNeon ? 10000 : 30000,
      connectionTimeoutMillis: 5000,
    });

    // ── Users table ───────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        email         TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        google_id     TEXT UNIQUE,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id  TEXT UNIQUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin   BOOLEAN DEFAULT FALSE`);

    // ── User integrations table ───────────────────────────────────────────────
    // Stores one encrypted key/value per row, keyed by (user_id, service, key_name).
    // key_value is AES-256-GCM encrypted — never stored in plain text.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_integrations (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service    TEXT NOT NULL,
        key_name   TEXT NOT NULL,
        key_value  TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, service, key_name)
      )
    `);

    console.log(`[db] ${isNeon ? 'Neon' : 'Postgres'} connected — schema ready (users + user_integrations)`);
  } catch (err) {
    console.error('[db] Postgres init failed:', err.message, '— falling back to JSON store');
    pool = null;
  }
}

// ─── JSON file helpers (users) ────────────────────────────────────────────────

function readUsers() {
  if (!existsSync(USERS_FILE)) return [];
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ─── User CRUD ────────────────────────────────────────────────────────────────

export async function dbCreateUser({ username, email, passwordHash }) {
  const lc = username.toLowerCase();

  if (pool) {
    const r = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, is_active AS "isActive", created_at AS "createdAt"`,
      [lc, email || null, passwordHash]
    );
    return r.rows[0];
  }

  const users = readUsers();
  if (users.find(u => u.username === lc)) throw new Error('Username already taken');
  const user = {
    id:           Date.now(),
    username:     lc,
    email:        email || null,
    passwordHash,
    isActive:     true,
    createdAt:    new Date().toISOString(),
  };
  saveUsers([...users, user]);
  return { id: user.id, username: user.username, email: user.email, isActive: user.isActive, createdAt: user.createdAt };
}

export async function dbFindByUsername(username) {
  const lc = username.toLowerCase();
  if (pool) {
    const r = await pool.query('SELECT * FROM users WHERE username = $1', [lc]);
    return r.rows[0] ?? null;
  }
  return readUsers().find(u => u.username === lc) ?? null;
}

export async function dbFindById(id) {
  if (pool) {
    const r = await pool.query(
      `SELECT id, username, email, is_active AS "isActive", created_at AS "createdAt"
       FROM users WHERE id = $1`,
      [id]
    );
    return r.rows[0] ?? null;
  }
  const u = readUsers().find(u => String(u.id) === String(id));
  if (!u) return null;
  return { id: u.id, username: u.username, email: u.email, isActive: u.isActive ?? true, createdAt: u.createdAt };
}

export async function dbUpdateEmail(userId, email) {
  if (pool) {
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email || null, userId]);
    return;
  }
  const users = readUsers();
  const idx = users.findIndex(u => String(u.id) === String(userId));
  if (idx < 0) throw new Error('User not found');
  users[idx].email = email || null;
  saveUsers(users);
}

export async function dbUpdatePasswordHash(userId, passwordHash) {
  if (pool) {
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    return;
  }
  const users = readUsers();
  const idx = users.findIndex(u => String(u.id) === String(userId));
  if (idx < 0) throw new Error('User not found');
  users[idx].passwordHash = passwordHash;
  saveUsers(users);
}

export async function dbDeleteUser(userId) {
  if (pool) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    return;
  }
  saveUsers(readUsers().filter(u => String(u.id) !== String(userId)));
}

export async function dbFindByGoogleId(googleId) {
  if (pool) {
    const r = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    return r.rows[0] ?? null;
  }
  return readUsers().find(u => u.googleId === googleId) ?? null;
}

export async function dbFindByEmail(email) {
  if (pool) {
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return r.rows[0] ?? null;
  }
  return readUsers().find(u => u.email === email) ?? null;
}

export async function dbLinkGoogleId(userId, googleId) {
  if (pool) {
    await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, userId]);
    return;
  }
  const users = readUsers();
  const idx = users.findIndex(u => String(u.id) === String(userId));
  if (idx >= 0) { users[idx].googleId = googleId; saveUsers(users); }
}

export async function dbCreateGoogleUser({ username, email, googleId }) {
  const lc = username.toLowerCase();
  if (pool) {
    const r = await pool.query(
      `INSERT INTO users (username, email, password_hash, google_id)
       VALUES ($1, $2, 'GOOGLE_AUTH_ONLY', $3)
       RETURNING id, username, email, is_active AS "isActive", created_at AS "createdAt"`,
      [lc, email || null, googleId]
    );
    return r.rows[0];
  }
  const users = readUsers();
  if (users.find(u => u.username === lc)) throw new Error('Username already taken');
  const user = {
    id: Date.now(), username: lc, email: email || null,
    passwordHash: 'GOOGLE_AUTH_ONLY', googleId,
    isActive: true, createdAt: new Date().toISOString(),
  };
  saveUsers([...users, user]);
  return { id: user.id, username: user.username, email: user.email, isActive: user.isActive, createdAt: user.createdAt };
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function dbListUsers() {
  if (pool) {
    const r = await pool.query(
      `SELECT id, username, email, is_active AS "isActive", is_admin AS "isAdmin", created_at AS "createdAt" FROM users ORDER BY id`
    );
    return r.rows;
  }
  return readUsers().map(u => ({
    id: u.id, username: u.username, email: u.email ?? null,
    isActive: u.isActive ?? true, isAdmin: u.isAdmin ?? false, createdAt: u.createdAt,
  }));
}

export async function dbSetAdmin(userId, isAdmin) {
  if (pool) {
    await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [isAdmin, userId]);
    return;
  }
  const users = readUsers();
  const idx = users.findIndex(u => String(u.id) === String(userId));
  if (idx >= 0) { users[idx].isAdmin = isAdmin; saveUsers(users); }
}

export async function dbIsAdmin(userId) {
  if (pool) {
    const r = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.is_admin ?? false;
  }
  const u = readUsers().find(u => String(u.id) === String(userId));
  return u?.isAdmin ?? false;
}
