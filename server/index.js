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
    github:          !!process.env.GITHUB_TOKEN,
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
const AGENT_SCHEMA = `{"actions":[{"intent":"add_task|update_task|get_tasks|create_note|get_notes|draft_email|send_email|get_emails|archive_email|create_event|get_calendar|scan_conflicts|block_focus_time|get_prs|get_trello|run_digest|get_digest|add_vip|save_memory|draft_linkedin|general_chat","params":{"title":null,"body":null,"to":null,"date":null,"duration":null,"status":null,"taskId":null,"email":null,"source":null,"memKey":null,"memValue":null}}],"reply":"brief reply"}`;

// ─── Single action executor ───────────────────────────────────────────────────

async function executeAction(intent, params) {
  switch (intent) {

    case 'add_task': {
      if (!params.title) return null;
      if (notionReady()) {
        const [notionTask] = await Promise.all([
          notion.createTask(params.title),
          todoist.createTask(params.title).catch(e => console.error('[todoist sync]', e.message)),
        ]);
        return notionTask;
      }
      return await todoist.createTask(params.title);
    }

    case 'update_task': {
      if (!params.taskId || !params.status) return null;
      const isTodoist = /^\d+$/.test(params.taskId) || params.source === 'todoist';
      return isTodoist
        ? await todoist.updateTaskStatus(params.taskId, params.status)
        : await notion.updateTaskStatus(params.taskId, params.status);
    }

    case 'get_tasks':
      return { tasks: notionReady() ? await notion.getTasks() : await todoist.getTasks() };

    case 'create_note':
      return params.title ? await notion.createNote(params.title, params.body ?? '') : null;

    case 'get_notes':
      return { notes: await notion.getNotes() };

    case 'get_emails':
      return { emails: await gmail.triageInbox(10) };

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

    case 'create_event':
      if (params.title && params.date) {
        return await calendar.createEvent(params.title, params.date, params.duration ?? 60);
      }
      return null;

    case 'get_calendar':
      return { events: await calendar.getUpcoming(5) };

    case 'scan_conflicts':
      return { conflicts: await calendar.scanConflicts() };

    case 'block_focus_time':
      return { blocks: await calendar.blockFocusTime(params.title ?? 'Deep work') };

    case 'get_prs':
      return { prs: await github.getOpenPRs(), stale: await github.scanStalePRs(3) };

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

const TASK_ACTION_INTENTS = new Set(['add_task', 'update_task', 'get_tasks']);
const CALENDAR_ACTION_INTENTS = new Set(['create_event', 'get_calendar', 'scan_conflicts', 'block_focus_time']);

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
      `Today is ${new Date().toDateString()}. Connected tools: ${connectedTools}.${memContext ? ' User context: ' + memContext : ''}\nUser message: "${message}"`,
      AGENT_SCHEMA
    );

    const actions  = classified.actions ?? [];
    const isChat   = actions.length === 0 || (actions.length === 1 && actions[0].intent === 'general_chat');
    const results  = [];
    const intents  = [];

    if (!isChat) {
      // Execute all actions, in parallel where safe
      const settled = await Promise.allSettled(
        actions.map(a => executeAction(a.intent, a.params ?? {}))
      );
      settled.forEach((s, i) => {
        intents.push(actions[i].intent);
        results.push(s.status === 'fulfilled' ? s.value : { error: s.reason?.message });
      });
    }

    // Query intents return data the user wants summarised; action intents just need acknowledgement
    const QUERY_INTENTS = new Set(['get_tasks','get_emails','get_calendar','get_notes','get_prs','get_trello','get_digest']);
    const needsSummary  = intents.some(i => QUERY_INTENTS.has(i));

    let finalReply;

    if (results.length > 0 && needsSummary) {
      // One focused summary call — only for queries that return data worth explaining
      const summary = actions.map((a, i) => `${a.intent}: ${JSON.stringify(results[i])}`).join('\n');
      finalReply = await llm.generate(
        `User asked: "${message}"\nData:\n${summary}\nSummarise clearly in 2-4 sentences.`,
        '', 'chat'
      );
    } else if (results.length > 0) {
      // Action intents — use the pre-classified reply directly, no second LLM call
      finalReply = classified.reply ?? 'Done.';
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
    if (notionReady()) {
      const tasks = await notion.getTasks();
      return res.json(tasks);
    }
    res.json(await todoist.getTasks());
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
    const { title, date, duration = 60, description = '' } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'title and date are required' });
    const event = await calendar.createEvent(title, date, Number(duration), description);
    res.json(event);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/prs',              async (req, res) => { try { res.json(await github.getOpenPRs())      } catch(e){ res.status(500).json({error:e.message}) }});
app.get('/api/github/merged',   async (req, res) => { try { res.json(await github.getMergedPRs())    } catch(e){ res.status(500).json({error:e.message}) }});
app.get('/api/github/changelog',async (req, res) => {
  try {
    const changelog = await github.generateChangelog();
    res.json({ changelog });
  } catch(e){ res.status(500).json({error:e.message}) }
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

// ─── Action endpoints ─────────────────────────────────────────────────────────

function invalidateEmailCache() { _emailCache = null; _emailCacheAt = 0; }

app.post('/api/email/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'valid "to" email required' });
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });
    res.json(await gmail.sendEmail(to, subject ?? '(no subject)', body));
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/email/archive', async (req, res) => { try { invalidateEmailCache(); res.json(await gmail.archiveEmail(req.body.id))          } catch(e){ res.status(500).json({error:e.message}) }});
app.post('/api/email/approve-draft', async (req, res) => {
  try {
    const { to, subject, original, edited } = req.body;
    invalidateEmailCache();
    const sent = await gmail.sendEmail(to, subject, edited);
    memory.recordApprovedDraft(original, edited, 'email');
    res.json(sent);
  } catch(e) { res.status(500).json({error:e.message}) }
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
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
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
      notion.getTasks(),
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
