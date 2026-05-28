// server/services/tracing.js
// LangSmith tracing setup. Imported FIRST in index.js so the env vars are
// normalized before any LangChain module loads.
//
// Turn it on by adding ONE line to .env:
//     LANGSMITH_API_KEY=lsv2_...   (get it at https://smith.langchain.com → Settings → API Keys)
// Everything else (tracing flag, project name, endpoint) is defaulted here.
// Once set, every LangChain call — chat models, classify, the agent — is traced
// automatically with zero extra code. Remove the key to turn it off.

const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY || null;

if (apiKey) {
  const project  = process.env.LANGSMITH_PROJECT  || process.env.LANGCHAIN_PROJECT  || 'devos';
  const endpoint = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';

  // Set both the new (LANGSMITH_*) and legacy (LANGCHAIN_*) names so the SDK
  // picks it up regardless of version.
  process.env.LANGSMITH_API_KEY    = apiKey;
  process.env.LANGCHAIN_API_KEY    = apiKey;
  process.env.LANGSMITH_TRACING    = 'true';
  process.env.LANGCHAIN_TRACING_V2 = 'true';
  process.env.LANGSMITH_PROJECT    = project;
  process.env.LANGCHAIN_PROJECT    = project;
  process.env.LANGSMITH_ENDPOINT   = endpoint;

  console.log(`[tracing] LangSmith ENABLED → project "${project}"`);
} else {
  console.log('[tracing] LangSmith disabled (set LANGSMITH_API_KEY in .env to enable)');
}

export function tracingStatus() {
  return {
    enabled: !!(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY) &&
             (process.env.LANGSMITH_TRACING === 'true' || process.env.LANGCHAIN_TRACING_V2 === 'true'),
    project: process.env.LANGSMITH_PROJECT || process.env.LANGCHAIN_PROJECT || null,
  };
}

export default { tracingStatus };
