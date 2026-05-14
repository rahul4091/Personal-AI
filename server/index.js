// server/index.js
import crypto     from 'crypto';
import express    from 'express';
import cors       from 'cors';
import cron       from 'node-cron';
import { fileURLToPath } from 'url';
import path       from 'path';

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

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    ok:              true,
    gemini:          !!process.env.GEMINI_API_KEY,
    groq:            !!process.env.GROQ_API_KEY,
    notion:          !!process.env.NOTION_API_KEY,
    google:          auth.isConnected(),
    slack:           !!process.env.SLACK_BOT_TOKEN,
    github:          github.isConfigured(),
    trello:          !!process.env.TRELLO_API_KEY,
    todoist:         !!process.env.TODOIST_API_KEY,
    linkedin:        !!process.env.LINKEDIN_WEBHOOK_URL,
  });
});

// ─── Google OAuth2 ────────────────────────────────────────────────────────────

app.get('/api/auth/google', (req, res) => {
  res.redirect(auth.getAuthUrl());
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const client      = auth.createOAuth2Client();
    const { tokens }  = await client.getToken(req.query.code);
    auth.saveTokens(tokens);
    res.redirect('http://localhost:5173?connected=true');
  } catch (err) {
    console.error('[auth/google/callback]', err.message);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({ connected: auth.isConnected() });
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
- NEVER respond with general_chat for any GitHub issue/PR action — always use the correct intent`.trim();
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

async function executeAction(intent, params, originalMessage = '') {
  switch (intent) {

    case 'add_task': {
      // Tasks → Todoist only
      if (!params.title) return null;
      if (todoist.isConfigured()) return await todoist.createTask(params.title);
      if (notionReady())          return await notion.createTask(params.title);
      return { error: 'No task service configured' };
    }

    case 'update_task': {
      if (!params.taskId) return { error: 'taskId is required' };
      const isTodoist = /^\d+$/.test(params.taskId) || params.source === 'todoist';
      // Status-only update
      if (params.status && !params.title) {
        return isTodoist
          ? await todoist.updateTaskStatus(params.taskId, params.status)
          : await notion.updateTaskStatus(params.taskId, params.status);
      }
      // Title (rename) or combined update
      const patches = {};
      if (params.title)  patches.title  = params.title;
      if (params.status) patches.status = params.status;
      return isTodoist
        ? await todoist.updateTask(params.taskId, patches)
        : await notion.updateTask(params.taskId, patches);
    }

    case 'get_tasks': {
      const [nt, tt] = await Promise.all([
        notionReady()          ? notion.getTasks()  : [],
        todoist.isConfigured() ? todoist.getTasks() : [],
      ]);
      return { notion: nt, todoist: tt };
    }

    case 'delete_task': {
      if (!params.taskId) return { error: 'taskId is required' };
      const isTodoist = /^\d+$/.test(params.taskId) || params.source === 'todoist';
      return isTodoist
        ? await todoist.deleteTask(params.taskId)
        : await notion.deleteTask(params.taskId);
    }

    case 'create_note':
      // Notes → Notion only
      if (!params.title) return null;
      if (!notionReady()) return { error: 'Notion is not configured' };
      return await notion.createNote(params.title, params.body ?? '');

    case 'get_notes':
      return { notes: await notion.getNotes() };

    case 'get_emails':
      return { emails: await gmail.triageInbox(10) };

    case 'get_emails_range': {
      const { startDate, endDate, title } = params;
      if (!startDate) return { error: 'startDate is required' };
      const emails = await gmail.getEmailsByDateRange(startDate, endDate ?? new Date().toISOString().slice(0, 10));
      return { emails, count: emails.length, range: { startDate, endDate } };
    }

    case 'draft_email':
      if (params.to && params.body) {
        return await gmail.createDraft(params.to, params.title ?? 'No subject', params.body);
      }
      return null;

    case 'send_email':
      if (params.to && params.body) {
        return await gmail.sendEmail(params.to, params.title ?? 'No subject', params.body);
      }
      return null;

    case 'archive_email':
      return params.taskId ? await gmail.archiveEmail(params.taskId) : null;

    case 'create_event': {
      if (!params.title) return { error: 'title is required' };

      if (params.recurring && params.days?.length && params.time) {
        return await calendar.createRecurringEvent(params.title, params.days, params.time, params.duration ?? 60);
      }

      if (params.date) {
        const resolved = resolveDate(params.date);
        if (!resolved) return { error: `Could not parse date "${params.date}". Use format: YYYY-MM-DDTHH:MM` };
        console.log(`[create_event] title="${params.title}" raw="${params.date}" resolved="${resolved}"`);
        return await calendar.createEvent(params.title, resolved, params.duration ?? 60);
      }

      return { error: 'Provide a date for a single event, or days + time for a recurring event.' };
    }

    case 'delete_event': {
      const target = params.title || params.taskId;
      if (!target) return { error: 'Provide the event name to delete' };
      return await calendar.deleteEvent(target);
    }

    case 'update_event': {
      const target = params.title || params.taskId;
      if (!target) return { error: 'Provide the event name to update' };
      const patches = {};
      if (params.body)     patches.title    = params.body;    // body = new title (rename)
      if (params.date)     patches.date     = resolveDate(params.date) ?? params.date;
      if (params.duration) patches.duration = Number(params.duration);
      return await calendar.updateEvent(target, patches);
    }

    case 'get_calendar':
      return { events: await calendar.getUpcoming(5) };

    case 'scan_conflicts':
      return { conflicts: await calendar.scanConflicts() };

    case 'block_focus_time':
      return { blocks: await calendar.blockFocusTime(params.title ?? 'Deep work') };

    case 'get_prs':
      return { prs: await github.getOpenPRs(params.repo), stale: await github.scanStalePRs(3, params.repo) };

    case 'create_issue': {
      if (!params.title) return { error: 'title is required' };
      const repos = github.getRepos();
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
        '',
        'content'
      ).catch(() => userContext);
      return await github.createIssue(params.title, body, labels, params.repo);
    }

    case 'get_issues': {
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) {
        return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      }
      return { issues: await github.getIssues('open', params.repo), repo: params.repo };
    }

    case 'delete_issue': {
      if (!params.taskId) return { error: 'Issue number is required' };
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.deleteIssue(params.taskId, params.repo);
    }

    case 'close_issue': {
      if (!params.taskId) return { error: 'Issue number (taskId) is required' };
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      try {
        return await github.closeIssue(params.taskId, params.repo);
      } catch (err) {
        const open = await github.getIssues('open', params.repo).catch(() => []);
        const list = open.length ? open.map(i => `#${i.id} ${i.title}`).join(', ') : 'none';
        return { error: `Issue #${params.taskId} not found. Open issues: ${list}` };
      }
    }

    case 'reopen_issue': {
      if (!params.taskId) return { error: 'Issue number (taskId) is required' };
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.reopenIssue(params.taskId, params.repo);
    }

    case 'update_issue': {
      if (!params.taskId) return { error: 'Issue number (taskId) is required' };
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      const patches = {};
      if (params.title)  patches.title  = params.title;
      if (params.body)   patches.body   = params.body;
      if (params.labels) patches.labels = Array.isArray(params.labels) ? params.labels : String(params.labels).split(',').map(l => l.trim());
      if (params.status) patches.state  = params.status === 'closed' ? 'closed' : 'open';
      return await github.updateIssue(params.taskId, patches, params.repo);
    }

    case 'comment_issue': {
      if (!params.taskId || !params.body) return { error: 'Issue number and comment body are required' };
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.commentOnIssue(params.taskId, params.body, params.repo);
    }

    case 'close_pr': {
      if (!params.taskId) return { error: 'PR number (taskId) is required' };
      const repos = github.getRepos();
      if (!params.repo && repos.length > 1) return { error: `Which repo? Available: ${repos.map(r => r.split('/')[1]).join(', ')}` };
      return await github.closePR(params.taskId, params.repo);
    }

    case 'get_trello':
      return { cards: await trello.getCards(), stale: await trello.scanStaleCards(5) };

    case 'run_digest':
      runDigest().catch(console.error);
      return { triggered: true, message: 'Digest is running in the background.' };

    case 'get_digest':
      return _cachedDigest ?? { message: 'No digest yet — run one first.' };

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

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  try {
    const connectedTools = [
      notionReady()                    && 'Notion (tasks & notes)',
      todoist.isConfigured()           && 'Todoist (tasks)',
      auth.isConnected()               && 'Gmail & Google Calendar',
      process.env.SLACK_BOT_TOKEN      && 'Slack',
      process.env.GITHUB_TOKEN         && 'GitHub',
      process.env.TRELLO_API_KEY       && 'Trello',
    ].filter(Boolean).join(', ');

    const memContext = memory.buildContextSummary();
    const classified = await llm.classify(
      `Today is ${new Date().toDateString()}. Connected tools: ${connectedTools}.${memContext ? ' User context: ' + memContext : ''}\n${buildRoutingRules()}\nUser message: "${message}"`,
      AGENT_SCHEMA
    );

    const actions  = classified.actions ?? [];
    const isChat   = actions.length === 0 || (actions.length === 1 && actions[0].intent === 'general_chat');
    const results  = [];
    const intents  = [];

    if (!isChat) {
      // Execute all actions, in parallel where safe
      const settled = await Promise.allSettled(
        actions.map(a => executeAction(a.intent, a.params ?? {}, message))
      );
      settled.forEach((s, i) => {
        const intent = actions[i].intent;
        const params = actions[i].params ?? {};
        const result = s.status === 'fulfilled' ? s.value : { error: s.reason?.message };
        const isErr  = s.status === 'rejected' || result?.error;
        memory.logActivity(intent, params, isErr ? 'error' : 'success', isErr ? (s.reason?.message ?? result?.error) : null);
        intents.push(intent);
        results.push(result);
      });
    }

    // Query intents return data the user wants summarised; action intents just need acknowledgement
    const needsSummary = intents.some(i => QUERY_INTENTS_SET.has(i));

    let finalReply;

    if (results.length > 0 && needsSummary) {
      // One focused summary call — only for queries that return data worth explaining
      const summary = actions.map((a, i) => `${a.intent}: ${JSON.stringify(results[i])}`).join('\n');
      const hasEmailRange = intents.includes('get_emails_range');
      const hasIssues     = intents.includes('get_issues');
      const summaryGuide  = hasEmailRange
        ? 'List each email as: sender — subject — one-line summary. Group by date if multiple days. End with a total count.'
        : hasIssues
        ? 'List each open issue with its number, title, and status. End with a count.'
        : 'Summarise clearly in 2-4 sentences.';
      finalReply = await llm.generate(
        `User asked: "${message}"\nData:\n${summary}\n${summaryGuide}`,
        '', 'chat'
      );
    } else if (results.length > 0) {
      const failedResult = results.find(r => r?.error);
      if (failedResult) {
        // Action failed — generate an honest error reply instead of the pre-classified success
        const summary = actions.map((a, i) => `${a.intent}: ${JSON.stringify(results[i])}`).join('\n');
        finalReply = await llm.generate(
          `User asked: "${message}"\nAction results:\n${summary}\nExplain clearly in 1-2 sentences what failed and why.`,
          '', 'chat'
        );
      } else {
        // All actions succeeded — use the pre-classified reply (no extra LLM call)
        finalReply = classified.reply ?? 'Done.';
      }
    } else {
      // general_chat — single direct call, no classification overhead next time
      const historyMsgs = history.slice(-5).map(m => ({ role: m.role, content: m.content }));
      finalReply = await llm.call(
        [
          { role: 'system', content: `You are DevOS, a personal AI agent managing: ${connectedTools}. Be concise.${memContext ? ' User context: ' + memContext : ''}` },
          ...historyMsgs,
          { role: 'user', content: message },
        ],
        { taskType: 'chat', maxTokens: 400 }
      );
    }

    // Tell the client which panel types were affected so they can auto-refresh
    const affectedPanels = [
      intents.some(i => TASK_ACTION_INTENTS.has(i))     && 'tasks',
      intents.some(i => CALENDAR_ACTION_INTENTS.has(i)) && 'calendar',
      intents.some(i => GITHUB_ACTION_INTENTS.has(i))   && 'github',
      intents.some(i => EMAIL_ACTION_INTENTS.has(i))    && 'comms',
      intents.some(i => DIGEST_ACTION_INTENTS.has(i))   && 'digest',
    ].filter(Boolean);

    return res.json({
      reply:          finalReply,
      intent:         intents[0] ?? 'general_chat',
      intents,
      actionResult:   results.length === 1 ? results[0] : results.length > 1 ? results : null,
      affectedPanels,
    });

  } catch (err) {
    console.error('[chat]', err);
    return res.status(500).json({ error: 'Agent error: ' + err.message });
  }
});

