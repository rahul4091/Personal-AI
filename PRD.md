# DevOS — Product Requirements Document

**Version:** 2.0  
**Date:** 2026-05-22  
**Author:** Rahul  
**Status:** Draft

---

## 1. Product Vision

DevOS is a personal AI command centre that unifies every tool a professional uses daily — email, calendar, tasks, GitHub, Slack, Notion — into one intelligent dashboard. The AI layer lets users query, act, and get digests across all their tools with a single prompt.

**Phase 2 vision:** DevOS evolves from a single-person tool into a multi-user SaaS platform where every user brings their own integrations, their data stays completely private, and the AI acts as their personal assistant — not a shared one.

---

## 2. Current State (What Is Already Built)

### 2.1 Core Architecture
| Layer | Stack |
|---|---|
| Server | Node.js ESM + Express 5, `server/index.js` |
| Client | React + Vite, `client/src/App.jsx` |
| Deployment | Railway (Nixpacks), single process serves API + React |
| LLM | Gemini + Groq via `server/services/llm.js` |
| Database | PostgreSQL (Railway plugin) with `server/users.json` fallback |

### 2.2 Integrations Already Wired
- **Google** — Gmail (read/send), Google Calendar (events)
- **GitHub** — repos, PRs, issues (`server/services/github.js`)
- **Slack** — messages, channels (`server/services/slack.js`)
- **Notion** — pages, databases (`server/services/notion.js`)
- **Trello** — boards, cards (`server/services/trello.js`)
- **Todoist** — tasks (`server/services/todoist.js`)
- **LinkedIn** — webhook feed

### 2.3 UI Panels (All Working)
`DigestPanel`, `EmailPanel`, `CalendarPanel`, `TaskPanel`, `GitHubPanel`, `SlackPanel`, `LinkedInPanel`, `ChatPanel`, `SettingsPage`

### 2.4 Auth (Phase A — Partially Done)
- Signup / Login with bcrypt + JWT (30-day tokens stored in `localStorage`)
- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/users/me`
- 4-step onboarding wizard (welcome → Google → tools → done)
- `SettingsPage` lets users paste their own API keys (stored encrypted in `user_integrations` table)
- **Gap:** `requireAuth` middleware exists but API routes are still unprotected — any caller can hit any panel endpoint

---

## 3. Problems to Solve in Phase 2

### P1 — No real data isolation
Any unauthenticated or cross-user request can read any panel's data. All service calls use env-var credentials, not per-user ones.

### P2 — Google OAuth is global
One Google account is shared across the whole server. Users cannot connect their own Gmail / Calendar.

### P3 — Per-user credential storage exists but isn't used
`user_integrations` table and `server/services/integrations.js` are built, but panel routes don't pull credentials from it.

### P4 — No admin visibility
There is no way to see how many users exist, which integrations they have connected, or whether the system is healthy per-user.

---

## 4. Phase 2 Requirements

### 4.1 True Multi-Tenancy & Data Isolation (P0)

**Goal:** Every panel's API route must be scoped to the authenticated user. User A must never see User B's data.

#### 4.1.1 Auth Middleware on All Routes
- Add `requireAuth` middleware to every panel API route (email, calendar, tasks, GitHub, Slack, Notion, Trello, Todoist, digest, chat, LinkedIn)
- Middleware reads `Authorization: Bearer <token>` header, verifies JWT, injects `req.user` (`{ id, username }`)
- Return `401` for missing/invalid token, `403` for expired

#### 4.1.2 Per-User Credential Resolution
Every service call must follow this lookup order:
1. `user_integrations` table for `req.user.id` (the user's own key)
2. `.env` fallback (admin / demo account only)
3. Return a clear `"integration not connected"` error to the panel UI if neither exists

Affected services: `github.js`, `slack.js`, `notion.js`, `trello.js`, `todoist.js`, `llm.js` (Gemini/Groq keys)

#### 4.1.3 Per-User Google OAuth
- Add `user_id` state param to the Google OAuth redirect URL
- Callback saves tokens to a `user_google_tokens` table (keyed by `user_id`) instead of a flat `tokens.json` file
- `gmail.js` and `calendar.js` build an OAuth client from the user's stored tokens on each request
- `GET /api/auth/google` requires a valid session (user must be logged in first)

#### 4.1.4 Database Schema (additions)
```sql
-- Already exists, keep:
users (id, username, password_hash, created_at)
user_integrations (id, user_id, service, encrypted_key, created_at)

