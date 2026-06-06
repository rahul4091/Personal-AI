# DevOS — Architecture & Workflow Reference

## What Is DevOS?

A personal AI command centre. One dashboard that aggregates all your developer tools — tasks, email, calendar, GitHub, Slack, Notion — and lets you control everything through natural language via an AI chat interface.

---

## Full Workflow

```
You open DevOS
       ↓
Auth: JWT (username/pw) or Google OAuth
       ↓
Dashboard loads — parallel fetches to all connected services
       ↓
Morning digest runs (4 sub-agents in parallel):
  Comms     → Gmail triage (P1/P2/P3 + draft replies)
  Calendar  → upcoming events + conflict detection
  Tasks     → Notion + Todoist priorities + blockers
  Content   → LinkedIn post drafts
       ↓
Everything visible in one view
       ↓
You type a command in Chat:
  "move the Notion bug task to Done and block 2h focus time today"
       ↓
Server classifies intent → executes actions → streams reply
       ↓
Affected panels refresh automatically
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19 + Vite 6 | Fast HMR, minimal boilerplate |
| Backend | Express 5 (Node, ESM) | Lightweight, easy SSE streaming |
| Database | Neon Postgres + JSON fallback | Neon = serverless on Railway; JSON = zero infra locally |
| Auth | JWT + Google OAuth2 | Stateless JWT; Google = SSO for devs already on Google Workspace |
| Encryption | AES-256-GCM (scrypt) | Per-user API keys stored encrypted — unreadable even with DB access |
| Primary LLM | Gemini 2.0 Flash | Free tier, 1M-token context, handles digest/changelog/content |
| Fast LLM | Groq Llama 3.1 8B | Sub-second latency for chat triage and classification |
| Agent framework | LangChain + LangGraph | Structured tool-calling loop, Zod-typed tools |
| Tracing | LangSmith | Debug LLM calls in production — prompts, latency, token counts |
| Deployment | Railway + Nixpacks | Zero-config deploy from git push, auto-restart on failure |

---

## Project Structure

```
devos/
├── client/                         # React frontend (Vite)
│   └── src/
│       ├── App.jsx                 # Root: auth state, nav, panel routing
│       ├── AuthPage.jsx            # Login / signup / Google sign-in
│       ├── OnboardingWizard.jsx    # First-run setup flow
│       ├── SettingsPage.jsx        # Integration management (test + save keys)
│       ├── api.js                  # apiFetch — attaches JWT to every request
│       └── components/
│           ├── ChatPanel.jsx       # Conversational interface (SSE streaming)
│           ├── DigestPanel.jsx     # Morning digest (stats + top items)
│           ├── EmailPanel.jsx      # Gmail triage (P1/P2/P3)
│           ├── CalendarPanel.jsx   # Google Calendar + conflict detection
│           ├── TaskPanel.jsx       # Kanban board (Notion + Todoist + Trello)
│           ├── GitHubPanel.jsx     # PRs, issues, contributions, changelog
│           ├── SlackPanel.jsx      # Send DMs via bot token
│           └── LinkedInPanel.jsx   # AI-drafted post variants
│
└── server/
    ├── index.js                    # All API routes (~1800 lines)
    └── services/
        ├── auth.js                 # Google OAuth2 client, token refresh
        ├── users.js                # JWT sign/verify, user CRUD
        ├── db.js                   # Neon Postgres + JSON fallback init
        ├── integrations.js         # Per-user encrypted key store
        ├── encryption.js           # AES-256-GCM encrypt/decrypt
        ├── llm.js                  # LLM router (Gemini ↔ Groq), streaming
        ├── langchain-agent.js      # LangGraph tool-calling agent
        ├── tracing.js              # LangSmith setup
        ├── memory.js               # VIPs, voice profile, saved snippets
        ├── notion.js               # Tasks + notes CRUD
        ├── gmail.js                # Inbox triage, draft, send, archive
        ├── calendar.js             # Events, conflicts, focus blocks
        ├── github.js               # PRs, issues, changelog (multi-repo)
        ├── slack.js                # DM + Block Kit digest delivery
        ├── trello.js               # Lists, cards, move
        ├── todoist.js              # Tasks, create, close, update
        └── content.js              # LinkedIn post drafts (3 variants)
