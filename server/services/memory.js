// server/services/memory.js
// Persistent memory store — survives server restarts
// Stored in server/memory.json (gitignored)

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH   = path.join(__dirname, '..', 'memory.json');

const DEFAULT_MEMORY = {
  vipContacts:       [],
  facts:             [],      // freeform facts the agent remembers: [{key, value, savedAt}]
  voiceProfile: {
    tone:            'professional but friendly',
    sentenceLength:  'medium',
    openingStyle:    'direct',
    avoidPhrases:    [],
    approvedDrafts:  [],
  },
  projectPriorities: [],
  preferences: {
    workingHours:    { start: 9, end: 18 },
    digestTime:      '09:00',
    focusBlockMin:   90,
    stalenessThresholdPR:    3,
    stalenessThresholdCard:  5,
    maxLinkedInPostsPerWeek: 3,
  },
};

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(MEMORY_PATH)) {
      _cache = { ...DEFAULT_MEMORY, ...JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8')) };
      return _cache;
    }
  } catch {}
  _cache = { ...DEFAULT_MEMORY };
  return _cache;
}

function save(memory) {
  _cache = memory;
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2));
}

export function getMemory() {
  return load();
}

export function addVIP(email, name = '') {
  const mem = load();
  if (!mem.vipContacts.find(v => v.email === email)) {
    mem.vipContacts.push({ email, name, addedAt: new Date().toISOString() });
    save(mem);
  }
  return mem.vipContacts;
}

export function removeVIP(email) {
  const mem = load();
  mem.vipContacts = mem.vipContacts.filter(v => v.email !== email);
  save(mem);
  return mem.vipContacts;
}

export function recordApprovedDraft(original, edited, type = 'email') {
  const mem = load();
  mem.voiceProfile.approvedDrafts.push({
    type,
    original: original.slice(0, 300),
    edited:   edited.slice(0, 300),
    at:       new Date().toISOString(),
  });
  // Keep last 50 approved drafts as training signal
  if (mem.voiceProfile.approvedDrafts.length > 50) {
    mem.voiceProfile.approvedDrafts = mem.voiceProfile.approvedDrafts.slice(-50);
  }
  save(mem);
}

export function setProjectPriorities(priorities = []) {
  const mem = load();
  mem.projectPriorities = priorities;
  save(mem);
  return priorities;
}

export function updatePreferences(prefs = {}) {
  const mem = load();
  mem.preferences = { ...mem.preferences, ...prefs };
  save(mem);
  return mem.preferences;
}

// Save an arbitrary fact the user tells the agent ("I work at Acme", "My stack is React")
export function saveFact(key, value) {
  const mem = load();
  if (!mem.facts) mem.facts = [];
  const existing = mem.facts.findIndex(f => f.key.toLowerCase() === key.toLowerCase());
  const entry = { key, value, savedAt: new Date().toISOString() };
  if (existing >= 0) mem.facts[existing] = entry;
  else mem.facts.push(entry);
  // Keep last 100 facts
  if (mem.facts.length > 100) mem.facts = mem.facts.slice(-100);
  save(mem);
  return mem.facts;
}

// Build a compact context string injected into the agent's system prompt
export function buildContextSummary() {
  const mem = load();
  const lines = [];
  if (mem.facts?.length)            lines.push('Facts: ' + mem.facts.map(f => `${f.key}=${f.value}`).join('; '));
  if (mem.vipContacts?.length)      lines.push('VIPs: ' + mem.vipContacts.map(v => v.email).join(', '));
  if (mem.projectPriorities?.length) lines.push('Priorities: ' + mem.projectPriorities.join(', '));
  return lines.join(' | ');
}

export function isVIP(emailAddress) {
  const mem = load();
  return mem.vipContacts.some(v =>
    emailAddress.toLowerCase().includes(v.email.toLowerCase())
  );
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export function logActivity(intent, params = {}, status = 'success', error = null) {
  const mem = load();
  if (!mem.activityLog) mem.activityLog = [];

  const { title, to, repo, date, days, time, startDate, endDate } = params;
  const slim = Object.fromEntries(
    Object.entries({ title, to, repo, date, days, time, startDate, endDate })
      .filter(([, v]) => v != null)
  );

  mem.activityLog.push({
    at:     new Date().toISOString(),
    intent,
    params: slim,
    status,
    ...(error ? { error } : {}),
  });

  if (mem.activityLog.length > 500) mem.activityLog = mem.activityLog.slice(-500);
  save(mem);
}

export function getActivityLog(limit = 50) {
  const mem = load();
  return (mem.activityLog ?? []).slice(-limit).reverse();
}

export default {
  getMemory,
  addVIP,
  removeVIP,
  recordApprovedDraft,
  setProjectPriorities,
  updatePreferences,
  isVIP,
  saveFact,
  buildContextSummary,
  logActivity,
  getActivityLog,
};