-- New:
user_google_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date   BIGINT,
  email         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
)
```

---

### 4.2 Improved Onboarding (P1)

**Goal:** New users must be able to go from signup to a fully connected dashboard in under 5 minutes.

#### Steps in the onboarding wizard (replace current 4-step with 5-step):
1. **Welcome** — name, username, what DevOS does
2. **Connect Google** — OAuth button, shows connected email on return
3. **Connect dev tools** — GitHub token, Slack bot token (with short guide links)
4. **Connect productivity tools** — Notion, Trello, Todoist tokens
5. **AI keys** — Gemini or Groq API key (one required for chat + digest to work)

Each step:
- Shows real-time test result ("Connected ✓" / "Failed — check your token")
- Allows skipping (the panel will show a "Connect X" prompt later)
- Saves credentials immediately on success using `POST /api/credentials/test/:service`

---

### 4.3 Digest Personalisation (P1)

**Goal:** The daily digest uses the current user's own data, not a global feed.

- `DigestPanel` fetches `/api/digest` with the user's JWT
- The digest endpoint pulls from only the integrations the user has connected
- If fewer than 2 integrations are connected, the digest shows an "Add more tools" prompt instead of empty sections
- Digest is generated using the user's own LLM key (Gemini/Groq) if set; falls back to the server's env key

---

### 4.4 Chat / AI Actions Scoped to User (P1)

**Goal:** When a user asks "add task to Todoist" or "show my GitHub PRs", the AI uses that user's credentials.

- `ChatPanel` sends JWT with every `/api/chat` request
- LLM service selects model based on the user's stored Gemini/Groq key
- `executeAction` in `llm.js` receives `req.user` and resolves credentials per §4.1.2
- Chat memory (`server/services/memory.js`) is namespaced by `user_id`

---

### 4.5 Settings Page Improvements (P1)

Extend the existing `SettingsPage` with:

| Section | What changes |
|---|---|
| **Account** | Edit display name, change password |
| **Google** | Shows connected email; "Reconnect" or "Disconnect" button |
| **Integrations** | Per-service status: connected (with masked key) / not connected. "Test" and "Remove" buttons per service |
| **AI** | Choose preferred model (Gemini / Groq), shows whether key is saved |
| **Danger zone** | Delete account (deletes all user data from DB) |

---

### 4.6 Admin Dashboard (P2)

A separate `/admin` route protected by a role flag (`is_admin` column on users):

- Total user count, signups over time (simple table)
- Per-user: which integrations connected, last login, account created date
- Ability to delete a user account
- System health: DB connection, env vars present, Railway status

---

### 4.7 Notification / Alert System (P2)

Allow users to set lightweight alerts in the dashboard:

- **GitHub** — PR assigned to me, review requested
- **Slack** — direct mention in a configured channel
- **Calendar** — event starting in X minutes
- Alerts show as a badge on the sidebar nav item
- Delivered via browser Notification API (no email needed in Phase 2)

---

### 4.8 Shared Workspace Mode (P3 — Future)

Allow users to optionally share a workspace (team view):
- One owner invites members by username
- Members see a shared digest and shared task board
- All other panels remain personal
- Team integrations (shared Slack token, shared GitHub org) configurable by owner

---

## 5. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Security** | All credentials encrypted at rest (AES-256, `server/services/encryption.js`). JWT secret via `JWT_SECRET` env var. No credential ever returned in plaintext via API |
| **Performance** | Panel data loads within 2 s for users with ≤ 5 integrations connected |
| **Uptime** | Railway auto-restart on crash. No planned downtime for credential saves |
| **Privacy** | Zero cross-user data leakage. Enforced at DB query level (all queries include `WHERE user_id = $1`) |
| **Scalability** | Postgres connection pooling (`pg.Pool`). Stateless server — any number of Railway replicas can serve any user |

---

## 6. Implementation Phases & Priority

### Phase 2A — Data Isolation (Build First)
| Task | Owner | Priority |
|---|---|---|
| Add `requireAuth` middleware to all panel routes | Backend | P0 |
| `user_google_tokens` DB table + migration | Backend | P0 |
| Per-user Google OAuth (save tokens by user_id) | Backend | P0 |
| Per-user credential resolver in each service | Backend | P0 |
| Frontend: attach JWT to all API calls (via `apiFetch`) | Frontend | P0 |
| Show "Connect X" empty state in panels when no key | Frontend | P0 |

### Phase 2B — Onboarding & Settings
| Task | Owner | Priority |
|---|---|---|
| 5-step onboarding wizard | Frontend | P1 |
| Settings: disconnect / reconnect integrations | Frontend | P1 |
| Settings: change password | Backend + Frontend | P1 |
| Settings: delete account (cascade DB delete) | Backend + Frontend | P1 |

### Phase 2C — AI & Digest
| Task | Owner | Priority |
|---|---|---|
| Per-user LLM key selection in chat + digest | Backend | P1 |
| Chat memory namespaced by user_id | Backend | P1 |
| Digest empty state for missing integrations | Frontend | P1 |

### Phase 2D — Admin & Alerts
| Task | Owner | Priority |
|---|---|---|
| Admin dashboard `/admin` | Backend + Frontend | P2 |
| `is_admin` column + role check middleware | Backend | P2 |
| Browser notification alerts (GitHub, Slack, Calendar) | Frontend | P2 |

---

## 7. Open Questions

1. **LinkedIn OAuth** — LinkedIn uses OAuth 2.0 not a simple API key. Will per-user LinkedIn need a full OAuth flow or stay as a webhook?
2. **Free tier limits** — Gemini and Groq free tiers are per API key. Do we want to share a server key for users who don't provide their own, with rate limiting?
3. **Token refresh** — Google tokens expire. The server must refresh them automatically. Should expired tokens trigger a re-auth prompt in the UI?
4. **Mobile** — Is a mobile-responsive layout in scope for Phase 2?
5. **Pricing / access control** — Is Phase 2 open signup for everyone or invite-only?

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Users can sign up and connect at least 2 integrations | < 5 min end-to-end |
| Zero cross-user data leakage incidents | 0 |
| Digest loads with user's own data | < 2 s |
| Settings save (new API key) | < 1 s round-trip |
| Onboarding completion rate | > 70% of signups reach step 5 |