```

---

## Frontend Panels

### ChatPanel
- Two modes: **Classic** (SSE token streaming) and **LangChain Agent** (JSON)
- Stores last 100 messages in localStorage
- Pre-classified command suggestions per connected tool
- `POST /api/chat` — streaming  |  `POST /api/chat/agent` — JSON

### DigestPanel
- 4 stat cards: emails pending, conflicts, blockers, content drafts
- Top 3 items from each sub-agent's result
- `GET /api/digest/latest` — non-blocking cached read
- `POST /api/digest/run` — triggers full parallel execution

### EmailPanel
- Unread inbox triage with P1/P2/P3 scoring
- AI-drafted reply suggestions inline
- Approve / skip / archive / delete actions
- Cache TTL: 5 min server-side, 30 min client-side

### CalendarPanel
- Next N events + overlap conflict detection
- Focus block creator ("Deep work" event)
- Create / update / delete via chat or UI buttons

### TaskPanel
- Kanban board: To Do → In Progress → Done (+ On Hold)
- Drag-and-drop between columns (syncs status to Notion/Todoist)
- Priority colour on card left-border (P1=red, P2=amber, P3=blue)
- Notion Notes column: list existing pages + "New page" inline form
- Source badge: Notion / Todoist / Trello

### GitHubPanel
- Tabs: Overview (PRs + issues) | Contributions | Branches
- Stale PR detection (configurable day threshold)
- Multi-repo dropdown
- LLM-drafted issue body from one-line description
- Changelog generator from merged PRs

### SettingsPage
- Test & save credentials for every service
- Shows connection status dot + last synced timestamp
- Service-specific validation before saving (e.g., checks Notion DB access)

---

## Backend Routes

### Auth
| Method | Route | What |
|---|---|---|
| GET | `/api/auth/google/signin` | Unauthenticated Google sign-in entry |
| GET | `/api/auth/google/init` | Authenticated: get OAuth URL with userId baked into state |
| GET | `/api/auth/google/callback` | Exchange code, create/link user, redirect with JWT |
| POST | `/api/auth/login` | Username + password → JWT |
| POST | `/api/auth/signup` | Create account → JWT |
| GET | `/api/users/me` | Current user profile |

### Credentials
| Method | Route | What |
|---|---|---|
| POST | `/api/credentials/test/:service` | Validate key + save on success |
| POST | `/api/credentials/save/notion` | Save without validation (bypass for persistent 401) |
| GET | `/api/integrations` | List all configured services |
| DELETE | `/api/integrations/:service` | Disconnect service |

### Data
| Method | Route | What |
|---|---|---|
| GET | `/api/health` | Status of all connected services |
| GET/POST | `/api/tasks` | Fetch / create (syncs Notion + Todoist simultaneously) |
| GET/POST | `/api/notes` | Notion notes CRUD |
| GET | `/api/emails` | Cached Gmail triage |
| GET/POST | `/api/calendar` | Events fetch / create |
| GET | `/api/digest/latest` | Latest digest cache |
| POST | `/api/digest/run` | Execute full digest (4 sub-agents parallel) |
| GET | `/api/prs` | Open PRs + stale detection |
| GET/POST | `/api/github/issues` | Issues fetch / create |
| GET | `/api/trello/board` | Lists + cards |
| POST | `/api/trello/move` | Move card between lists |
| POST | `/api/chat` | SSE streaming chat |
| POST | `/api/chat/agent` | LangChain agent (JSON) |

---

## Auth System

### JWT Login
1. POST `/api/auth/login` → verify bcrypt hash → sign JWT (30-day expiry)
2. Frontend stores in `localStorage('devos_token')`
3. Every `apiFetch` call attaches `Authorization: Bearer <token>`

### Google OAuth2
1. Click "Continue with Google" → `/api/auth/google/signin`
2. Google consent screen → callback with `code`
3. Exchange code → access + refresh tokens
4. Fetch Google profile → create user (or link to existing by email)
5. Save refresh token → `tokens/{userId}.json` + `user_integrations` table
6. Redirect to frontend: `/?google_token=<jwt>`
7. Frontend stores token, app loads

### Connect Google (existing user)
- `/api/auth/google/init?from=settings` (requires auth)
- `state` includes `uid:123` so callback links to correct account
- Redirects back to settings with `?google_connected=true`

---

## Data Isolation

Every user's API keys are encrypted at rest using **AES-256-GCM**:

```
Store:   encrypt(plaintext, ENCRYPTION_SECRET) → iv:authTag:ciphertext
Retrieve: decrypt(iv:authTag:ciphertext, ENCRYPTION_SECRET) → plaintext
```

At request time: `getUserCreds(userId)` decrypts all keys for that user only. No key ever appears in logs or plain text in the DB.

**Google tokens** are stored in two places:
- `tokens/{userId}.json` — fast filesystem read
- `user_integrations` table — survives server restarts + Railway redeploys

**Memory** (VIPs, voice profile) is currently in a single `memory.json` — shared across users. This is a known issue (see improvements below).

---

## LLM Routing

```
Task type           → Model
─────────────────────────────────
digest, brief       → Gemini 2.0 Flash (primary)
content, changelog  → Gemini 2.0 Flash (primary)
chat, classify      → Groq Llama 3.1 8B (primary)
triage, intent      → Groq Llama 3.1 8B (primary)
blocker             → Gemini 2.0 Flash (primary)
```

If the primary key is missing or the API is down, the router automatically falls back to the other provider.

### LangChain Agent Tools (20+)
`add_task`, `update_task`, `delete_task`, `get_tasks`,
`create_note`, `get_notes`,
`draft_email`, `send_email`, `get_emails`, `archive_email`,
`create_event`, `update_event`, `delete_event`, `get_calendar`, `scan_conflicts`, `block_focus_time`,
`get_prs`, `get_issues`, `create_issue`, `close_issue`,
`get_trello`, `run_digest`,
`save_memory`, `draft_linkedin`, `general_chat`

---

## Integrations

| Service | Auth | Key operations |
|---|---|---|
| **Notion** | Integration secret (`ntn_`) | getTasks, createTask, updateStatus, getNotes, createNote |
| **Gmail** | Google OAuth (gmail.modify scope) | getInbox, triageInbox (P1/P2/P3), createDraft, sendEmail, archiveEmail |
| **Calendar** | Google OAuth (calendar scope) | getUpcoming, createEvent, createRecurring, scanConflicts, blockFocusTime |
| **GitHub** | PAT (`ghp_` / `github_pat_`) | getOpenPRs, getIssues, createIssue, updateIssue, generateChangelog |
| **Slack** | Bot token (`xoxb-`) | sendDM, sendDigest (Block Kit) |
| **Trello** | API key + token | getLists, getCards, createCard, moveCard, scanStaleCards |
| **Todoist** | API token | getTasks, createTask, updateStatus, deleteTask |
| **LinkedIn** | Webhook URL | draftLinkedInPost (3 variants: storytelling, concise, technical) |

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...neon.tech/...     # Neon pooled connection
ENCRYPTION_SECRET=<32+ char random string>     # AES-256-GCM key derivation

# AI
GEMINI_API_KEY=AIza...
GROQ_API_KEY=gsk_...
LANGSMITH_API_KEY=lsv2_...                     # Optional — enables tracing

# Google OAuth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Notion
NOTION_API_KEY=ntn_...
NOTION_TASKS_DB_ID=<32-char hex>
NOTION_NOTES_DB_ID=<32-char hex>

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=username
GITHUB_REPOS=owner/repo1,owner/repo2

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_USER_ID=U123ABC

# Trello
TRELLO_API_KEY=...
TRELLO_TOKEN=...
TRELLO_BOARD_ID=...

# Todoist
TODOIST_API_KEY=...

# LinkedIn
LINKEDIN_WEBHOOK_URL=https://...

# Deployment
RAILWAY_PUBLIC_DOMAIN=myapp.railway.app
PORT=3001
JWT_SECRET=<random string>
USER_TIMEZONE=America/New_York
```

