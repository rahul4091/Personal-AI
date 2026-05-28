// server/services/llm.js
// LangChain-powered LLM router.
//   Gemini 2.0 Flash (large context)  → @langchain/google-genai
//   Groq Llama 3.1 8B  (fast triage)   → @langchain/groq
// Provider selection is task-based; cross-provider failover uses LangChain's
// native .withFallbacks(). Public function signatures are unchanged so every
// existing caller (index.js, gmail.js, content.js, calendar.js) keeps working.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// Task type → preferred provider (the other becomes the fallback)
const TASK_ROUTING = {
  digest:    'gemini',
  brief:     'gemini',
  content:   'gemini',
  changelog: 'gemini',
  readme:    'gemini',
  research:  'gemini',
  data:      'gemini',
  chat:      'groq',
  triage:    'groq',
  classify:  'groq',
  blocker:   'gemini',
  intent:    'groq',
  alert:     'groq',
};

const MODELS = {
  gemini: 'gemini-2.0-flash',
  groq:   'llama-3.1-8b-instant',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveKey(provider, apiKeys = {}) {
  if (provider === 'gemini') return apiKeys.GEMINI_API_KEY || process.env.GEMINI_API_KEY || null;
  if (provider === 'groq')   return apiKeys.GROQ_API_KEY   || process.env.GROQ_API_KEY   || null;
  return null;
}

function buildModel(provider, apiKey, maxTokens, streaming) {
  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({
      model: MODELS.gemini, apiKey, maxOutputTokens: maxTokens, streaming,
    });
  }
  return new ChatGroq({
    model: MODELS.groq, apiKey, maxTokens, streaming,
  });
}

// Build a runnable for a task: preferred provider first, the other as fallback.
// Skips any provider without a key. Throws MISSING_API_KEY if none configured.
function buildChain(taskType, { maxTokens, apiKeys, streaming = false }) {
  const provider = TASK_ROUTING[taskType] ?? 'gemini';
  const order    = [provider, ...['gemini', 'groq'].filter(p => p !== provider)];

  const models = order
    .map(p => ({ p, key: resolveKey(p, apiKeys) }))
    .filter(x => x.key)
    .map(x => ({ p: x.p, model: buildModel(x.p, x.key, maxTokens, streaming) }));

  if (!models.length) {
    const err = new Error('No LLM API key configured — set GEMINI_API_KEY or GROQ_API_KEY (or add one in Settings)');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  console.log(`[llm] ${taskType} → ${models.map(m => m.p).join(' → ')}`);

  const [primary, ...rest] = models.map(m => m.model);
  return rest.length ? primary.withFallbacks({ fallbacks: rest }) : primary;
}

// Convert our { role, content } messages into LangChain message instances.
function toLC(messages) {
  return messages.map(m => {
    if (m.role === 'system') return new SystemMessage(m.content);
    if (m.role === 'assistant' || m.role === 'ai') return new AIMessage(m.content);
    return new HumanMessage(m.content);
  });
}

function textOf(content) {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function parseJSON(raw, provider = 'llm') {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    throw new Error(`[${provider}] invalid JSON in response: ${raw.slice(0, 120)}`);
  }
}

// ─── Public API (unchanged signatures) ───────────────────────────────────────

export async function call(messages, options = {}) {
  const {
    taskType  = 'chat',
    json      = false,
    maxTokens = 500,
    apiKeys   = {},
  } = options;

  const chain = buildChain(taskType, { maxTokens, apiKeys });
  const res   = await chain.invoke(toLC(messages), { runName: `llm:${taskType}`, tags: ['devos', taskType] });
  const out   = textOf(res.content);
  return json ? parseJSON(out, taskType) : out;
}

// Backwards-compatible simple chat helper
export async function chat(userMessage, systemPrompt = 'You are a helpful personal AI assistant.') {
  return call(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
    { taskType: 'chat' }
  );
}

const INTENT_GUIDE = `
Intent guide — pick the single closest match per action:
- add_task: add/create a task or to-do item
- update_task: mark a task done/in-progress/complete
- get_tasks: list, show or check tasks
- create_note: save/add/create a note, idea, or piece of writing to Notion
- get_notes: list or show notes
- draft_email: compose/write/draft an email (do NOT send)
- send_email: send an email immediately
- get_emails: show/check inbox or emails
- create_event: schedule/add/create a calendar event or meeting
- get_calendar: show/check upcoming events or schedule
- create_issue: file/create/open a GitHub issue or bug report
- get_issues: list/show GitHub issues
- get_prs: show/check pull requests
- get_trello: show/check Trello cards or board
- run_digest: run or trigger the full morning/daily digest briefing
- draft_linkedin: write/draft a LinkedIn post from a source article or topic
- save_memory: remember/save a personal fact or preference
- general_chat: anything that does not clearly match the intents above
`.trim();

// classify() — returns structured JSON matching the schema
export async function classify(text, schema, apiKeys = {}) {
  return call(
    [
      { role: 'system', content: `JSON only. Omit null/empty params.\n${INTENT_GUIDE}\nSchema:\n${schema}` },
      { role: 'user',   content: text },
    ],
    { taskType: 'classify', json: true, maxTokens: 800, apiKeys }
  );
}

// generate() — summary / content generation
export async function generate(prompt, context = '', taskType = 'digest', apiKeys = {}) {
  return call(
    [
      { role: 'system', content: 'Be concise and accurate.' },
      ...(context ? [{ role: 'user', content: `Context:\n${context}` }] : []),
      { role: 'user', content: prompt },
    ],
    { taskType, maxTokens: 600, apiKeys }
  );
}

// Streaming call — yields text tokens via async generator (LangChain .stream()).
export async function* streamTokens(messages, options = {}) {
  const { taskType = 'chat', maxTokens = 600, apiKeys = {} } = options;
  const chain  = buildChain(taskType, { maxTokens, apiKeys, streaming: true });
  const stream = await chain.stream(toLC(messages), { runName: `llm:${taskType}`, tags: ['devos', taskType] });
  for await (const chunk of stream) {
    const t = chunk?.content;
    if (typeof t === 'string' && t) yield t;
  }
}

export default { call, chat, classify, generate, streamTokens };