// ─── Panel data endpoints ─────────────────────────────────────────────────────

// Notion is ready only when both key AND database ID are set
function notionReady() {
  return !!(process.env.NOTION_API_KEY && process.env.NOTION_TASKS_DB_ID &&
            process.env.NOTION_TASKS_DB_ID !== 'your_tasks_database_id_here');
}

app.get('/api/tasks', async (req, res) => {
  try {
    const [nr, tr] = await Promise.allSettled([
      notionReady()             ? notion.getTasks()   : Promise.resolve([]),
      todoist.isConfigured()    ? todoist.getTasks()  : Promise.resolve([]),
    ]);
    res.json({
      notion:  nr.status === 'fulfilled' ? nr.value : [],
      todoist: tr.status === 'fulfilled' ? tr.value : [],
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const trimmed = title.trim();
    if (notionReady()) {
      const [notionTask] = await Promise.all([
        notion.createTask(trimmed),
        todoist.createTask(trimmed).catch(err => console.error('[todoist sync]', err.message)),
      ]);
      return res.json(notionTask);
    }
    // Todoist-only
    const task = await todoist.createTask(trimmed);
    if (!task) return res.status(500).json({ error: 'Failed to create task in Todoist' });
    res.json(task);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/notes',    async (req, res) => { try { res.json(await notion.getNotes())          } catch(e){ res.status(500).json({error:e.message}) }});
let _emailCache = null, _emailCacheAt = 0;
const EMAIL_TTL = 5 * 60 * 1000; // 5 minutes
app.get('/api/emails', async (req, res) => {
  if (_emailCache && Date.now() - _emailCacheAt < EMAIL_TTL) return res.json(_emailCache);
  try {
    _emailCache  = await gmail.triageInbox(15);
    _emailCacheAt = Date.now();
    res.json(_emailCache);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/calendar',  async (req, res) => { try { res.json(await calendar.getUpcoming(10))  } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/calendar', async (req, res) => {
  try {
    const { title, date, duration = 60, description = '', recurring, days, time } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    if (recurring) {
      if (!days?.length) return res.status(400).json({ error: 'days array is required for recurring events' });
      if (!time)         return res.status(400).json({ error: 'time (HH:MM) is required for recurring events' });
      const event = await calendar.createRecurringEvent(title, days, time, Number(duration), description);
      return res.json(event);
    }

    if (!date) return res.status(400).json({ error: 'date is required for single events' });
    const event = await calendar.createEvent(title, date, Number(duration), description);
    res.json(event);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/github/repos',    (req, res) => res.json(github.getRepos()));
app.get('/api/prs',              async (req, res) => { try { res.json(await github.getOpenPRs(req.query.repo))             } catch(e){ res.status(500).json({error:e.message}) }});
app.get('/api/github/issues',   async (req, res) => { try { res.json(await github.getIssues('open', req.query.repo))       } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/github/issues',  async (req, res) => {
  try {
    const { title, body = '', labels = [], repo } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    res.json(await github.createIssue(title.trim(), body, labels, repo));
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.get('/api/github/merged',   async (req, res) => { try { res.json(await github.getMergedPRs(undefined, req.query.repo)) } catch(e){ res.status(500).json({error:e.message}) }});
app.get('/api/github/changelog',async (req, res) => {
  try {
    const changelog = await github.generateChangelog(undefined, req.query.repo);
    res.json({ changelog });
  } catch(e){ res.status(500).json({error:e.message}) }
});
app.post('/api/github/draft-body', async (req, res) => {
  try {
    const { title, context = '' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title required' });
    const body = await llm.generate(
      `Draft a GitHub issue body in markdown for the issue titled: "${title.trim()}". ` +
      `${context.trim() ? `Additional context: ${context.trim()} ` : ''}` +
      `Structure it with sections: ## Summary, ## Goals, ## Suggested approach, ## Tests (if applicable). ` +
      `Use bullet points. Be specific. Output only the markdown body, no preamble.`,
      '', 'content'
    );
    res.json({ body });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/slack/send', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });
    const ts = await slack.sendDM(text.trim());
    res.json({ ok: !!ts, ts });
  } catch(e){ res.status(500).json({ error: e.message }) }
});
app.get('/api/cards',    async (req, res) => { try { res.json(await trello.getCards())          } catch(e){ res.status(500).json({error:e.message}) }});
app.get('/api/memory',   async (req, res) => { res.json(memory.getMemory()) });
app.get('/api/activity', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(memory.getActivityLog(limit));
});

// ─── Action endpoints ─────────────────────────────────────────────────────────

function invalidateEmailCache() { _emailCache = null; _emailCacheAt = 0; }

app.get('/api/email/:id', async (req, res) => {
  try {
    const email = await gmail.getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'not found' });
    res.json(email);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'valid "to" email required' });
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });
    const result = await gmail.sendEmail(to, subject ?? '(no subject)', body);
    memory.logActivity('send_email', { to, title: subject }, 'success');
    console.log(`[email] sent to=${to} subject="${subject}"`);
    res.json(result);
  } catch(e) {
    console.error(`[email] send failed to=${req.body?.to}: ${e.message}`);
    memory.logActivity('send_email', { to: req.body?.to, title: req.body?.subject }, 'error', e.message);
    res.status(500).json({ error: `Failed to send email: ${e.message}` });
  }
});
app.post('/api/email/archive', async (req, res) => { try { invalidateEmailCache(); res.json(await gmail.archiveEmail(req.body.id)) } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/email/approve-draft', async (req, res) => {
  try {
    const { to, subject, original, edited } = req.body;
    if (!to || !edited?.trim()) return res.status(400).json({ error: 'to and edited body are required' });
    invalidateEmailCache();
    const sent = await gmail.sendEmail(to, subject, edited);
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

app.post('/api/task/update', async (req, res) => {
  try {
    const { id, status, source } = req.body;
    // Todoist IDs are numeric strings; Notion IDs are UUIDs with dashes
    const isTodoist = source === 'todoist' || /^\d+$/.test(id);
    const result = isTodoist
      ? await todoist.updateTaskStatus(id, status)
      : await notion.updateTaskStatus(id, status);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/memory/vip',  async (req, res) => { res.json({ vips: memory.addVIP(req.body.email, req.body.name) }) });
app.post('/api/content/linkedin', async (req, res) => { try { res.json(await content.draftLinkedInPost(req.body.source)) } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/content/approve', async (req, res) => {
  const { original, edited, type = 'linkedin', postNow = false } = req.body;
  memory.recordApprovedDraft(original, edited, type);

  let posted = false;
  if (postNow && process.env.LINKEDIN_WEBHOOK_URL) {
    try {
      const hook = await fetch(process.env.LINKEDIN_WEBHOOK_URL, {
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

  res.json({ ok: true, posted });
});

// ─── Webhook endpoints ────────────────────────────────────────────────────────

app.post('/api/webhook/github', async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig     = req.headers['x-hub-signature-256'] ?? '';
    const payload = JSON.stringify(req.body);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
  }
  res.json({ ok: true }); // acknowledge immediately
  const event = req.headers['x-github-event'];
  const body  = req.body;

  try {
    if (event === 'pull_request' && body.action === 'opened') {
      const pr    = body.pull_request;
      const stale = await github.scanStalePRs(3);
      if (stale.length) {
        await slack.sendAlert('Stale PRs detected', stale.map(p => `#${p.id} ${p.title} (${p.daysStale}d)`).join('\n'));
      }
    }
  } catch (err) {
    console.error('[webhook/github]', err.message);
  }
});

// ─── Digest orchestrator ──────────────────────────────────────────────────────

async function _runDigest() {
  console.log('[digest] starting all sub-agents...');

  const [commsResult, calendarResult, tasksResult, contentResult] = await Promise.allSettled([
    // Comms sub-agent
    gmail.triageInbox(15).then(emails => ({
      pending:  emails.filter(e => e.priority !== 'P3'),
      archived: emails.filter(e => e.priority === 'P3').length,
    })),

    // Calendar sub-agent
    Promise.all([
      calendar.getUpcoming(5),
      calendar.scanConflicts(),
    ]).then(([events, conflicts]) => ({ events, conflicts })),

    // Tasks sub-agent
    Promise.all([
      notionReady() ? notion.getTasks() : todoist.getTasks(),
      github.scanStalePRs(3),
      trello.scanStaleCards(5),
    ]).then(([tasks, stalePRs, staleCards]) => ({
      tasks,
      blockers: [
        ...stalePRs.map(p  => ({ type: 'pr',   title: p.title,  id: p.id,  source: 'github' })),
        ...staleCards.map(c => ({ type: 'card', title: c.title, id: c.id,  source: 'trello' })),
      ],
    })),

    // Content sub-agent
    github.getMergedPRs().then(async prs => {
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

let _cachedDigest = null;

export async function runDigest() {
  const digest = await _runDigest();
  _cachedDigest = digest;
  return digest;
}

// ─── Manual digest trigger ────────────────────────────────────────────────────

app.post('/api/digest/run', async (req, res) => {
  try {
    const digest = await runDigest();
    res.json(digest);
  } catch (err) {
    console.error('[digest/run]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/digest/latest', (req, res) => {
  res.json(_cachedDigest ?? null);
});

// ─── Scheduled digest — every morning at 9 AM ────────────────────────────────

cron.schedule('0 9 * * *', () => {
  console.log('[cron] 9 AM digest firing');
  runDigest().catch(console.error);
});

// Also run 7 AM calendar check
cron.schedule('0 7 * * *', async () => {
  console.log('[cron] 7 AM calendar check');
  try {
    const conflicts = await calendar.scanConflicts();
    if (conflicts.length) {
      await slack.sendAlert(
        `${conflicts.length} calendar conflict(s) today`,
        conflicts.map(c => `${c.eventA.title} ↔ ${c.eventB.title}`).join('\n'),
        'high'
      );
    }
    await calendar.blockFocusTime();
  } catch (err) {
    console.error('[cron/calendar]', err.message);
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 DevOS Agent server running on http://localhost:${PORT}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? '✓' : '✗ missing'}`);
  console.log(`   Groq:   ${process.env.GROQ_API_KEY   ? '✓' : '✗ missing'}`);
  console.log(`   Notion: ${process.env.NOTION_API_KEY  ? '✓' : '✗ missing'}`);
  console.log(`   Google: ${auth.isConnected()           ? '✓ connected' : '✗ not connected — visit /api/auth/google'}`);
  console.log(`   Slack:   ${process.env.SLACK_BOT_TOKEN  ? '✓' : '○ optional'}`);
  console.log(`   GitHub:  ${process.env.GITHUB_TOKEN     ? '✓' : '○ optional'}`);
  console.log(`   Trello:  ${process.env.TRELLO_API_KEY   ? '✓' : '○ optional'}`);
  console.log(`   Todoist: ${process.env.TODOIST_API_KEY  ? '✓' : '○ optional'}\n`);
});
