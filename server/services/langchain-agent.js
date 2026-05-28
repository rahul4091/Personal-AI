// server/services/langchain-agent.js
// Parallel LangChain agent path (Steps 3–5 of the migration).
//   Step 3 — every action is a LangChain `tool` (Zod-typed) that delegates to
//            the existing executeAction(), so there is no logic duplication.
//   Step 4 — createAgent() (LangChain v1, LangGraph-based) does the
//            classify → call-tool → respond loop automatically.
//   Step 5 — prior turns are passed in as messages for conversational memory.
//
// This module is self-contained and does NOT touch the live /api/chat route.
// It is exposed via /api/chat/agent so it can be tried side-by-side.

import { createAgent, tool, HumanMessage, AIMessage } from 'langchain';
import { ChatGroq } from '@langchain/groq';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';

// Prefer Groq's 70B (reliable tool calling); fall back to Gemini.
// Notes that matter for tool calling:
//   • the 8B model mangles tool-call syntax — use 70B-versatile
//   • temperature 0 stops Llama from leaking the built-in <function=…> text format
function pickModel(apiKeys = {}) {
  const groqKey = apiKeys.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (groqKey) return new ChatGroq({ model: 'llama-3.3-70b-versatile', apiKey: groqKey, maxTokens: 800, temperature: 0 });

  const geminiKey = apiKeys.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) return new ChatGoogleGenerativeAI({ model: 'gemini-2.0-flash', apiKey: geminiKey, maxOutputTokens: 800, temperature: 0 });

  const err = new Error('No LLM API key configured — add a Groq or Gemini key in Settings.');
  err.code = 'MISSING_API_KEY';
  throw err;
}

// Build the tool set, closing over the per-request executeAction + creds + user.
function buildTools({ executeAction, message, creds, userId }) {
  const mk = (name, description, schema, intent) =>
    tool(
      async (input) => {
        const result = await executeAction(intent, input ?? {}, message, creds, userId);
        return JSON.stringify(result ?? { ok: true });
      },
      { name, description, schema }
    );

  // Llama tool calling breaks on empty schemas, so "no-arg" tools take a harmless optional field.
  const noParams = z.object({ note: z.string().optional().describe('leave empty — no input needed') });

  return [
    mk('get_tasks', "List the user's open tasks (Notion + Todoist).",
      z.object({ filter: z.string().optional().describe('optional, e.g. "today" or "overdue"') }), 'get_tasks'),
    mk('add_task', 'Create a new task / to-do item.',
      z.object({ title: z.string().describe('the task text') }), 'add_task'),
    mk('update_task', 'Update a task — mark done/in-progress or rename it.',
      z.object({ taskId: z.string(), status: z.string().optional(), title: z.string().optional() }), 'update_task'),

    mk('get_calendar', 'Show upcoming calendar events.', noParams, 'get_calendar'),
    mk('create_event', 'Create a calendar event.',
      z.object({
        title: z.string(),
        date: z.string().describe('ISO datetime, format YYYY-MM-DDTHH:MM'),
        duration: z.number().optional().describe('minutes, default 60'),
      }), 'create_event'),
    mk('scan_conflicts', 'Scan the calendar for scheduling conflicts.', noParams, 'scan_conflicts'),

    mk('get_emails', 'Check the inbox — triage the latest emails by priority.', noParams, 'get_emails'),
    mk('draft_email', 'Draft an email (saves a draft, does NOT send).',
      z.object({ to: z.string(), title: z.string().optional().describe('subject'), body: z.string() }), 'draft_email'),

    mk('get_prs', 'Show open GitHub pull requests (and stale ones).',
      z.object({ repo: z.string().optional() }), 'get_prs'),
    mk('get_issues', 'List open GitHub issues.',
      z.object({ repo: z.string().optional() }), 'get_issues'),
    mk('create_issue', 'Create a GitHub issue (body is auto-drafted).',
      z.object({ title: z.string(), repo: z.string().optional() }), 'create_issue'),

    mk('get_trello', 'Show Trello cards and stale cards.', noParams, 'get_trello'),

    mk('get_notes', 'List the most recent Notion notes.', noParams, 'get_notes'),
    mk('create_note', 'Save a note to Notion.',
      z.object({ title: z.string(), body: z.string().optional() }), 'create_note'),

    mk('run_digest', 'Run the full daily digest in the background.', noParams, 'run_digest'),
    mk('get_digest', "Get today's already-generated digest.", noParams, 'get_digest'),

    mk('draft_linkedin', 'Draft a LinkedIn post from a source article or topic.',
      z.object({ source: z.string().describe('article text, URL, or topic') }), 'draft_linkedin'),

    mk('save_memory', 'Remember a personal fact or preference for later.',
      z.object({ memKey: z.string(), memValue: z.string() }), 'save_memory'),
  ];
}

