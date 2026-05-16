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
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    // ── Users table ───────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        email         TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Migrate existing tables that predate is_active
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
    `);

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

    console.log('[db] Postgres connected — schema ready (users + user_integrations)');
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