---

## What Can Be Done Better

### 1. Split `server/index.js` (1800+ lines)
The entire backend lives in one file. Split into route modules:
```
server/routes/
  auth.js         ← Google OAuth, JWT login/signup
  tasks.js        ← /api/tasks, /api/notes
  chat.js         ← /api/chat, /api/chat/agent
  digest.js       ← /api/digest/*
  github.js       ← /api/prs, /api/github/*
  credentials.js  ← /api/credentials/*, /api/integrations
```

### 2. Migrate memory to per-user DB rows
`memory.json` is global — VIPs, voice profile, saved snippets bleed across accounts. Move to a `user_memory` column (JSON) in the `users` table or a dedicated `user_memory` table.

### 3. Replace in-process cron with a real job queue
`node-cron` inside Express resets on every restart. Use BullMQ + Redis (or Railway's native cron triggers) for reliable per-user digest scheduling at user-defined times.

### 4. Persist email cache to DB
`_emailCache` is an in-memory `Map` — gone on restart. Add a `cache` table with `user_id`, `key`, `value`, `expires_at` columns so triage results survive restarts.

### 5. Merge the two chat paths
`/api/chat` (classic SSE) and `/api/chat/agent` (LangChain JSON) duplicate logic. Target: one streaming LangChain agent path via LangGraph's streaming SSE support. Remove the classic path once stable.

### 6. Add error toasts in the UI
Failed API calls (401 expired, 500 Notion error) are silently swallowed. A lightweight toast system would surface "Notion not connected" or "GitHub rate-limited" without opening DevTools.

### 7. Add JWT refresh flow
Tokens expire after 30 days with no silent refresh. Implement short-lived access tokens (15 min) + long-lived refresh tokens (30 days) stored in an httpOnly cookie.

### 8. Add rate limiting
Any authenticated user can spam `/api/digest/run` (multiple LLM calls per invocation). Add `express-rate-limit` per user per expensive endpoint.

### 9. Fix LinkedIn integration
Currently drafts only — you copy-paste to LinkedIn. Integrate with **Buffer API** or **Typefully API** (both have proper OAuth, no business verification needed) to push drafts directly.

### 10. Make the UI responsive
Currently desktop-only (1400px+ layout). A responsive layout would make the digest and chat usable on mobile.

---

## What You Could Add Next

| Feature | Why | Effort |
|---|---|---|
| Webhook triggers (GitHub PR → auto-digest) | Real-time instead of polling | Medium |
| Voice input (Web Speech API) | Chat with DevOS hands-free | Low |
| Email sending from UI (not just drafts) | Close the loop on email triage | Low |
| Obsidian / Markdown note sync | Notion notes → local files | Medium |
| Multi-user teams (shared board) | Share tasks/digest with a co-founder | High |
| Plugin system | Let others add integrations without forking | High |

---

## One-Line Summary

DevOS is well-architected for a personal tool — encrypted per-user credentials, solid LLM routing, clean Kanban UI — but needs the `index.js` monolith split, the memory system migrated to per-user DB rows, and the two chat paths merged into one streaming agent before it scales to multiple users.
