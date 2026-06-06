// server/index.js
import tracing    from './services/tracing.js'; // FIRST — sets LangSmith env before any LangChain module loads
import crypto     from 'crypto';
import express    from 'express';
import cors       from 'cors';
import cron       from 'node-cron';
import { fileURLToPath } from 'url';
import path       from 'path';
import fs         from 'fs';

import llm        from './services/llm.js';
import notion     from './services/notion.js';
import gmail      from './services/gmail.js';
import calendar   from './services/calendar.js';
import memory     from './services/memory.js';
import slack      from './services/slack.js';
import github     from './services/github.js';
import trello     from './services/trello.js';
import content    from './services/content.js';
import todoist    from './services/todoist.js';
import auth       from './services/auth.js';
import { initDB, getPool, dbListUsers, dbSetAdmin, dbIsAdmin, dbDeleteUser } from './services/db.js';
import * as userService from './services/users.js';
import * as integrations from './services/integrations.js';
import langchainAgent from './services/langchain-agent.js';
import OpenAI from 'openai';

const app  = express();
const PORT = process.env.PORT ?? 3001;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null,
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', requireAuth, async (req, res) => {
  const creds = await getUserCreds(req.user.userId);
  const googleForUser = auth.isConnected(req.user.userId);
  // Shared = admin set the key in .env so all users inherit it
  const geminiShared = !!process.env.GEMINI_API_KEY;
  const groqShared   = !!process.env.GROQ_API_KEY;
  res.json({
    ok:           true,
    google:       googleForUser,
    gemini:       !!(creds.GEMINI_API_KEY) || geminiShared,
    groq:         !!(creds.GROQ_API_KEY)   || groqShared,
    geminiShared, // true = running on admin's key, user hasn't added their own
    groqShared,
    notion:       !!(creds.NOTION_API_KEY),
    slack:        !!(creds.SLACK_BOT_TOKEN),
    github:       github.isConfigured(creds),
    trello:       !!(creds.TRELLO_API_KEY),
    todoist:      !!(creds.TODOIST_API_KEY),
    linkedin:     !!(creds.LINKEDIN_WEBHOOK_URL),
    tracing:      tracing.tracingStatus().enabled,
  });
});

// ─── Google OAuth2 ────────────────────────────────────────────────────────────

// Authenticated endpoint — frontend calls this first to get the OAuth URL (so userId is baked in)
app.get('/api/auth/google/init', requireAuth, (req, res) => {
  const fromSettings = req.query.from === 'settings';
  const state = `uid:${req.user.userId}${fromSettings ? ':from:settings' : ''}`;
  res.json({ url: auth.getAuthUrl(state) });
});

// Unauthenticated — used from the login page to sign in / sign up via Google
app.get('/api/auth/google/signin', (req, res) => {
  res.redirect(auth.getAuthUrl('mode:signin'));
});

// Legacy redirect — now requires auth and delegates to /api/auth/google/init so userId is in state
app.get('/api/auth/google', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    const frontendURL = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : (process.env.APP_URL ?? 'http://localhost:5173');
    return res.redirect(`${frontendURL}/`);
  }
  try {
    const payload = userService.verifyToken(header.slice(7));
    const fromSettings = req.query.from === 'settings';
    const state = `uid:${payload.userId}${fromSettings ? ':from:settings' : ''}`;
    res.redirect(auth.getAuthUrl(state));
  } catch {
    const frontendURL = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : (process.env.APP_URL ?? 'http://localhost:5173');
    return res.redirect(`${frontendURL}/`);
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  const frontendURL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.APP_URL ?? 'http://localhost:5173');
  try {
    const client     = auth.createOAuth2Client();
    const { tokens } = await client.getToken(req.query.code);
    const stateStr   = req.query.state ?? '';

    // ── Google Sign-in / Sign-up flow ────────────────────────────────────────
    if (stateStr.includes('mode:signin')) {
      client.setCredentials(tokens);
      const { google: googleapis } = await import('googleapis');
      const oauth2   = googleapis.oauth2({ version: 'v2', auth: client });
      const profile  = await oauth2.userinfo.get();
      const googleId = profile.data.id;
      const email    = profile.data.email;
      const name     = profile.data.name ?? '';

      let user = await userService.dbFindByGoogleId(googleId);

      if (!user) {
        // Check if an account with same email exists — link it
        const existing = await userService.dbFindByEmail(email);
        if (existing) {
          await userService.dbLinkGoogleId(existing.id, googleId);
          user = existing;
        } else {
          // Create a new account from the Google profile
          let base = (email.split('@')[0] ?? name).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 28) || 'user';
          let username = base;
          let attempt  = 1;
          while (true) {
            try {
              user = await userService.dbCreateGoogleUser({ username, email, googleId });
              break;
            } catch (e) {
              if (!e.message.includes('already taken') && !e.message.includes('unique')) throw e;
              username = `${base}_${attempt++}`;
            }
          }
        }
      }

      // Save Google tokens linked to this user, then redirect with JWT
      await auth.saveTokens(tokens, user.id);
      const token = userService.signToken({ id: user.id, username: user.username });
      return res.redirect(`${frontendURL}/?google_token=${token}`);
    }

    // ── Connect Google to an existing logged-in account ───────────────────────
    const uidMatch = stateStr.match(/uid:(\d+)/);
    const userId   = uidMatch ? parseInt(uidMatch[1], 10) : null;
    if (!userId) {
      console.error('[auth/google/callback] missing uid in OAuth state — cannot save tokens');
      return res.redirect(`${frontendURL}/?auth_error=google_failed`);
    }
    await auth.saveTokens(tokens, userId);
    const fromSettings = stateStr.includes('from:settings');
    res.redirect(`${frontendURL}${fromSettings ? '/settings?google_connected=true' : '/?connected=true'}`);
  } catch (err) {
    console.error('[auth/google/callback] FULL ERROR:', err);
    res.redirect(`${frontendURL}/?auth_error=google_failed`);
  }
});

// Returns the Gmail address — only for the user who connected Google
app.get('/api/auth/google/email', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  if (!auth.isConnected(uid)) return res.json({ connected: false, email: null });
  try {
    const { google: googleapis } = await import('googleapis');
    const client = await auth.getAuthClient(uid);
    const gmail  = googleapis.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    res.json({ connected: true, email: profile.data.emailAddress });
  } catch (err) {
    res.json({ connected: true, email: null });
  }
});

app.get('/api/auth/status', requireAuth, (req, res) => {
  res.json({ connected: auth.isConnected(req.user.userId) });
});

// ─── User account routes ───────────────────────────────────────────────────────

