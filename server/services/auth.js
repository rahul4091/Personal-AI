// server/services/auth.js
// Google OAuth2 singleton — shared by gmail.js and calendar.js

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'tokens.json');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
];

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

export function getAuthClient() {
  const client = createOAuth2Client();

  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    client.setCredentials(tokens);

    // Auto-refresh on expiry
    client.on('tokens', updated => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...updated }));
    });
  }

  return client;
}

export function saveTokens(tokens, userId = null) {
  let connectedUserId = userId;
  if (connectedUserId === null && fs.existsSync(TOKEN_PATH)) {
    try { connectedUserId = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')).connectedUserId ?? null; } catch {}
  }
  const data = { ...tokens };
  if (connectedUserId !== null) data.connectedUserId = connectedUserId;
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data));
}

export function getConnectedUserId() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')).connectedUserId ?? null; } catch { return null; }
}

export function isConnected() {
  if (!fs.existsSync(TOKEN_PATH)) return false;
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    // Valid if we have a refresh token (can always get a new access token)
    // or the access token hasn't expired yet
    return !!(tokens.refresh_token || (tokens.expiry_date && tokens.expiry_date > Date.now()));
  } catch {
    return false;
  }
}

export function getAuthUrl(state = '') {
  const opts = { access_type: 'offline', scope: SCOPES, prompt: 'consent' };
  if (state) opts.state = state;
  return createOAuth2Client().generateAuthUrl(opts);
}

export default { createOAuth2Client, getAuthClient, saveTokens, isConnected, getAuthUrl, getConnectedUserId };
