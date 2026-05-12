# DevOS Agent

Personal AI Command Center — an autonomous agent that manages Gmail, Google Calendar, Notion, GitHub, Trello, and Slack using Gemini 2.5 Flash + Groq Llama 3.3 (both free, no credit card).

## Features

- **Morning digest** — all 6 sub-agents run in parallel at 9 AM, result delivered to Slack
- **Email triage** — P1/P2/P3 scoring with auto-generated draft replies, one-tap approve/send
- **Calendar intelligence** — conflict detection, focus block protection, pre-meeting briefs
- **Task sync** — Notion tasks + GitHub PR staleness + Trello card tracking
- **Content generation** — LinkedIn posts (3 variants), changelogs from merged PRs
- **Smart chat** — intent classification routes commands to the right service automatically
- **Memory store** — learns your voice, VIP contacts, and preferences over time

## Tech stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 19 + Vite 6                       |
| Backend   | Node.js 20+ + Express 5 (ES modules)   |
| AI        | Gemini 2.5 Flash (free) + Groq (free)  |
| Tasks     | Notion API                              |
| Email     | Gmail API (Google OAuth2)               |
| Calendar  | Google Calendar API (same OAuth token)  |
| Chat/Alerts | Slack Web API (optional)              |
| Dev tools | GitHub REST API + Trello REST API (opt) |

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd devos-agent

npm install
npm install --prefix server
npm install --prefix client
```

### 2. Get your free API keys

**Gemini** (no credit card)
1. Go to https://aistudio.google.com
2. Click "Get API key" → Create API key
3. Copy the key

**Groq** (no credit card)
1. Go to https://console.groq.com
2. Sign up → API Keys → Create API key
3. Copy the key

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `GEMINI_API_KEY` and `GROQ_API_KEY` (required — AI engine)
- `NOTION_API_KEY`, `NOTION_TASKS_DB_ID`, `NOTION_NOTES_DB_ID` (required — tasks/notes)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required — Gmail + Calendar)
- `SLACK_BOT_TOKEN`, `SLACK_USER_ID` (optional — push digest delivery)
- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` (optional — PR tracking)
- `TRELLO_API_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID` (optional — sprint board)

### 4. Set up Notion

1. Go to https://notion.so/my-integrations → New integration
2. Copy the **Internal Integration Secret** → `NOTION_API_KEY`
3. Create a **Tasks** database: columns `Name` (title), `Status` (select: Not started / In progress / Done)
4. Create a **Notes** database: column `Name` (title)
5. Open each database → ⋯ menu → Add connections → select your integration
6. Copy each database ID from the URL (32-char hex before the `?`)

### 5. Set up Google OAuth2

1. Go to https://console.cloud.google.com → create/select a project
2. APIs & Services → Enable: **Gmail API** + **Google Calendar API**
3. OAuth consent screen → External → add your email as Test user
4. Credentials → Create OAuth client ID → Web application
   - Authorized origins: `http://localhost:3001`
   - Redirect URIs: `http://localhost:3001/api/auth/google/callback`
5. Copy Client ID → `GOOGLE_CLIENT_ID` and Client Secret → `GOOGLE_CLIENT_SECRET`

### 6. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001

### 7. Connect Google

Click **Connect Google** in the sidebar → sign in → approve Gmail + Calendar permissions.

### 8. (Optional) Set up Slack

1. Go to https://api.slack.com/apps → Create New App → From scratch
2. OAuth & Permissions → Add scopes: `chat:write`, `im:write`
3. Install to workspace → copy Bot User OAuth Token → `SLACK_BOT_TOKEN`
4. Your Slack user ID (Settings → Profile → copy member ID) → `SLACK_USER_ID`
5. Invite the bot to your DM: `/invite @your-bot-name`

---

## Project structure

```
devos-agent/
├── client/                      # React + Vite frontend
│   └── src/
│       ├── App.jsx              # layout, sidebar, routing
│       ├── index.css            # global styles
│       └── components/
│           ├── TopBar.jsx       # status dots + auth button
│           ├── DigestPanel.jsx  # unified morning digest
│           ├── ChatPanel.jsx    # main chat (localStorage history)
│           ├── EmailPanel.jsx   # triaged inbox with approve/skip
│           ├── CalendarPanel.jsx# events, conflicts, focus blocks
│           ├── TaskPanel.jsx    # Notion + GitHub PRs + Trello
│           └── ContentPanel.jsx # LinkedIn drafts + changelog
├── server/                      # Node.js + Express backend
│   ├── index.js                 # routes + digest orchestrator + cron
│   └── services/
│       ├── llm.js               # smart router: Gemini / Groq / Ollama
│       ├── auth.js              # Google OAuth2 singleton
│       ├── notion.js            # tasks + notes CRUD
│       ├── gmail.js             # inbox + triage + draft/send
│       ├── calendar.js          # events + conflicts + focus blocks
│       ├── memory.js            # persistent VIPs + voice profile
│       ├── slack.js             # digest delivery + P1 alerts
│       ├── github.js            # PR tracking + changelog
│       ├── trello.js            # card CRUD + staleness scan
│       └── content.js           # LinkedIn + changelog + README
├── .env.example                 # copy to .env and fill in keys
├── .gitignore
└── package.json                 # root — concurrently runs both
```

---

## Chat examples

| What you type                                    | What happens                                      |
|--------------------------------------------------|---------------------------------------------------|
| `What do I have today?`                          | Reads calendar, summarises events                 |
| `Any important emails?`                          | Triages inbox, shows P1/P2 with drafts            |
| `Add task: review PR #42`                        | Creates task in Notion                            |
| `Draft email to boss@co.com about the Q3 report` | Creates Gmail draft                               |
| `Schedule team sync tomorrow at 2pm for 1 hour`  | Creates Google Calendar event                     |
| `Add VIP: ceo@company.com`                       | Always treats this sender as P1                   |
| `Run digest`                                     | Fires all 6 agents, sends to Slack                |
| `Generate changelog`                             | Pulls merged PRs, writes release notes            |

---

## Troubleshooting

| Error                              | Fix                                                                                   |
|------------------------------------|---------------------------------------------------------------------------------------|
| `configured: false` in status bar  | Run `npm run dev` from the project root, not inside `server/`                         |
| `Error 400: redirect_uri_mismatch` | Add `http://localhost:3001/api/auth/google/callback` to Google Console redirect URIs  |
| `Error 403: access_denied`         | Add your Google account as a Test user in OAuth consent screen                        |
| Notion `API token is invalid`      | Regenerate the integration token and re-share databases with it                       |
| Gemini 429 rate limit              | Router auto-falls back to Groq — check logs for `[llm] falling back to groq`         |
| Slack messages not arriving        | Confirm bot was invited to your DM: `/invite @your-bot-name` in Slack                 |
| GitHub PRs not loading             | Check `GITHUB_OWNER` + `GITHUB_REPO` are set and token has `repo` scope              |