// Signup disabled — re-enable when ready
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const user  = await userService.createUser(username, password, email);
    const token = userService.signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user  = await userService.loginUser(username, password);
    const token = userService.signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/users/me', async (req, res) => {
  const auth_header = req.headers.authorization;
  if (!auth_header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = userService.verifyToken(auth_header.slice(7));
    const user    = await userService.getUserById(payload.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isAdmin = await dbIsAdmin(payload.userId);
    res.json({ id: user.id, username: user.username, email: user.email, isAdmin });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
// Used by any route that requires a logged-in user.

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = userService.verifyToken(header.slice(7));
    req.user = { userId: payload.userId, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = userService.verifyToken(header.slice(7));
    req.user = { userId: payload.userId, username: payload.username };
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const admin = await dbIsAdmin(req.user.userId);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ─── Integration key routes ────────────────────────────────────────────────────
// These routes let the frontend save, list, and delete per-user API keys.
// All values are encrypted before touching the database.

// List which integrations are configured — returns metadata for the settings UI
app.get('/api/integrations', requireAuth, async (req, res) => {
  try {
    res.json(await integrations.listKeysWithMeta(req.user.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save (or overwrite) a single key
// Body: { service, keyName, keyValue }
app.post('/api/integrations', requireAuth, async (req, res) => {
  try {
    const { service, keyName, keyValue } = req.body;
    if (!service?.trim())   return res.status(400).json({ error: 'service is required' });
    if (!keyName?.trim())   return res.status(400).json({ error: 'keyName is required' });
    if (!keyValue?.trim())  return res.status(400).json({ error: 'keyValue is required' });
    await integrations.saveKey(req.user.userId, service.trim(), keyName.trim(), keyValue.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a single key
app.delete('/api/integrations/:service/:keyName', requireAuth, async (req, res) => {
  try {
    await integrations.deleteKey(req.user.userId, req.params.service, req.params.keyName);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect all keys for a service
app.delete('/api/integrations/:service', requireAuth, async (req, res) => {
  try {
    await integrations.deleteService(req.user.userId, req.params.service);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Credential test + save endpoint ──────────────────────────────────────────
// Tests the supplied credentials against the real API, and saves them only on success.

// Extracts a plain 32-char Notion ID from whatever the user pasted (full URL or raw ID).
function extractNotionId(input) {
  if (!input?.trim()) return null;
  const s = input.trim().replace(/-/g, '');           // strip dashes (UUID format)
  const match = s.match(/[0-9a-f]{32}/i);             // find the first 32-char hex run
  return match ? match[0] : null;
}

// Strips invisible Unicode chars that trim() misses: zero-width spaces, BOM, soft hyphens, etc.
function sanitizeKey(raw) {
  return (raw ?? '').trim()
    .replace(/​/g, '').replace(/‌/g, '').replace(/‍/g, '')
    .replace(/﻿/g, '').replace(/­/g, '').replace(/⁠/g, '');
}

app.post('/api/credentials/test/:service', requireAuth, async (req, res) => {
  const { service } = req.params;
  const body        = req.body ?? {};
  const uid         = req.user.userId;

  try {
    switch (service) {

      case 'gemini': {
        const geminiKey = sanitizeKey(body.key);
        if (!geminiKey) return res.status(400).json({ ok: false, error: 'API key is required' });
        if (!geminiKey.startsWith('AIza')) return res.status(400).json({ ok: false, error: 'Invalid format. Gemini keys start with AIza — get one at aistudio.google.com/apikey.' });
        const client = new OpenAI({
          apiKey:  geminiKey,
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        });
        try {
          await client.chat.completions.create({
            model:    'gemini-2.0-flash',
            messages: [{ role: 'user', content: 'Reply with the single word OK' }],
            max_tokens: 10,
          });
        } catch (apiErr) {
          const status = apiErr?.status ?? apiErr?.response?.status;
          // 429 = rate-limited but key is valid — save it with a notice
          if (status === 429) {
            await integrations.saveKey(uid, 'gemini', 'GEMINI_API_KEY', geminiKey);
            return res.json({ ok: true, warning: 'Key saved. Gemini is rate-limited right now (free-tier quota). It will work once the limit resets.' });
          }
          const msg = apiErr?.error?.message || apiErr?.error?.error?.message || apiErr?.message || 'Gemini API request failed';
          return res.status(400).json({ ok: false, error: `Gemini: ${msg}` });
        }
        await integrations.saveKey(uid, 'gemini', 'GEMINI_API_KEY', geminiKey);
        return res.json({ ok: true });
      }

      case 'groq': {
        const groqKey = sanitizeKey(body.key);
        if (!groqKey) return res.status(400).json({ ok: false, error: 'API key is required' });
        if (!groqKey.startsWith('gsk_')) return res.status(400).json({ ok: false, error: 'Invalid format. Groq keys start with gsk_ — get one at console.groq.com/keys.' });
        const client = new OpenAI({
          apiKey:  groqKey,
          baseURL: 'https://api.groq.com/openai/v1',
        });
        try {
          await client.chat.completions.create({
            model:    'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: 'Reply with the single word OK' }],
            max_tokens: 10,
          });
        } catch (apiErr) {
          const msg = apiErr?.error?.error?.message || apiErr?.message || 'Groq API request failed';
          return res.status(400).json({ ok: false, error: `Groq: ${msg}` });
        }
        await integrations.saveKey(uid, 'groq', 'GROQ_API_KEY', groqKey);
        return res.json({ ok: true });
      }

      case 'notion': {
        // Strip ALL whitespace — Notion's UI wraps long tokens and copy-paste
        // can introduce embedded newlines that trim() misses.
        const notionKey = sanitizeKey(body.apiKey).replace(/\s+/g, '');
        const { taskDbId, notesDbId } = body;
        console.log(`[notion/test] received key prefix="${notionKey.slice(0, 15)}" len=${notionKey.length}`);
        if (!notionKey) return res.status(400).json({ ok: false, error: 'API key is required' });
        // Notion now issues tokens as bare `ntn_…` — the old `secret_ntn_…` format wraps the same
        // value with a `secret_` prefix that their API no longer needs. Strip it if present.
        const cleanKey = notionKey.startsWith('secret_ntn_') ? notionKey.slice('secret_'.length) : notionKey;
        if (!cleanKey.startsWith('ntn_') && !cleanKey.startsWith('secret_')) {
          return res.status(400).json({ ok: false, error: `Wrong key format — received "${notionKey.slice(0, 12)}…". Copy the Access token from app.notion.com/developers/connections — it starts with ntn_` });
        }
        // Use /search (POST) — more reliable than /users/me for new secret_ntn_ tokens
        const meResp = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ page_size: 1 }),
        });
        console.log(`[notion/test] Notion /search status=${meResp.status}`);
        if (!meResp.ok) {
          const e = await meResp.json().catch(() => ({}));
          console.error('[notion/test] Notion error:', e);
          const diag = `Server received: "${cleanKey.slice(0, 12)}…" (${cleanKey.length} chars). `;
          const hint = e.code === 'unauthorized' || meResp.status === 401
            ? 'Notion says the token is invalid. Try: notion.so/profile/integrations (new URL) or notion.so/my-integrations → open your integration → click "Show" next to the secret → copy it fresh. If this keeps failing, use "Save anyway" below.'
            : `Notion error: ${e.message || meResp.status}`;
          return res.status(400).json({ ok: false, error: diag + hint });
        }
        const notionUser = { name: 'Integration' }; // /search doesn't return user info, that's fine
        // Extract plain 32-char ID from a full Notion URL if the user pasted a URL
        const resolvedTaskId  = extractNotionId(taskDbId);
        const resolvedNotesId = extractNotionId(notesDbId);
        // Test DB IDs if provided
        for (const [label, dbId] of [['Tasks', resolvedTaskId], ['Notes', resolvedNotesId]]) {
          if (!dbId) continue;
          const dbResp = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
            headers: { 'Authorization': `Bearer ${cleanKey}`, 'Notion-Version': '2022-06-28' },
          });
          if (!dbResp.ok) {
            const e = await dbResp.json().catch(() => ({}));
            const msg = e.code === 'object_not_found'
              ? `${label} database not found. Open the database in Notion → click ··· → Connections → add your integration, then try again.`
              : `${label} database error: ${e.message || dbResp.status}`;
            return res.status(400).json({ ok: false, error: msg });
          }
        }
        // All passed — save
        await integrations.saveKey(uid, 'notion', 'NOTION_API_KEY', cleanKey);
        if (resolvedTaskId)  await integrations.saveKey(uid, 'notion', 'NOTION_TASKS_DB_ID',  resolvedTaskId);
        if (resolvedNotesId) await integrations.saveKey(uid, 'notion', 'NOTION_NOTES_DB_ID', resolvedNotesId);
        return res.json({ ok: true, meta: { userName: notionUser.name } });
      }

      case 'github': {
        const { token, owner, repo } = body;
        const ghToken = sanitizeKey(body.token);
        const ghOwner = sanitizeKey(body.owner);
        const ghRepo  = sanitizeKey(body.repo);
        if (!ghToken) return res.status(400).json({ ok: false, error: 'Token is required' });
        if (!ghOwner) return res.status(400).json({ ok: false, error: 'Username / org is required' });
        if (!ghRepo)  return res.status(400).json({ ok: false, error: 'Repository name is required' });
        if (!ghToken.startsWith('ghp_') && !ghToken.startsWith('gho_') && !ghToken.startsWith('github_pat_') && !/^[0-9a-f]{40}$/i.test(ghToken)) {
          return res.status(400).json({ ok: false, error: 'Invalid token format. GitHub personal access tokens start with ghp_ (classic) or github_pat_ (fine-grained). Generate one at github.com/settings/tokens.' });
        }
        const resp = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (!resp.ok) {
          const e = await resp.json().catch(() => ({}));
          return res.status(400).json({ ok: false, error: e.message || `GitHub returned ${resp.status}` });
        }
        const ghUser = await resp.json();
        await integrations.saveKey(uid, 'github', 'GITHUB_TOKEN', ghToken);
        await integrations.saveKey(uid, 'github', 'GITHUB_OWNER', ghOwner);
        await integrations.saveKey(uid, 'github', 'GITHUB_REPO',  ghRepo);
        return res.json({ ok: true, meta: { username: ghUser.login } });
      }

      case 'trello': {
        const trelloKey   = sanitizeKey(body.apiKey);
        const trelloToken = sanitizeKey(body.token);
        const trelloBoardId = sanitizeKey(body.boardId);
        if (!trelloKey || !trelloToken) return res.status(400).json({ ok: false, error: 'API key and token are required' });
        const resp = await fetch(
          `https://api.trello.com/1/members/me?key=${encodeURIComponent(trelloKey)}&token=${encodeURIComponent(trelloToken)}&boards=open`
        );
        if (!resp.ok) {
          const e = await resp.text().catch(() => '');
          return res.status(400).json({ ok: false, error: e || `Trello returned ${resp.status}` });
        }
        const trelloUser = await resp.json();
        if (trelloBoardId) {
          const boards = trelloUser.boards ?? [];
          const found  = boards.find(b => b.id === trelloBoardId || b.shortLink === trelloBoardId);
          if (!found) {
            const names = boards.map(b => b.name).join(', ') || 'none';
            return res.status(400).json({ ok: false, error: `Board not found. Your boards: ${names}` });
          }
          await integrations.saveKey(uid, 'trello', 'TRELLO_BOARD_ID', trelloBoardId);
        }
        await integrations.saveKey(uid, 'trello', 'TRELLO_API_KEY', trelloKey);
        await integrations.saveKey(uid, 'trello', 'TRELLO_TOKEN',   trelloToken);
        return res.json({ ok: true, meta: { fullName: trelloUser.fullName } });
      }

      case 'slack': {
        const slackToken  = sanitizeKey(body.botToken);
        const slackUserId = sanitizeKey(body.userId);
        if (!slackToken) return res.status(400).json({ ok: false, error: 'Bot token is required' });
        if (!slackToken.startsWith('xoxb-')) return res.status(400).json({ ok: false, error: 'Invalid format. Slack bot tokens start with xoxb- — get one at api.slack.com/apps → OAuth & Permissions.' });
        const resp = await fetch('https://slack.com/api/auth.test', {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${slackToken}`, 'Content-Type': 'application/json' },
        });
        const data = await resp.json();
        if (!data.ok) return res.status(400).json({ ok: false, error: data.error || 'Invalid Slack token' });
        await integrations.saveKey(uid, 'slack', 'SLACK_BOT_TOKEN', slackToken);
        if (slackUserId) await integrations.saveKey(uid, 'slack', 'SLACK_USER_ID', slackUserId);
        return res.json({ ok: true, meta: { teamName: data.team, botName: data.user } });
      }

      case 'linkedin': {
        const webhookUrl = sanitizeKey(body.webhookUrl);
        if (!webhookUrl) return res.status(400).json({ ok: false, error: 'Webhook URL is required' });
        if (!webhookUrl.startsWith('https://')) {
          return res.status(400).json({ ok: false, error: 'Webhook URL must start with https://' });
        }
        await integrations.saveKey(uid, 'linkedin', 'LINKEDIN_WEBHOOK_URL', webhookUrl);
        return res.json({ ok: true });
      }

      case 'todoist': {
        const todoistKey = sanitizeKey(body.key);
        if (!todoistKey) return res.status(400).json({ ok: false, error: 'API key is required' });
        if (todoistKey.length < 20) return res.status(400).json({ ok: false, error: 'Key looks too short. Paste the full API token from Todoist → Settings → Integrations → Developer.' });
        const resp = await fetch('https://api.todoist.com/api/v1/tasks', {
          headers: { Authorization: `Bearer ${todoistKey}` },
        });
        if (!resp.ok) {
          const e = await resp.json().catch(() => ({}));
          return res.status(400).json({ ok: false, error: e.error || e.message || `Todoist returned ${resp.status}` });
        }
        await integrations.saveKey(uid, 'todoist', 'TODOIST_API_KEY', todoistKey);
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ ok: false, error: `Unknown service: ${service}` });
    }
  } catch (err) {
    console.error(`[credentials/test/${service}]`, err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── Save without testing (Notion bypass for persistent 401 issues) ──────────────
app.post('/api/credentials/save/notion', requireAuth, async (req, res) => {
  try {
    const uid = req.user.userId;
    const raw         = sanitizeKey(req.body.apiKey ?? '').replace(/\s+/g, '');
    const notionKey   = raw.startsWith('secret_ntn_') ? raw.slice('secret_'.length) : raw;
    const taskDbId    = extractNotionId(req.body.taskDbId  ?? '');
    const notesDbId   = extractNotionId(req.body.notesDbId ?? '');
    if (!notionKey) return res.status(400).json({ ok: false, error: 'API key is required' });
    await integrations.saveKey(uid, 'notion', 'NOTION_API_KEY', notionKey);
    if (taskDbId)  await integrations.saveKey(uid, 'notion', 'NOTION_TASKS_DB_ID',  taskDbId);
    if (notesDbId) await integrations.saveKey(uid, 'notion', 'NOTION_NOTES_DB_ID', notesDbId);
    res.json({ ok: true, warning: 'Saved without verifying — if Notion features stay empty, the token or database IDs may be wrong.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Account management routes ─────────────────────────────────────────────────

app.put('/api/users/me/email', requireAuth, async (req, res) => {
  try {
    await userService.updateEmail(req.user.userId, req.body.email);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/me/password', requireAuth, async (req, res) => {
  try {
    await userService.updatePassword(req.user.userId, req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/me', requireAuth, async (req, res) => {
  try {
    await userService.deleteUser(req.user.userId, req.body.password);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbListUsers();
    // Attach integration counts per user
    const withCounts = await Promise.all(users.map(async u => {
      try {
        const keys = await integrations.listKeysWithMeta(u.id);
        return { ...u, integrationCount: keys.length };
      } catch {
        return { ...u, integrationCount: 0 };
      }
    }));
    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.userId) return res.status(400).json({ error: 'Cannot delete your own account here' });
  try {
    await dbDeleteUser(targetId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/admin', requireAdmin, async (req, res) => {
  try {
    await dbSetAdmin(Number(req.params.id), !!req.body.isAdmin);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const users = await dbListUsers();
    const pool = getPool();
    let integrationRows = 0;
    if (pool) {
      const r = await pool.query('SELECT COUNT(*) FROM user_integrations');
      integrationRows = Number(r.rows[0].count);
    }
    res.json({
      userCount: users.length,
      adminCount: users.filter(u => u.isAdmin).length,
      integrationRows,
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Multi-action schema ──────────────────────────────────────────────────────
// The agent can execute multiple actions in one message.

// Compact schema — keep as short as possible to save tokens
const AGENT_SCHEMA = `{"actions":[{"intent":"add_task|update_task|delete_task|get_tasks|create_note|get_notes|draft_email|send_email|get_emails|get_emails_range|archive_email|create_event|update_event|delete_event|get_calendar|scan_conflicts|block_focus_time|get_prs|get_issues|create_issue|delete_issue|close_issue|reopen_issue|update_issue|comment_issue|close_pr|get_trello|run_digest|get_digest|add_vip|save_memory|draft_linkedin|general_chat","params":{"title":null,"body":null,"to":null,"date":null,"startDate":null,"endDate":null,"duration":null,"status":null,"taskId":null,"email":null,"source":null,"memKey":null,"memValue":null,"labels":null,"repo":null,"recurring":false,"days":null,"time":null}}],"reply":"brief reply"}`;

// Pre-compute date anchors once per request (called inside the handler)
function buildDateAnchors() {
  const now = new Date();
  const iso  = d => d.toISOString().slice(0, 10);
  const add  = n => new Date(now.getTime() + n * 86400000);
  const prevWeekday = wday => {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() - wday + 7) % 7 || 7));
    return d;
  };
  return [
    `today=${iso(now)}`,
    `yesterday=${iso(add(-1))}`,
    `2_days_ago=${iso(add(-2))}`,
    `3_days_ago=${iso(add(-3))}`,
    `7_days_ago=${iso(add(-7))}`,
    `30_days_ago=${iso(add(-30))}`,
    `last_monday=${iso(prevWeekday(1))}`,
    `last_friday=${iso(prevWeekday(5))}`,
  ].join(', ');
}

// Routing rules injected into every classify call so the LLM always knows the rules
function buildRoutingRules() {
  return `
ROUTING RULES (follow exactly):
- "what do I have today / what's on today / show my day / what's my schedule" → TWO actions: get_calendar AND get_tasks (both in the actions array)
- "show my calendar / upcoming events / what meetings do I have" → intent:get_calendar
- "show my tasks / open tasks / todo list" → intent:get_tasks
- "add task / todo / reminder" → intent:add_task → Todoist only
- "add note / write note / save note" → intent:create_note → Notion only
- "read emails from <date>" → intent:get_emails_range, resolve dates using anchors: ${buildDateAnchors()}
- "add event tomorrow at 3pm / on May 20 at 2pm" → intent:create_event, date must be ISO format YYYY-MM-DDTHH:MM using date anchors above; duration in minutes
- "add event on Monday and Wednesday at 3pm" → intent:create_event, set recurring:true, days:[1,3] (Mon=1,Tue=2,Wed=3,Thu=4,Fri=5,Sat=6,Sun=7), time:"15:00", title
- "create issue in <repo>" → intent:create_issue, set repo to EXACTLY the repo name mentioned; NEVER create in a repo not mentioned
- "issues in <repo> / summary of <repo>" → intent:get_issues, set repo to the repo mentioned
- NEVER guess a repo; if no repo is mentioned and multiple are configured, ask the user which repo
- "delete event X / cancel meeting X" → intent:delete_event, title:X
- "reschedule event X to tomorrow at 3pm" → intent:update_event, title:X (to find it), date:ISO, duration optional
- "rename event X to Y" → intent:update_event, title:X, body:Y (body = new title)
- "delete task / remove task" → intent:delete_task, taskId if known, else title to search
- "rename task X to Y" → intent:update_task, taskId:X, title:Y
- "delete issue #N / remove issue #N / permanently delete issue #N" → intent:delete_issue, taskId:N (number only), repo; this uses GraphQL to truly delete
- "close issue #N" → intent:close_issue, taskId:N, repo (keeps issue, just closes it)
- "reopen issue #N" → intent:reopen_issue, taskId:N, repo
- "update issue #N title/body/labels" → intent:update_issue, taskId:N, title/body/labels, repo
- "comment on issue #N: ..." → intent:comment_issue, taskId:N, body:comment, repo
- "close PR #N / delete PR #N" → intent:close_pr, taskId:N, repo
- NEVER respond with general_chat for any GitHub issue/PR action — always use the correct intent
- NEVER respond with general_chat when the user asks about their calendar, tasks, emails, or PRs — always use the correct data-fetching intent`.trim();
}

// ─── Date resolver ───────────────────────────────────────────────────────────
// Converts what the LLM sends (ISO, natural language, partial) into a full ISO string.

function resolveDate(raw) {
  if (!raw) return null;

  // Already a valid date
  const direct = new Date(raw);
  if (!isNaN(direct)) return direct.toISOString();

  const s    = String(raw).toLowerCase().trim();
  const now  = new Date();
  const add  = n => new Date(now.getTime() + n * 86400000);

  // Relative keywords
  const relMap = {
    'today':     now,
    'tomorrow':  add(1),
    'yesterday': add(-1),
  };
  for (const [kw, d] of Object.entries(relMap)) {
    if (s.includes(kw)) {
      // Try to extract time like "3pm", "15:00", "3:30pm"
      const time = extractTime(s);
      if (time) { d.setHours(time.h, time.m, 0, 0); }
      else       { d.setHours(9, 0, 0, 0); }
      return d.toISOString();
    }
  }

  // "next monday", "this friday" etc.
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let i = 0; i < days.length; i++) {
    if (s.includes(days[i])) {
      const d    = new Date(now);
      const diff = (i - now.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      const time = extractTime(s);
      if (time) d.setHours(time.h, time.m, 0, 0);
      else      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    }
  }

  return null;
}

function extractTime(s) {
  // Matches: "3pm", "3:30pm", "15:00", "15:30"
  const m12 = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const min = parseInt(m12[2] ?? '0');
    if (m12[3].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (m12[3].toLowerCase() === 'am' && h === 12) h = 0;
    return { h, m: min };
  }
  const m24 = s.match(/(\d{1,2}):(\d{2})/);
  if (m24) return { h: parseInt(m24[1]), m: parseInt(m24[2]) };
  return null;
}

// ─── Single action executor ───────────────────────────────────────────────────

// Extract the body from the user's raw message for create_issue.
// The classify step may truncate a long body, so we pull it directly
// from the original message instead.
function extractIssueBody(message, title) {
  // If the message contains markdown headings, everything from the first ## is the body
  const mdStart = message.search(/##\s+\w/);
  if (mdStart > 0) return message.slice(mdStart).trim();

  // Otherwise strip the command prefix ("create issue in X: Title **Labels:**...")
  return message
    .replace(/^creates?\s+(?:a\s+)?(?:github\s+)?issue(?:\s+in\s+\S+)?[^:]*:\s*/i, '')
    .replace(new RegExp(`^#?\\s*Issue\\s*\\d*\\s*:?\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '')
    .replace(/^\*\*Labels:\*\*[^\n]*\n?/im, '')
    .trim() || message;
}

async function executeAction(intent, params, originalMessage = '', creds = {}, userId = null) {
  const apiKeys = { GEMINI_API_KEY: creds.GEMINI_API_KEY, GROQ_API_KEY: creds.GROQ_API_KEY };

  switch (intent) {

    case 'add_task': {
      if (!params.title?.trim()) return { error: 'Could not extract a task title from your message — please try again with a clear title.' };
      if (todoist.isConfigured(creds)) return await todoist.createTask(params.title.trim(), 'today', creds);
      if (notionReady(creds))          return await notion.createTask(params.title.trim(), 'Not started', creds);
      return { error: 'No task service configured. Add a Todoist or Notion key in Settings.' };
    }

    case 'update_task': {
      if (!params.taskId) return { error: 'taskId is required' };
      const isTodoist = /^\d+$/.test(params.taskId) || params.source === 'todoist';
      if (params.status && !params.title) {
        return isTodoist
          ? await todoist.updateTaskStatus(params.taskId, params.status, creds)
          : await notion.updateTaskStatus(params.taskId, params.status, creds);
      }
      const patches = {};
      if (params.title)  patches.title  = params.title;
      if (params.status) patches.status = params.status;
      return isTodoist
        ? await todoist.updateTask(params.taskId, patches, creds)
        : await notion.updateTask(params.taskId, patches, creds);
    }

    case 'get_tasks': {
      const [nt, tt] = await Promise.all([
        notionReady(creds)          ? notion.getTasks(creds)  : [],
        todoist.isConfigured(creds) ? todoist.getTasks('today | overdue', creds) : [],
      ]);
      return { notion: nt, todoist: tt };
    }

    case 'delete_task': {
      if (!params.taskId) return { error: 'taskId is required' };
      const isTodoist = /^\d+$/.test(params.taskId) || params.source === 'todoist';
      return isTodoist
        ? await todoist.deleteTask(params.taskId, creds)
        : await notion.deleteTask(params.taskId, creds);
    }

    case 'create_note':
      if (!params.title) return null;
      if (!notionReady(creds)) return { error: 'Notion is not configured' };
      return await notion.createNote(params.title, params.body ?? '', creds);

    case 'get_notes':
      return { notes: await notion.getNotes(creds) };

    case 'get_emails':
      return { emails: await gmail.triageInbox(userId, 10) };

    case 'get_emails_range': {
      const { startDate, endDate } = params;
      if (!startDate) return { error: 'startDate is required' };
      const emails = await gmail.getEmailsByDateRange(userId, startDate, endDate ?? new Date().toISOString().slice(0, 10));
      return { emails, count: emails.length, range: { startDate, endDate } };
    }

    case 'draft_email':
      if (params.to && params.body) {
        return await gmail.createDraft(userId, params.to, params.title ?? 'No subject', params.body);
      }
      return null;

    case 'send_email':
      if (params.to && params.body) {
        return await gmail.sendEmail(userId, params.to, params.title ?? 'No subject', params.body);
      }
      return null;

    case 'archive_email':
      return params.taskId ? await gmail.archiveEmail(userId, params.taskId) : null;

    case 'create_event': {
      if (!params.title) return { error: 'title is required' };

      if (params.recurring && params.days?.length && params.time) {
        return await calendar.createRecurringEvent(userId, params.title, params.days, params.time, params.duration ?? 60);
      }

      if (params.date) {
        const resolved = resolveDate(params.date);
        if (!resolved) return { error: `Could not parse date "${params.date}". Use format: YYYY-MM-DDTHH:MM` };
        console.log(`[create_event] title="${params.title}" raw="${params.date}" resolved="${resolved}"`);
        return await calendar.createEvent(userId, params.title, resolved, params.duration ?? 60);
      }

      return { error: 'Provide a date for a single event, or days + time for a recurring event.' };
    }

    case 'delete_event': {
      const target = params.title || params.taskId;
      if (!target) return { error: 'Provide the event name to delete' };
      return await calendar.deleteEvent(userId, target);
    }

    case 'update_event': {
      const target = params.title || params.taskId;
      if (!target) return { error: 'Provide the event name to update' };
      const patches = {};
      if (params.body)     patches.title    = params.body;
      if (params.date)     patches.date     = resolveDate(params.date) ?? params.date;
      if (params.duration) patches.duration = Number(params.duration);
      return await calendar.updateEvent(userId, target, patches);
    }

    case 'get_calendar':
      return { events: await calendar.getUpcoming(userId, 5) };

    case 'scan_conflicts':
      return { conflicts: await calendar.scanConflicts(userId) };

    case 'block_focus_time':
      return { blocks: await calendar.blockFocusTime(userId, params.title ?? 'Deep work') };

    case 'get_prs':
      return { prs: await github.getOpenPRs(params.repo, creds), stale: await github.scanStalePRs(3, params.repo, creds) };

    case 'create_issue': {
      if (!params.title) return { error: 'title is required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) {
        return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      }
      const labels = Array.isArray(params.labels)
        ? params.labels.map(l => String(l).trim()).filter(Boolean)
        : params.labels ? String(params.labels).split(',').map(l => l.trim()).filter(Boolean) : [];
      const userContext = extractIssueBody(originalMessage, params.title);
      const body = await llm.generate(
        `Write a detailed GitHub issue body in markdown for the issue titled: "${params.title}"\n\nUser context: ${userContext}\n\n` +
        `Structure it with these sections (use only the ones that apply):\n` +
        `## Summary\n## Goals\n## Suggested approach\n## Tests\n## Considerations\n\n` +
        `Use bullet points. Be specific and actionable. Do not repeat the title. Output only the markdown body.`,
        '', 'content', apiKeys
      ).catch(() => userContext);
      return await github.createIssue(params.title, body, labels, params.repo, creds);
    }

    case 'get_issues': {
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) {
        return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      }
      return { issues: await github.getIssues('open', params.repo, creds), repo: params.repo };
    }

    case 'delete_issue': {
      if (!params.taskId) return { error: 'Issue number is required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.deleteIssue(params.taskId, params.repo, creds);
    }

    case 'close_issue': {
      if (!params.taskId) return { error: 'Issue number (taskId) is required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      try {
        return await github.closeIssue(params.taskId, params.repo, creds);
      } catch (err) {
        const open = await github.getIssues('open', params.repo, creds).catch(() => []);
        const list = open.length ? open.map(i => `#${i.id} ${i.title}`).join(', ') : 'none';
        return { error: `Issue #${params.taskId} not found. Open issues: ${list}` };
      }
    }

    case 'reopen_issue': {
      if (!params.taskId) return { error: 'Issue number (taskId) is required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.reopenIssue(params.taskId, params.repo, creds);
    }

    case 'update_issue': {
      if (!params.taskId) return { error: 'Issue number (taskId) is required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      const patches = {};
      if (params.title)  patches.title  = params.title;
      if (params.body)   patches.body   = params.body;
      if (params.labels) patches.labels = Array.isArray(params.labels) ? params.labels : String(params.labels).split(',').map(l => l.trim());
      if (params.status) patches.state  = params.status === 'closed' ? 'closed' : 'open';
      return await github.updateIssue(params.taskId, patches, params.repo, creds);
    }

    case 'comment_issue': {
      if (!params.taskId || !params.body) return { error: 'Issue number and comment body are required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.commentOnIssue(params.taskId, params.body, params.repo, creds);
    }

    case 'close_pr': {
      if (!params.taskId) return { error: 'PR number (taskId) is required' };
      const repos = github.getRepos(creds);
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.closePR(params.taskId, params.repo, creds);
    }

    case 'get_trello':
      return { cards: await trello.getCards(creds), stale: await trello.scanStaleCards(5, creds) };

    case 'run_digest':
      runDigest(userId).catch(console.error);
      return { triggered: true, message: 'Digest is running in the background.' };

    case 'get_digest':
      return _digestCache.get(String(userId)) ?? { message: 'No digest yet — run one first.' };

    case 'add_vip':
      return params.email ? { vips: memory.addVIP(params.email) } : null;

    case 'save_memory': {
      if (!params.memKey || !params.memValue) return null;
      const facts = memory.saveFact(params.memKey, params.memValue);
      return { saved: true, key: params.memKey, value: params.memValue, totalFacts: facts.length };
    }

    case 'draft_linkedin':
      return params.source ? await content.draftLinkedInPost(params.source) : null;

    default:
      return null;
  }
}

// ─── Chat endpoint ────────────────────────────────────────────────────────────

const TASK_ACTION_INTENTS     = new Set(['add_task', 'update_task', 'delete_task', 'get_tasks']);
const CALENDAR_ACTION_INTENTS = new Set(['create_event', 'update_event', 'delete_event', 'get_calendar', 'scan_conflicts', 'block_focus_time']);
const GITHUB_ACTION_INTENTS   = new Set(['create_issue', 'delete_issue', 'close_issue', 'reopen_issue', 'update_issue', 'comment_issue', 'close_pr', 'get_issues', 'get_prs']);
const EMAIL_ACTION_INTENTS    = new Set(['draft_email', 'send_email', 'get_emails', 'get_emails_range', 'archive_email']);
const DIGEST_ACTION_INTENTS   = new Set(['run_digest', 'get_digest']);
const QUERY_INTENTS_SET       = new Set(['get_tasks','get_emails','get_emails_range','get_calendar','get_notes','get_prs','get_trello','get_digest','get_issues']);

const ACTION_STATUS = {
  add_task:         'Adding task…',
  update_task:      'Updating task…',
  delete_task:      'Deleting task…',
  get_tasks:        'Fetching tasks…',
  create_note:      'Creating note…',
  get_notes:        'Fetching notes…',
  draft_email:      'Drafting email…',
  send_email:       'Sending email…',
  get_emails:       'Checking inbox…',
  get_emails_range: 'Fetching emails…',
  archive_email:    'Archiving email…',
  create_event:     'Creating calendar event…',
  update_event:     'Updating event…',
  delete_event:     'Deleting event…',
  get_calendar:     'Checking calendar…',
  scan_conflicts:   'Scanning for conflicts…',
  block_focus_time: 'Blocking focus time…',
  get_prs:          'Fetching pull requests…',
  get_issues:       'Fetching issues…',
  create_issue:     'Creating issue…',
  close_issue:      'Closing issue…',
  run_digest:       'Running digest…',
  draft_linkedin:   'Drafting LinkedIn post…',
  get_trello:       'Fetching Trello board…',
  general_chat:     'Thinking…',
};

// ─── Deterministic pre-classifier ────────────────────────────────────────────
// Intercepts common data-fetching patterns before the LLM classifier runs.
// Returns a classified object (same shape as llm.classify) or null to fall through.

function preClassify(message) {
  const m = message.toLowerCase().trim();

  const acts = (...intents) => ({
    actions: intents.map(intent => ({ intent, params: {} })),
    reply:   '',
  });

  // "what do I have today / show my day / what's on today / what's my schedule"
  if (/what.*(do i have|'?s on|s on).*(today|this week)|show.*(my day|today'?s?|schedule)|today.*(schedule|plan|agenda|on)|what'?s? (up|happening) today|what'?s? my (schedule|day|plan)/i.test(m))
    return acts('get_calendar', 'get_tasks');

  // "show calendar / upcoming events / meetings"
  if (/show.*(my )?(calendar|events?|meetings?)|upcoming (events?|meetings?)|what.*(meetings?|events?).*(today|this week|tomorrow)|check.*(calendar|schedule)/i.test(m))
    return acts('get_calendar');

  // "show tasks / open tasks / todo"
  if (/show.*(my )?(tasks?|todos?|to-dos?)|what.*(tasks?|todos?).*have|open tasks?|list.*tasks?/i.test(m))
    return acts('get_tasks');

  // "check emails / show inbox / urgent emails"
  if (/show.*(my )?(emails?|inbox)|check.*(emails?|inbox)|any.*(urgent|unread|new).*(emails?|messages?)|what.*emails?/i.test(m))
    return acts('get_emails');

  // "show PRs / open pull requests"
  if (/show.*(my )?(open )?(prs?|pull requests?)|open prs?|any.*(prs?|pull requests?)/i.test(m))
    return acts('get_prs');

  // "show issues / open issues"
  if (/show.*(my |open )?(github )?issues?|open issues?|list.*issues?/i.test(m))
    return acts('get_issues');

  // "run digest / morning digest / daily digest"
  if (/run.*(digest|briefing)|morning (digest|brief|summary)|daily (digest|brief)/i.test(m))
    return acts('run_digest');

  // "get digest / show digest / latest digest"
  if (/(get|show|latest|today'?s?).*(digest|briefing)|what'?s? (the |my )?(digest|briefing)/i.test(m))
    return acts('get_digest');

  return null;
}

app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(obj) {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  try {
    const creds = await getUserCreds(req.user.userId);
    const apiKeys = { GEMINI_API_KEY: creds.GEMINI_API_KEY, GROQ_API_KEY: creds.GROQ_API_KEY };

    const connectedTools = [
      notionReady(creds)                                            && 'Notion (tasks & notes)',
      todoist.isConfigured(creds)                                   && 'Todoist (tasks)',
      auth.isConnected(req.user.userId)                             && 'Gmail & Google Calendar',
      creds.SLACK_BOT_TOKEN  && 'Slack',
      creds.GITHUB_TOKEN     && 'GitHub',
      creds.TRELLO_API_KEY   && 'Trello',
    ].filter(Boolean).join(', ');

    const memContext = memory.buildContextSummary();

    // ── Step 1: Classify intent ───────────────────────────────────────────────
    // Pre-classifier handles common patterns deterministically — no LLM needed.
    // Falls through to the LLM only when no pattern matches.
    send({ type: 'status', text: 'Thinking…' });

    const classified = preClassify(message) ?? await llm.classify(
      `Today is ${new Date().toDateString()}. Connected tools: ${connectedTools}.${memContext ? ' User context: ' + memContext : ''}\n${buildRoutingRules()}\nUser message: "${message}"`,
      AGENT_SCHEMA,
      apiKeys
    );

    const actions = classified.actions ?? [];
    const isChat  = actions.length === 0 || (actions.length === 1 && actions[0].intent === 'general_chat');
    const intents = [];
    const results = [];

    // ── Step 2: Execute actions ───────────────────────────────────────────────
    if (!isChat) {
      const statusText = actions.map(a => ACTION_STATUS[a.intent] ?? 'Working…').join(' & ');
      send({ type: 'status', text: statusText });

      const settled = await Promise.allSettled(
        actions.map(a => executeAction(a.intent, a.params ?? {}, message, creds, req.user.userId))
      );
      settled.forEach((s, i) => {
        const intent = actions[i].intent;
        const params = actions[i].params ?? {};
        const result = s.status === 'fulfilled'
          ? (s.value ?? { error: 'Action returned no result' })
          : { error: s.reason?.message ?? 'Unknown error' };
        const isErr = s.status === 'rejected' || result?.error;
        memory.logActivity(intent, params, isErr ? 'error' : 'success', isErr ? (s.reason?.message ?? result?.error) : null);
        intents.push(intent);
        results.push(result);
      });
    }

    const affectedPanels = [
      intents.some(i => TASK_ACTION_INTENTS.has(i))     && 'tasks',
      intents.some(i => CALENDAR_ACTION_INTENTS.has(i)) && 'calendar',
      intents.some(i => GITHUB_ACTION_INTENTS.has(i))   && 'github',
      intents.some(i => EMAIL_ACTION_INTENTS.has(i))    && 'comms',
      intents.some(i => DIGEST_ACTION_INTENTS.has(i))   && 'digest',
    ].filter(Boolean);

    const needsSummary  = intents.some(i => QUERY_INTENTS_SET.has(i));
    const failedResult  = results.find(r => r?.error);

    // ── Step 3: Build + stream reply ──────────────────────────────────────────

    if (results.length > 0 && failedResult) {
      // Action failed — reply immediately with the error (no second LLM call)
      const errMsg = failedResult.error ?? 'unknown error';
      send({ type: 'done', reply: `I ran into an issue: ${errMsg}`, intents, affectedPanels });

    } else if (results.length > 0 && !needsSummary) {
      // Action succeeded — use the pre-classified reply (no second LLM call)
      send({ type: 'done', reply: classified.reply ?? 'Done.', intents, affectedPanels });

    } else {
      // Query (needs summarising) or general chat — stream the response
      send({ type: 'status', text: needsSummary ? 'Summarizing…' : 'Thinking…' });

      const summaryGuide = intents.includes('get_emails_range')
        ? 'List each email as: **sender** — subject — one-line summary. Group by date. End with a total count. If the emails array is empty, say "No emails found for that period."'
        : intents.includes('get_issues')
        ? 'List each open issue with its number, title, and labels. End with a count. If the issues array is empty, say "No open issues."'
        : intents.includes('get_prs')
        ? 'List each PR with number, title, age, and reviewer. End with counts of open vs stale. If empty, say "No open pull requests."'
        : intents.some(i => i === 'get_calendar' || i === 'get_tasks')
        ? 'Report ONLY what is in the data provided. For calendar: list each event with its exact time and title. For tasks: list each task with its status. If an array is empty, explicitly say so (e.g. "No upcoming events", "No open tasks"). NEVER invent events, tasks, or names not present in the data.'
        : 'Summarise clearly in 2-4 sentences using ONLY the data provided. Never invent details.';

      const streamMessages = needsSummary
        ? [
            { role: 'system', content: `You are a data reporter. CRITICAL: Only report what exists in the JSON data below. Never invent, assume, or hallucinate any events, tasks, emails, names, or times. If a list is empty, say so clearly. ${summaryGuide}` },
            { role: 'user',   content: `User asked: "${message}"\nData:\n${actions.map((a, i) => `${a.intent}: ${JSON.stringify(results[i])}`).join('\n')}` },
          ]
        : [
            { role: 'system', content: `You are DevOS, a personal AI agent. Connected tools: ${connectedTools}. Be concise and direct. IMPORTANT: You do NOT have access to the user's real calendar, emails, or tasks in this message — if the user asks what they have today or about specific data, tell them to ask again so the agent can fetch it, rather than guessing or making up any information.${memContext ? ' ' + memContext : ''}` },
            ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: 'user',   content: message },
          ];

      let fullReply = '';
      for await (const token of llm.streamTokens(streamMessages, { taskType: 'chat', maxTokens: 600, apiKeys })) {
        fullReply += token;
        send({ type: 'token', text: token });
      }

      send({ type: 'done', reply: fullReply, intents: intents.length ? intents : ['general_chat'], affectedPanels });
    }

  } catch (err) {
    console.error('[chat]', err);
    send({ type: 'error', text: err.message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// ─── LangChain agent endpoint (parallel to /api/chat) ──────────────────────────
// Same capabilities, but routed through the LangChain createAgent() tool loop.
// Returns a single JSON reply (non-streaming) so it can be tried side-by-side.
app.post('/api/chat/agent', requireAuth, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });
  try {
    const creds = await getUserCreds(req.user.userId);
    const connectedTools = [
      notionReady(creds)                                       && 'Notion (tasks & notes)',
      todoist.isConfigured(creds)                              && 'Todoist (tasks)',
      auth.isConnected(req.user.userId)                        && 'Gmail & Google Calendar',
      creds.SLACK_BOT_TOKEN  && 'Slack',
      creds.GITHUB_TOKEN     && 'GitHub',
      creds.TRELLO_API_KEY   && 'Trello',
    ].filter(Boolean).join(', ');

    const { reply, toolsUsed } = await langchainAgent.runAgent({
      message, history,
      creds, userId: req.user.userId,
      executeAction,
      connectedTools,
      memContext: memory.buildContextSummary(),
    });

    // Log each tool call to activity memory + map to UI panels
    toolsUsed.forEach(intent => memory.logActivity(intent, {}, 'success', null));
    const affectedPanels = [
      toolsUsed.some(i => TASK_ACTION_INTENTS.has(i))     && 'tasks',
      toolsUsed.some(i => CALENDAR_ACTION_INTENTS.has(i)) && 'calendar',
      toolsUsed.some(i => GITHUB_ACTION_INTENTS.has(i))   && 'github',
      toolsUsed.some(i => EMAIL_ACTION_INTENTS.has(i))    && 'comms',
      toolsUsed.some(i => DIGEST_ACTION_INTENTS.has(i))   && 'digest',
    ].filter(Boolean);

    res.json({ reply, intents: toolsUsed.length ? toolsUsed : ['general_chat'], affectedPanels });
  } catch (err) {
    console.error('[chat/agent]', err);
    res.status(500).json({ error: err.message });
  }
});

// Clear the agent's rolling summary for this user (called when user hits "Clear")
app.post('/api/chat/agent/clear', requireAuth, (req, res) => {
  langchainAgent.clearMemory(req.user.userId);
  res.json({ ok: true });
});

// ─── Panel data endpoints ─────────────────────────────────────────────────────

// Notion is ready only when both key AND database ID are set
function notionReady(creds = {}) {
  const key = creds.NOTION_API_KEY;
  const db  = creds.NOTION_TASKS_DB_ID ?? creds.NOTION_NOTES_DB_ID;
  return !!(key && db && db !== 'your_tasks_database_id_here');
}

// Fetch decrypted per-user credentials, falling back to empty object on error
async function getUserCreds(userId) {
  return integrations.getUserCredentials(userId).catch(() => ({}));
}

// ─── Trello board (lists + cards) ─────────────────────────────────────────────
app.get('/api/trello/board', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    if (!(creds.TRELLO_API_KEY && creds.TRELLO_TOKEN && creds.TRELLO_BOARD_ID))
      return res.json({ lists: [], cards: [] });
    const [lists, cards] = await Promise.all([trello.getLists(creds), trello.getCards(creds)]);
    res.json({ lists: lists ?? [], cards: cards ?? [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trello/move', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    const { cardId, listId } = req.body;
    if (!cardId || !listId) return res.status(400).json({ error: 'cardId and listId required' });
    const result = await trello.moveCard(cardId, listId, creds);
    if (!result) return res.status(500).json({ error: 'Trello move failed' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    const [nr, tr] = await Promise.allSettled([
      notionReady(creds)          ? notion.getTasks(creds)  : Promise.resolve([]),
      todoist.isConfigured(creds) ? todoist.getTasks('today | overdue', creds) : Promise.resolve([]),
    ]);
    res.json({
      notion:  nr.status === 'fulfilled' ? nr.value : [],
      todoist: tr.status === 'fulfilled' ? tr.value : [],
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const trimmed = title.trim();
    const creds = await getUserCreds(req.user.userId);
    if (notionReady(creds)) {
      const [notionTask] = await Promise.all([
        notion.createTask(trimmed, 'Not started', creds),
        todoist.createTask(trimmed, 'today', creds).catch(err => console.error('[todoist sync]', err.message)),
      ]);
      return res.json(notionTask);
    }
    const task = await todoist.createTask(trimmed, 'today', creds);
    if (!task) return res.status(500).json({ error: 'Failed to create task in Todoist' });
    res.json(task);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/notes', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    if (!notionReady(creds)) return res.status(404).json({ error: 'Notion not configured' });
    res.json(await notion.getNotes(creds));
  } catch(e){ res.status(500).json({error:e.message}) }
});

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    if (!notionReady(creds)) return res.status(400).json({ error: 'Notion not configured — add your API key in Settings' });
    const { title, body = '' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const note = await notion.createNote(title.trim(), body, creds);
    res.json(note);
  } catch(e){ res.status(500).json({error:e.message}) }
});

// Export all Notion notes as a zip of .md files
app.get('/api/notes/export', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    if (!notionReady(creds)) return res.status(400).json({ error: 'Notion not configured' });
    const files = await notion.exportNotesAsMarkdown(creds);

    // Build a zip manually using a simple concatenation format clients can handle,
    // or just return newline-delimited JSON so the frontend can zip in the browser.
    // We return JSON; the client zips + downloads.
    res.json({ files });
  } catch(e){ res.status(500).json({error:e.message}) }
});
const _emailCache = new Map(); // uid → { data, at }
const EMAIL_TTL = 5 * 60 * 1000;
app.get('/api/emails', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  if (!auth.isConnected(uid)) return res.json([]);
  const cached = _emailCache.get(uid);
  if (cached && Date.now() - cached.at < EMAIL_TTL) return res.json(cached.data);
  try {
    const data = await gmail.triageInbox(uid, 15);
    _emailCache.set(uid, { data, at: Date.now() });
    res.json(data);
  } catch(e) {
    if (e.code === 'GOOGLE_AUTH_REQUIRED') return res.status(401).json({ error: 'google_auth_required' });
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/calendar', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  if (!auth.isConnected(uid)) return res.json([]);
  try {
    res.json(await calendar.getUpcoming(uid, 10));
  } catch(e) {
    if (e.code === 'GOOGLE_AUTH_REQUIRED') return res.status(401).json({ error: 'google_auth_required' });
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/calendar', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const { title, date, duration = 60, description = '', recurring, days, time } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    if (recurring) {
      if (!days?.length) return res.status(400).json({ error: 'days array is required for recurring events' });
      if (!time)         return res.status(400).json({ error: 'time (HH:MM) is required for recurring events' });
      const event = await calendar.createRecurringEvent(uid, title, days, time, Number(duration), description);
      return res.json(event);
    }

    if (!date) return res.status(400).json({ error: 'date is required for single events' });
    const event = await calendar.createEvent(uid, title, date, Number(duration), description);
    res.json(event);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/github/repos', requireAuth, async (req, res) => {
  const creds = await getUserCreds(req.user.userId);
  res.json(github.getRepos(creds));
});
app.get('/api/prs', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    res.json(await github.getOpenPRs(req.query.repo, creds));
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.get('/api/github/issues', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    res.json(await github.getIssues('open', req.query.repo, creds));
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.post('/api/github/issues', requireAuth, async (req, res) => {
  try {
    const { title, body = '', labels = [], repo } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const creds = await getUserCreds(req.user.userId);
    res.json(await github.createIssue(title.trim(), body, labels, repo, creds));
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.get('/api/github/merged', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    res.json(await github.getMergedPRs(undefined, req.query.repo, creds));
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.get('/api/github/changelog', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    const changelog = await github.generateChangelog(undefined, req.query.repo, creds);
    res.json({ changelog });
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.post('/api/github/draft-body', requireAuth, async (req, res) => {
  try {
    const { title, context = '' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title required' });
    const creds   = await getUserCreds(req.user.userId);
    const apiKeys = { GEMINI_API_KEY: creds.GEMINI_API_KEY, GROQ_API_KEY: creds.GROQ_API_KEY };
    const body = await llm.generate(
      `Draft a GitHub issue body in markdown for the issue titled: "${title.trim()}". ` +
      `${context.trim() ? `Additional context: ${context.trim()} ` : ''}` +
      `Structure it with sections: ## Summary, ## Goals, ## Suggested approach, ## Tests (if applicable). ` +
      `Use bullet points. Be specific. Output only the markdown body, no preamble.`,
      '', 'content', apiKeys
    );
    res.json({ body });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/github/contributions', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    const data  = await github.getContributions(req.query.repo, creds);
    res.json(data ?? {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/github/branches', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    const data  = await github.getBranches(req.query.repo, creds);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/slack/send', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });
    const creds = await getUserCreds(req.user.userId);
    const ts = await slack.sendDM(text.trim(), creds);
    res.json({ ok: !!ts, ts });
  } catch(e){ res.status(500).json({ error: e.message }) }
});
app.get('/api/cards', requireAuth, async (req, res) => {
  try {
    const creds = await getUserCreds(req.user.userId);
    res.json(await trello.getCards(creds));
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.get('/api/memory', requireAuth, async (req, res) => { res.json(memory.getMemory()) });
app.get('/api/activity', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(memory.getActivityLog(limit));
});

// ─── Action endpoints ─────────────────────────────────────────────────────────

function invalidateEmailCache(uid) { _emailCache.delete(uid); }

app.get('/api/email/:id', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  if (!auth.isConnected(uid)) return res.status(403).json({ error: 'Google not connected for this account' });
  try {
    const email = await gmail.getEmail(uid, req.params.id);
    if (!email) return res.status(404).json({ error: 'not found' });
    res.json(email);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const { to, subject, body } = req.body;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'valid "to" email required' });
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });
    const result = await gmail.sendEmail(uid, to, subject ?? '(no subject)', body);
    memory.logActivity('send_email', { to, title: subject }, 'success');
    console.log(`[email] sent to=${to} subject="${subject}"`);
    res.json(result);
  } catch(e) {
    console.error(`[email] send failed to=${req.body?.to}: ${e.message}`);
    memory.logActivity('send_email', { to: req.body?.to, title: req.body?.subject }, 'error', e.message);
    res.status(500).json({ error: `Failed to send email: ${e.message}` });
  }
});
app.post('/api/email/archive', requireAuth, async (req, res) => { const uid = req.user.userId; try { invalidateEmailCache(uid); res.json(await gmail.archiveEmail(uid, req.body.id)) } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/email/approve-draft', requireAuth, async (req, res) => {
  const uid = req.user.userId;
  try {
    const { to, subject, original, edited } = req.body;
    if (!to || !edited?.trim()) return res.status(400).json({ error: 'to and edited body are required' });
    invalidateEmailCache(uid);
    const sent = await gmail.sendEmail(uid, to, subject, edited);
    memory.recordApprovedDraft(original, edited, 'email');
    memory.logActivity('approve_draft', { to, title: subject }, 'success');
    console.log(`[email] draft approved and sent to=${to} subject="${subject}"`);
    res.json(sent);
  } catch(e) {
    console.error(`[email] approve-draft failed to=${req.body?.to}: ${e.message}`);
    memory.logActivity('approve_draft', { to: req.body?.to }, 'error', e.message);
    res.status(500).json({ error: `Failed to send email: ${e.message}` });
  }
});

app.post('/api/task/update', requireAuth, async (req, res) => {
  try {
    const { id, status, source } = req.body;
    const creds = await getUserCreds(req.user.userId);
    const isTodoist = source === 'todoist' || /^\d+$/.test(id);
    const result = isTodoist
      ? await todoist.updateTaskStatus(id, status, creds)
      : await notion.updateTaskStatus(id, status, creds);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/memory/vip', requireAuth, async (req, res) => { res.json({ vips: memory.addVIP(req.body.email, req.body.name) }) });
app.get('/api/content/linkedin/history', requireAuth, (req, res) => {
  const { voiceProfile } = memory.getMemory();
  const posts = voiceProfile.approvedDrafts
    .filter(d => d.type === 'linkedin')
    .slice(-20)
    .reverse();
  res.json(posts);
});
app.post('/api/content/linkedin', requireAuth, async (req, res) => { try { res.json(await content.draftLinkedInPost(req.body.source)) } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/content/approve', requireAuth, async (req, res) => {
  const { original, edited, type = 'linkedin', postNow = false } = req.body;
  memory.recordApprovedDraft(original, edited, type);

  let posted = false;
  if (postNow) {
    const creds = await getUserCreds(req.user.userId);
    const webhookUrl = creds.LINKEDIN_WEBHOOK_URL || process.env.LINKEDIN_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const hook = await fetch(webhookUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content: edited, type }),
        });
        posted = hook.ok;
        if (!hook.ok) console.error('[linkedin webhook] status:', hook.status);
      } catch (err) {
        console.error('[linkedin webhook]', err.message);
      }
    }
  }

  res.json({ ok: true, posted });
});

// ─── Webhook endpoints ────────────────────────────────────────────────────────

// Find the first user who has Slack configured (for webhook notifications)
async function findSlackUser() {
  // Try Google-connected users first (most likely to have all integrations)
  for (const uid of auth.getConnectedUserIds()) {
    const c = await getUserCreds(Number(uid));
    if (c.SLACK_BOT_TOKEN && c.SLACK_USER_ID) return c;
  }
  return null;
}

// Return webhook endpoint URL for display in Settings
app.get('/api/webhook/info', requireAuth, (req, res) => {
  const base = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`;
  res.json({
    url:    `${base}/api/webhook/github`,
    secret: !!process.env.GITHUB_WEBHOOK_SECRET,
  });
});

app.post('/api/webhook/github', async (req, res) => {
  // Verify HMAC-SHA256 signature when secret is set
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig      = req.headers['x-hub-signature-256'] ?? '';
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    const sigBuf   = Buffer.from(sig);
    const expBuf   = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
  }

  res.json({ ok: true }); // acknowledge immediately before async work

  const event = req.headers['x-github-event'];
  const body  = req.body;

  try {
    const creds = await findSlackUser();
    if (!creds) return; // no Slack configured, nothing to notify

    // ── pull_request ────────────────────────────────────────────────────────
    if (event === 'pull_request') {
      const pr     = body.pull_request;
      const repo   = body.repository?.full_name ?? '';
      const author = pr.user?.login ?? 'unknown';
      const url    = pr.html_url ?? '';
      const title  = pr.title ?? 'Untitled PR';
      const num    = pr.number;

      if (body.action === 'opened') {
        await slack.sendDM(
          `:arrow_heading_up: *New PR opened* in \`${repo}\`\n` +
          `*#${num} — ${title}*\nBy: @${author}\n${url}`,
          creds,
        );
      } else if (body.action === 'closed' && pr.merged) {
        await slack.sendDM(
          `:merged: *PR merged* in \`${repo}\`\n` +
          `*#${num} — ${title}*\nMerged by: @${body.sender?.login ?? author}\n${url}`,
          creds,
        );
      } else if (body.action === 'closed' && !pr.merged) {
        await slack.sendDM(
          `:x: *PR closed (unmerged)* in \`${repo}\`\n` +
          `*#${num} — ${title}*\n${url}`,
          creds,
        );
      } else if (body.action === 'review_requested') {
        const reviewer = body.requested_reviewer?.login ?? 'someone';
        await slack.sendDM(
          `:eyes: *Review requested* on PR #${num} in \`${repo}\`\n` +
          `*${title}*\nReviewer: @${reviewer}\n${url}`,
          creds,
        );
      }
    }

    // ── push to default branch ───────────────────────────────────────────────
    if (event === 'push') {
      const ref     = body.ref ?? '';
      const branch  = ref.replace('refs/heads/', '');
      const repo    = body.repository?.full_name ?? '';
      const def     = body.repository?.default_branch ?? 'main';
      if (branch === def) {
        const commits = (body.commits ?? []).slice(0, 3);
        const lines   = commits.map(c => `• ${c.message.split('\n')[0]} — @${c.author?.username ?? 'unknown'}`).join('\n');
        const more    = (body.commits?.length ?? 0) > 3 ? `\n+${body.commits.length - 3} more` : '';
        await slack.sendDM(
          `:git: *Push to \`${branch}\`* in \`${repo}\`\n${lines}${more}`,
          creds,
        );
      }
    }

    // ── issues ───────────────────────────────────────────────────────────────
    if (event === 'issues') {
      const issue  = body.issue;
      const repo   = body.repository?.full_name ?? '';
      const author = issue.user?.login ?? 'unknown';
      const url    = issue.html_url ?? '';
      const title  = issue.title ?? 'Untitled issue';
      const num    = issue.number;

      if (body.action === 'opened') {
        await slack.sendDM(
          `:bug: *New issue #${num}* in \`${repo}\`\n*${title}*\nBy: @${author}\n${url}`,
          creds,
        );
      } else if (body.action === 'closed') {
        await slack.sendDM(
          `:white_check_mark: *Issue #${num} closed* in \`${repo}\`\n*${title}*\n${url}`,
          creds,
        );
      }
    }

    // ── release published ────────────────────────────────────────────────────
    if (event === 'release' && body.action === 'published') {
      const rel  = body.release;
      const repo = body.repository?.full_name ?? '';
      await slack.sendDM(
        `:rocket: *Release published* in \`${repo}\`\n*${rel.name || rel.tag_name}*\n${rel.html_url}`,
        creds,
      );
    }

  } catch (err) {
    console.error('[webhook/github]', err.message);
  }
});

// ─── Digest orchestrator ──────────────────────────────────────────────────────

async function _runDigest(userId = null) {
  console.log('[digest] starting all sub-agents...');

  const creds = userId ? await getUserCreds(userId) : {};

  const [commsResult, calendarResult, tasksResult, contentResult] = await Promise.allSettled([
    // Comms sub-agent
    userId && auth.isConnected(userId)
      ? gmail.triageInbox(userId, 15).then(emails => ({
          pending:  emails.filter(e => e.priority !== 'P3'),
          archived: emails.filter(e => e.priority === 'P3').length,
        }))
      : Promise.resolve({ pending: [], archived: 0 }),

    // Calendar sub-agent
    userId && auth.isConnected(userId)
      ? Promise.all([
          calendar.getUpcoming(userId, 5),
          calendar.scanConflicts(userId),
        ]).then(([events, conflicts]) => ({ events, conflicts }))
      : Promise.resolve({ events: [], conflicts: [] }),

    // Tasks sub-agent
    Promise.all([
      notionReady(creds) ? notion.getTasks(creds) : (todoist.isConfigured(creds) ? todoist.getTasks('today | overdue', creds) : []),
      github.scanStalePRs(3, undefined, creds),
      trello.scanStaleCards(5, creds),
    ]).then(([tasks, stalePRs, staleCards]) => ({
      tasks,
      blockers: [
        ...stalePRs.map(p  => ({ type: 'pr',   title: p.title,  id: p.id,  source: 'github' })),
        ...staleCards.map(c => ({ type: 'card', title: c.title, id: c.id,  source: 'trello' })),
      ],
    })),

    // Content sub-agent
    github.getMergedPRs(undefined, undefined, creds).then(async prs => {
      if (!prs.length) return { drafts: [] };
      const changelog = await content.draftChangelog();
      return { drafts: [changelog] };
    }),
  ]);

  const digest = {
    comms:    commsResult.status    === 'fulfilled' ? commsResult.value    : { pending: [], archived: 0 },
    calendar: calendarResult.status === 'fulfilled' ? calendarResult.value : { events: [], conflicts: [] },
    tasks:    tasksResult.status    === 'fulfilled' ? tasksResult.value    : { tasks: [], blockers: [] },
    content:  contentResult.status  === 'fulfilled' ? contentResult.value  : { drafts: [] },
    generatedAt: new Date().toISOString(),
  };

  console.log('[digest] complete —', {
    comms:    digest.comms.pending.length    + ' pending',
    conflicts: digest.calendar.conflicts.length + ' conflicts',
    blockers: digest.tasks.blockers.length   + ' blockers',
  });

  // Deliver to Slack if configured
  await slack.sendDigest(digest);

  return digest;
}

// ─── Digest cache — avoids re-running on every page load ─────────────────────

const _digestCache = new Map(); // uid → digest

export async function runDigest(userId = null) {
  const digest = await _runDigest(userId);
  if (userId != null) _digestCache.set(String(userId), digest);
  return digest;
}

// ─── Manual digest trigger ────────────────────────────────────────────────────

app.post('/api/digest/run', requireAuth, async (req, res) => {
  try {
    const digest = await runDigest(req.user.userId);
    res.json(digest);
  } catch (err) {
    console.error('[digest/run]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/digest/latest', requireAuth, (req, res) => {
  res.json(_digestCache.get(String(req.user.userId)) ?? null);
});

// ─── Scheduled digest — every morning at 9 AM ────────────────────────────────

cron.schedule('0 9 * * *', () => {
  console.log('[cron] 9 AM digest firing');
  for (const userId of auth.getConnectedUserIds()) {
    runDigest(userId).catch(console.error);
  }
});

// Also run 7 AM calendar check
cron.schedule('0 7 * * *', async () => {
  console.log('[cron] 7 AM calendar check');
  for (const userId of auth.getConnectedUserIds()) {
    try {
      const conflicts = await calendar.scanConflicts(userId);
      if (conflicts.length) {
        await slack.sendAlert(
          `${conflicts.length} calendar conflict(s) today`,
          conflicts.map(c => `${c.eventA.title} ↔ ${c.eventB.title}`).join('\n'),
          'high'
        );
      }
      await calendar.blockFocusTime(userId);
    } catch (err) {
      console.error(`[cron/calendar] user ${userId}:`, err.message);
    }
  }
});

// ─── Serve React build in production ─────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientBuild = path.join(__dirname, '..', 'client', 'dist');

app.use(express.static(clientBuild));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// ─── Startup: migrate env var credentials into DB for the first (admin) user ──
// Runs every boot but never overwrites credentials already saved via Settings.

async function migrateEnvCredentials() {
  const adminUser = await userService.getUserById(1).catch(() => null);
  if (!adminUser) return;

  const candidates = [
    ['github',   'GITHUB_TOKEN',          process.env.GITHUB_TOKEN],
    ['github',   'GITHUB_OWNER',          process.env.GITHUB_OWNER],
    ['github',   'GITHUB_REPO',           process.env.GITHUB_REPO],
    ['github',   'GITHUB_REPOS',          process.env.GITHUB_REPOS],
    ['notion',   'NOTION_API_KEY',        process.env.NOTION_API_KEY],
    ['notion',   'NOTION_TASKS_DB_ID',    process.env.NOTION_TASKS_DB_ID],
    ['notion',   'NOTION_NOTES_DB_ID',    process.env.NOTION_NOTES_DB_ID],
    ['slack',    'SLACK_BOT_TOKEN',       process.env.SLACK_BOT_TOKEN],
    ['slack',    'SLACK_USER_ID',         process.env.SLACK_USER_ID],
    ['todoist',  'TODOIST_API_KEY',       process.env.TODOIST_API_KEY],
    ['trello',   'TRELLO_API_KEY',        process.env.TRELLO_API_KEY],
    ['trello',   'TRELLO_TOKEN',          process.env.TRELLO_TOKEN],
    ['trello',   'TRELLO_BOARD_ID',       process.env.TRELLO_BOARD_ID],
    ['gemini',   'GEMINI_API_KEY',        process.env.GEMINI_API_KEY],
    ['groq',     'GROQ_API_KEY',          process.env.GROQ_API_KEY],
    ['linkedin', 'LINKEDIN_WEBHOOK_URL',  process.env.LINKEDIN_WEBHOOK_URL],
  ];

  let count = 0;
  for (const [service, keyName, value] of candidates) {
    if (!value) continue;
    // Strip the legacy secret_ prefix Notion prepended to ntn_ tokens — Notion's API rejects
    // the prefixed form with 401, so we must normalise before storing.
    const clean = (keyName === 'NOTION_API_KEY' && value.startsWith('secret_ntn_'))
      ? value.slice('secret_'.length)
      : value;
    const existing = await integrations.getKey(adminUser.id, service, keyName).catch(() => null);
    // Also fix already-migrated keys that were saved with the bad prefix
    const needsFix = existing?.startsWith('secret_ntn_');
    if (!existing || needsFix) {
      await integrations.saveKey(adminUser.id, service, keyName, clean);
      count++;
    }
  }
  if (count > 0) {
    console.log(`[migration] Imported ${count} env credential(s) → user "${adminUser.username}" (ID ${adminUser.id})`);
  }
}

// ─── Migrate integrations.json → Neon on first boot ──────────────────────────
// Runs once after Neon is connected. Maps old timestamp user IDs to the new
// serial IDs by matching usernames, then imports every key row.
async function migrateJsonIntegrations() {
  const pool = getPool();
  if (!pool) return;

  const usersFile = new URL('./users.json', import.meta.url);
  const integFile = new URL('./integrations.json', import.meta.url);
  if (!fs.existsSync(fileURLToPath(usersFile))) return;

  let oldUsers = [], oldInteg = [];
  try {
    oldUsers = JSON.parse(fs.readFileSync(fileURLToPath(usersFile), 'utf8'));
    if (fs.existsSync(fileURLToPath(integFile)))
      oldInteg = JSON.parse(fs.readFileSync(fileURLToPath(integFile), 'utf8'));
  } catch { return; }

  if (!oldUsers.length) return;

  let usersMigrated = 0, keysMigrated = 0;

  for (const oldUser of oldUsers) {
    // ── 1. Find or create the user in Neon ──────────────────────────────────
    // Match by username first, then by email (handles Google sign-in users
    // whose Neon username differs from their local JSON username).
    let newId = null;

    const byUsername = await pool.query(
      'SELECT id FROM users WHERE username = $1', [oldUser.username]
    ).catch(() => null);
    if (byUsername?.rows[0]) {
      newId = byUsername.rows[0].id;
    } else if (oldUser.email) {
      const byEmail = await pool.query(
        'SELECT id FROM users WHERE email = $1', [oldUser.email]
      ).catch(() => null);
      if (byEmail?.rows[0]) newId = byEmail.rows[0].id;
    }

    if (!newId) {
      // Create a new Neon user preserving their password hash so they can log in
      const ins = await pool.query(
        `INSERT INTO users (username, email, password_hash, google_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO NOTHING
         RETURNING id`,
        [
          oldUser.username,
          oldUser.email ?? null,
          oldUser.passwordHash ?? oldUser.password_hash ?? 'UNKNOWN',
          oldUser.googleId ?? oldUser.google_id ?? null,
        ]
      ).catch(() => null);
      if (ins?.rows[0]) { newId = ins.rows[0].id; usersMigrated++; }
    }

    if (!newId) continue;

    // ── 2. Migrate integration keys for this user ───────────────────────────
    const keys = oldInteg.filter(r => String(r.userId) === String(oldUser.id));
    for (const k of keys) {
      try {
        // Try current key first; fall back to the hardcoded dev fallback used
        // before ENCRYPTION_SECRET was set, so a one-time secret rotation
        // doesn't lose data stored in the JSON file.
        let plain;
        try {
          plain = decrypt(k.keyValue);
        } catch {
          const fallbackKey = crypto.scryptSync(
            'devos-local-dev-fallback-do-not-use-in-prod', 'devos-aes-salt-v1', 32
          );
          const [ivB64, tagB64, bodyB64] = k.keyValue.split(':');
          const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            fallbackKey,
            Buffer.from(ivB64, 'base64url')
          );
          decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
          plain = Buffer.concat([
            decipher.update(Buffer.from(bodyB64, 'base64url')),
            decipher.final(),
          ]).toString('utf8');
        }
        // Re-save through saveKey() so the value is encrypted with the current secret.
        await integrations.saveKey(newId, k.service, k.keyName, plain);
        keysMigrated++;
      } catch { /* skip rows that can't be decrypted either way */ }
    }
  }

  if (usersMigrated > 0 || keysMigrated > 0)
    console.log(`[migration] JSON → Neon: ${usersMigrated} user(s), ${keysMigrated} key(s) imported`);
}

// ─── Start server ─────────────────────────────────────────────────────────────

await initDB();
await auth.restoreAllFromDB();
await migrateEnvCredentials();
await migrateJsonIntegrations();
app.listen(PORT, () => {
  console.log(`\n🚀 DevOS Agent server running on http://localhost:${PORT}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? '✓' : '✗ missing'}`);
  console.log(`   Groq:   ${process.env.GROQ_API_KEY   ? '✓' : '✗ missing'}`);
  console.log(`   Notion: ${process.env.NOTION_API_KEY  ? '✓' : '✗ missing'}`);
  console.log(`   Google: ${auth.getConnectedUserIds().length} user(s) connected`);
  console.log(`   Slack:   ${process.env.SLACK_BOT_TOKEN  ? '✓' : '○ optional'}`);
  console.log(`   GitHub:  ${process.env.GITHUB_TOKEN     ? '✓' : '○ optional'}`);
  console.log(`   Trello:  ${process.env.TRELLO_API_KEY   ? '✓' : '○ optional'}`);
  console.log(`   Todoist: ${process.env.TODOIST_API_KEY  ? '✓' : '○ optional'}\n`);
});