const SYSTEM_PROMPT = (connectedTools, memContext) =>
  `You are DevOS, a personal AI command-centre agent. ` +
  `Today is ${new Date().toDateString()}. Connected tools: ${connectedTools || 'none yet'}. ` +
  `Use the available tools to fetch real data or perform actions — never invent events, tasks, emails, PRs, or names. ` +
  `If a tool returns an empty list, say so plainly. Keep replies concise and direct.` +
  (memContext ? ` User context: ${memContext}` : '');

const WINDOW = 6; // full messages kept per turn

// Per-user rolling summaries (in-memory; survives the session, cleared on restart).
// Key: userId string  Value: summary string
const rollingMemory = new Map();

/**
 * Build the message list for the agent using a rolling summary window.
 *
 * Pattern:
 *   [summary of everything older than last WINDOW messages]
 *   + [last WINDOW messages verbatim]
 *   + [current user message]
 *
 * Every call that has overflow (history.length > WINDOW) re-summarises the
 * overflow together with any existing summary, so older context is always
 * compressed rather than dropped.
 */
async function buildContext(history, userId, model) {
  if (history.length <= WINDOW) {
    return history.map(m =>
      (m.role === 'assistant' || m.role === 'ai') ? new AIMessage(m.content) : new HumanMessage(m.content)
    );
  }

  const overflow = history.slice(0, -WINDOW);   // older — compress these
  const recent   = history.slice(-WINDOW);       // last 6 — keep verbatim

  const prevSummary = rollingMemory.get(String(userId)) ?? '';

  // Build the text block to summarise
  const block = [
    prevSummary && `Previous summary:\n${prevSummary}`,
    overflow
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content).slice(0, 400)}`)
      .join('\n'),
  ].filter(Boolean).join('\n\n---\n\n');

  let summary = prevSummary;
  try {
    const res = await model.invoke([
      new HumanMessage(
        `Summarise the following conversation in 2–3 sentences, preserving key facts, decisions, and user preferences. Be concise:\n\n${block}`
      ),
    ]);
    summary = typeof res.content === 'string' ? res.content : prevSummary;
    rollingMemory.set(String(userId), summary);
  } catch {
    // keep the previous summary on failure — don't crash the agent
  }

  const msgs = [];
  if (summary) {
    // Inject summary as a fake exchange so the agent treats it as prior context
    msgs.push(new HumanMessage(`[Conversation summary so far: ${summary}]`));
    msgs.push(new AIMessage('Understood — I have the context from our earlier conversation.'));
  }
  msgs.push(...recent.map(m =>
    (m.role === 'assistant' || m.role === 'ai') ? new AIMessage(m.content) : new HumanMessage(m.content)
  ));
  return msgs;
}

/**
 * Run one turn through the LangChain agent.
 * @returns {{ reply: string, toolsUsed: string[] }}
 */
export async function runAgent({ message, history = [], creds = {}, userId, executeAction, connectedTools = '', memContext = '' }) {
  const apiKeys = { GEMINI_API_KEY: creds.GEMINI_API_KEY, GROQ_API_KEY: creds.GROQ_API_KEY };
  const model   = pickModel(apiKeys);
  const tools   = buildTools({ executeAction, message, creds, userId });

  const agent = createAgent({ model, tools, prompt: SYSTEM_PROMPT(connectedTools, memContext) });

  const contextMsgs = await buildContext(history, userId, model);
  const messages    = [...contextMsgs, new HumanMessage(message)];

  const result = await agent.invoke(
    { messages },
    { runName: 'devos-agent', tags: ['devos', 'agent'], metadata: { userId: String(userId ?? 'anon') } }
  );
  const msgs     = result.messages ?? [];
  const last     = msgs[msgs.length - 1];
  const reply    = last ? (typeof last.content === 'string' ? last.content : JSON.stringify(last.content)) : '';
  const toolsUsed = msgs.flatMap(m => (m.tool_calls ?? []).map(tc => tc.name));

  return { reply, toolsUsed };
}

/** Clear the rolling summary for a user (called when they hit "Clear" in the chat). */
export function clearMemory(userId) {
  rollingMemory.delete(String(userId));
}

export default { runAgent };
