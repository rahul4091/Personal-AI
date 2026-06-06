// server/services/users.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbCreateUser, dbFindByUsername, dbFindById, dbUpdateEmail, dbUpdatePasswordHash, dbDeleteUser, dbFindByGoogleId, dbFindByEmail, dbLinkGoogleId, dbCreateGoogleUser } from './db.js';

export { dbFindByGoogleId, dbFindByEmail, dbLinkGoogleId, dbCreateGoogleUser };

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  console.warn('[auth] JWT_SECRET not set — tokens will invalidate on server restart');
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
})();

const SALT_ROUNDS = 12;

export async function createUser(username, password, email) {
  if (!username?.trim())          throw new Error('Username is required');
  if (!/^\w{3,32}$/.test(username.trim())) throw new Error('Username must be 3–32 characters (letters, numbers, underscores)');
  if (!password || !password.trim())        throw new Error('Password cannot be blank or only spaces');
  if (password.length < 8)                 throw new Error('Password must be at least 8 characters');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    return await dbCreateUser({ username: username.trim(), email: email?.trim() || null, passwordHash });
  } catch (err) {
    if (err.code === '23505' || err.message?.includes('unique') || err.message?.includes('already taken')) {
      throw new Error('Username already taken — please choose another');
    }
    throw err;
  }
}

export async function loginUser(username, password) {
  if (!username || !password) throw new Error('Username and password are required');
  const user = await dbFindByUsername(username);
  if (!user) throw new Error('Invalid username or password');

  // Handle both Postgres (snake_case) and JSON file (camelCase) schemas
  const hash = user.password_hash ?? user.passwordHash;
  if (hash === 'GOOGLE_AUTH_ONLY') throw new Error('This account uses Google sign-in. Click "Continue with Google" below.');
  const ok   = await bcrypt.compare(password, hash);
  if (!ok) throw new Error('Invalid username or password');

  return { id: user.id, username: user.username, email: user.email ?? null };
}

export function signToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function getUserById(id) {
  return dbFindById(id);
}

export async function updateEmail(userId, email) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Invalid email format');
  }
  await dbUpdateEmail(userId, email?.trim() || null);
}

export async function updatePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw new Error('Both current and new password are required');
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters');
  const user = await dbFindById(userId);
  if (!user) throw new Error('User not found');
  const fullUser = await dbFindByUsername(user.username);
  const hash = fullUser.password_hash ?? fullUser.passwordHash;
  const ok = await bcrypt.compare(currentPassword, hash);
  if (!ok) throw new Error('Current password is incorrect');
  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await dbUpdatePasswordHash(userId, newHash);
}

export async function deleteUser(userId, password) {
  const user = await dbFindById(userId);
  if (!user) throw new Error('User not found');
  const fullUser = await dbFindByUsername(user.username);
  const hash = fullUser.password_hash ?? fullUser.passwordHash;
  if (hash === 'GOOGLE_AUTH_ONLY') throw new Error('This account uses Google sign-in — no password to verify. Contact support to delete it.');
  const ok = await bcrypt.compare(password, hash);
  if (!ok) throw new Error('Password is incorrect');
  await dbDeleteUser(userId);
}
