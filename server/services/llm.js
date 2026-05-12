// server/services/llm.js
// Smart LLM router — Gemini 2.5 Flash (large context)
//                     Groq Llama 3.3 70B (fast triage)
//                     Ollama (offline fallback)

import OpenAI from 'openai';

// Task type → provider routing
// Gemini handles everything — better free-tier RPM and structured JSON output
// Groq is the fast fallback
const TASK_ROUTING = {
  digest:    'gemini',
  brief:     'gemini',
  content:   'gemini',
  changelog: 'gemini',
  readme:    'gemini',
  research:  'gemini',
  data:      'gemini',
  chat:      'gemini',
  triage:    'gemini',
  classify:  'gemini',
  blocker:   'gemini',
  intent:    'gemini',
  alert:     'gemini',
};

const MODELS = {
  gemini: 'gemini-1.5-flash',      // 1,500 req/day free vs 250 for 2.5-flash
  groq:   'llama-3.1-8b-instant',  // 20,000 req/day free vs 6,000 for 70b
  ollama: 'llama3.2',
};

// Clients are created lazily so the server starts even when API keys are missing
const _clients = {};

function getClient(provider) {
  if (!_clients[provider]) {
    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        const err = new Error('GEMINI_API_KEY is not set in .env');
        err.code = 'MISSING_API_KEY';
        throw err;
      }
      _clients.gemini = new OpenAI({
        apiKey:  process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
    } else if (provider === 'groq') {
      if (!process.env.GROQ_API_KEY) {
        const err = new Error('GROQ_API_KEY is not set in .env');
        err.code = 'MISSING_API_KEY';
        throw err;
      }
      _clients.groq = new OpenAI({
        apiKey:  process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    } else {
      _clients.ollama = new OpenAI({
        apiKey:  'ollama',
        baseURL: process.env.OLLAMA_ENDPOINT
          ? `${process.env.OLLAMA_ENDPOINT}/v1`
          : 'http://localhost:11434/v1',
      });
    }
  }
  return _clients[provider];
}

async function callProvider(provider, params, json) {
  const client = getClient(provider);
  const res    = await client.chat.completions.create({ ...params, model: MODELS[provider] });
  const c      = res.choices[0].message.content;
  if (json) return JSON.parse(c.replace(/```json\n?|\n?```/g, '').trim());
  return c;
}

export async function call(messages, options = {}) {
  const {
    taskType  = 'chat',
    json      = false,
    tools     = null,
    maxTokens = 500,
  } = options;

  const provider = TASK_ROUTING[taskType] ?? 'gemini';

  const params = {
    messages,
    max_tokens: maxTokens,
    ...(json  && { response_format: { type: 'json_object' } }),
    ...(tools && { tools, tool_choice: 'auto' }),
  };

  // Ollama only included if it's configured/installed
  const hasOllama = process.env.OLLAMA_ENDPOINT || false;
  const fallbackChain = hasOllama ? ['gemini', 'groq', 'ollama'] : ['gemini', 'groq'];

  let lastErr;
  for (const p of fallbackChain) {
    try {
      console.log(`[llm] ${taskType} → ${p} (${MODELS[p]})`);
      return await callProvider(p, params, json);
    } catch (err) {
      const errCode      = err.code ?? err.cause?.code;
      const rateLimited  = err.status === 429;
      const offline      = errCode === 'ECONNREFUSED' || errCode === 'ENOTFOUND';
      const missingKey   = errCode === 'MISSING_API_KEY';
      if (!rateLimited && !offline && !missingKey) throw err;

      if (rateLimited) {
        const match  = err.message.match(/try again in (\d+(?:\.\d+)?)\s*(ms|s)/i);
        const waitMs = match ? (match[2] === 'ms' ? parseFloat(match[1]) : parseFloat(match[1]) * 1000) : null;

        // Only retry the same provider when the API told us exactly how long to wait AND it's short
        if (waitMs !== null && waitMs <= 10000) {
          console.warn(`[llm] ${p} rate-limited — waiting ${Math.ceil(waitMs)}ms then retrying`);
          await new Promise(r => setTimeout(r, waitMs + 300));
          try {
            return await callProvider(p, params, json);
          } catch (retryErr) {
            const retryCode = retryErr.code ?? retryErr.cause?.code;
            if (retryErr.status !== 429 && retryCode !== 'ECONNREFUSED') throw retryErr;
            lastErr = retryErr;
          }
        } else {
          // No specific wait time or wait is too long — fall through to next provider immediately
          console.warn(`[llm] ${p} rate-limited → falling through to next provider`);
          lastErr = err;
        }
        continue;
      }

      console.warn(`[llm] ${p} unavailable (${err.message}) → trying next provider`);
      lastErr = err;
    }
  }

  console.error('[llm] all providers failed:', lastErr?.message);
  throw lastErr;
}

// Backwards-compatible chat() — same signature as old ollama.js
export async function chat(userMessage, systemPrompt = 'You are a helpful personal AI assistant.') {
  return call(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
    { taskType: 'chat' }
  );
}

// classify() — returns structured JSON matching schema
export async function classify(text, schema) {
  return call(
    [
      { role: 'system', content: `JSON only. Schema:\n${schema}` },
      { role: 'user',   content: text },
    ],
    { taskType: 'classify', json: true, maxTokens: 300 }
  );
}

// generate() — summary/content generation
export async function generate(prompt, context = '', taskType = 'digest') {
  return call(
    [
      { role: 'system', content: 'Be concise and accurate.' },
      ...(context ? [{ role: 'user', content: `Context:\n${context}` }] : []),
      { role: 'user', content: prompt },
    ],
    { taskType, maxTokens: 600 }
  );
}

export default { call, chat, classify, generate };
