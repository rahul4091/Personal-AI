import { useState, useEffect } from 'react';
import { apiFetch } from './api.js';

const STEPS = [
  { id: 'welcome',      title: 'Welcome to DevOS' },
  { id: 'google',       title: 'Connect Google' },
  { id: 'dev-tools',    title: 'Dev tools' },
  { id: 'productivity', title: 'Productivity tools' },
  { id: 'ai-keys',      title: 'AI engine' },
  { id: 'done',         title: "You're all set!" },
];

export default function OnboardingWizard({ user, onComplete }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('connected') === 'true') {
      window.history.replaceState({}, '', '/');
      setStep(2); // after Google, go to dev tools
    }
  }, []);

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  function next() {
    if (isLast) onComplete();
    else setStep(s => s + 1);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px',
    }}>
      <div style={{
        width: 520, padding: '36px 40px',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: 'var(--border-hairline)',
        boxShadow: 'var(--shadow-2)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.25s',
            }} />
          ))}
        </div>

        {current.id === 'welcome'      && <WelcomeStep      username={user.username} onNext={next} />}
        {current.id === 'google'       && <GoogleStep        onNext={next} />}
        {current.id === 'dev-tools'    && <DevToolsStep      onNext={next} />}
        {current.id === 'productivity' && <ProductivityStep  onNext={next} />}
        {current.id === 'ai-keys'      && <AIKeysStep        onNext={next} />}
        {current.id === 'done'         && <DoneStep          onComplete={onComplete} />}
      </div>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function StepLabel({ n, of: total }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
      Step {n} of {total}
    </span>
  );
}

function Field({ label, hint, value, onChange, placeholder, type = 'password', linkText, linkHref }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</label>
        {linkText && (
          <a href={linkHref} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
            {linkText} ↗
          </a>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '8px 10px', fontSize: 13,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', color: 'var(--text)', outline: 'none',
        }}
      />
      {hint && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const ok = status === 'ok';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
      borderRadius: 'var(--radius-sm)', marginBottom: 14,
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      fontSize: 12, color: ok ? '#166534' : '#991b1b',
    }}>
      {ok ? '✓ Connected' : '✗ ' + status}
    </div>
  );
}

function ServiceCard({ title, icon, connected, children }) {
  return (
    <div style={{
      border: `1px solid ${connected ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 12,
      background: connected ? 'rgba(29,158,117,0.04)' : 'var(--bg)',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: connected ? 0 : 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        {connected && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>✓ Connected</span>}
      </div>
      {!connected && children}
    </div>
  );
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function WelcomeStep({ username, onNext }) {
  const features = [
    'Triage emails and draft replies with AI',
    'Manage your calendar and detect conflicts',
    'Track tasks across Notion, Todoist, and GitHub',
    'Get a daily digest of everything that matters',
  ];
  return (
    <>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>
        Welcome, {username}!
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 20px' }}>
        DevOS is your personal AI command centre. Let's connect your tools — takes about 3 minutes.
      </p>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 28 }}>
        {features.map(f => (
          <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
            color: 'var(--text-muted)', padding: '4px 0' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span> {f}
          </div>
        ))}
      </div>
      <button className="primary" onClick={onNext} style={{ width: '100%', padding: '11px 16px', fontSize: 14 }}>
        Let's get started →
      </button>
    </>
  );
}

// ─── Step 2: Google ───────────────────────────────────────────────────────────

function GoogleStep({ onNext }) {
  return (
    <>
      <StepLabel n={1} of={4} />
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Connect Google</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, margin: '0 0 16px' }}>
        Unlocks Gmail triage, calendar management, and conflict detection.
      </p>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 24 }}>
        {['Read and triage your inbox by priority', 'Draft and send emails via the agent',
          'Schedule and reschedule calendar events', 'Detect scheduling conflicts automatically'].map(item => (
          <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center',
            fontSize: 13, color: 'var(--text-muted)', padding: '3px 0' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span> {item}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="primary" style={{ width: '100%', padding: '11px 16px', fontSize: 14 }}
          onClick={async () => {
            try {
              const r = await apiFetch('/api/auth/google/init');
              if (!r.ok) { if (r.status === 401) { localStorage.removeItem('devos_token'); window.location.reload(); } return; }
              const d = await r.json();
              if (d.url) window.location.href = d.url;
            } catch { /* network error */ }
          }}>
          Connect Gmail &amp; Calendar
        </button>
        <button onClick={onNext} style={{ width: '100%', padding: '9px 16px', color: 'var(--text-muted)',
          background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}>
          Skip for now
        </button>
      </div>
    </>
  );
}

// ─── Step 3: Dev tools ────────────────────────────────────────────────────────

function DevToolsStep({ onNext }) {
  const [gh,      setGh]      = useState({ token: '', owner: '', repo: '' });
  const [slack,   setSlack]   = useState({ botToken: '', userId: '' });
  const [ghSt,    setGhSt]    = useState(null);
  const [slackSt, setSlackSt] = useState(null);
  const [saving,  setSaving]  = useState(null);

  async function testGitHub() {
    if (!gh.token || !gh.owner) return;
    setSaving('github'); setGhSt(null);
    try {
      const r = await apiFetch('/api/credentials/test/github', { method: 'POST',
        body: JSON.stringify({ token: gh.token, owner: gh.owner, repo: gh.repo }) });
      const d = await r.json();
      setGhSt(d.ok ? 'ok' : d.error ?? 'Failed');
    } catch (e) { setGhSt(e.message); }
    setSaving(null);
  }

  async function testSlack() {
    if (!slack.botToken) return;
    setSaving('slack'); setSlackSt(null);
    try {
      const r = await apiFetch('/api/credentials/test/slack', { method: 'POST',
        body: JSON.stringify({ botToken: slack.botToken, userId: slack.userId }) });
      const d = await r.json();
      setSlackSt(d.ok ? 'ok' : d.error ?? 'Failed');
    } catch (e) { setSlackSt(e.message); }
    setSaving(null);
  }

  return (
    <>
      <StepLabel n={2} of={4} />
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Dev tools</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>
        Connect GitHub and Slack — or skip and add them later in Settings.
      </p>

      <ServiceCard title="GitHub" icon="🐙" connected={ghSt === 'ok'}>
        <Field label="Personal Access Token" value={gh.token} onChange={v => setGh(g => ({ ...g, token: v }))}
          placeholder="ghp_… or github_pat_…"
          linkText="Generate token" linkHref="https://github.com/settings/tokens" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Field label="Username / org" type="text" value={gh.owner}
              onChange={v => setGh(g => ({ ...g, owner: v }))} placeholder="your-username" />
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Default repo (optional)" type="text" value={gh.repo}
              onChange={v => setGh(g => ({ ...g, repo: v }))} placeholder="my-repo" />
          </div>
        </div>
        {ghSt && ghSt !== 'ok' && <StatusBadge status={ghSt} />}
        <button onClick={testGitHub} disabled={!gh.token || !gh.owner || saving === 'github'}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            cursor: gh.token && gh.owner ? 'pointer' : 'default', opacity: gh.token && gh.owner ? 1 : 0.5 }}>
          {saving === 'github' ? 'Connecting…' : 'Connect GitHub'}
        </button>
      </ServiceCard>

      <ServiceCard title="Slack" icon="💬" connected={slackSt === 'ok'}>
        <Field label="Bot Token" value={slack.botToken} onChange={v => setSlack(s => ({ ...s, botToken: v }))}
          placeholder="xoxb-…"
          linkText="Create Slack app" linkHref="https://api.slack.com/apps" />
        <Field label="Your Slack User ID (optional)" type="text" value={slack.userId}
          onChange={v => setSlack(s => ({ ...s, userId: v }))}
          placeholder="U0123456789"
          hint="Slack → your profile → ⋯ → Copy member ID" />
        {slackSt && slackSt !== 'ok' && <StatusBadge status={slackSt} />}
        <button onClick={testSlack} disabled={!slack.botToken || saving === 'slack'}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            cursor: slack.botToken ? 'pointer' : 'default', opacity: slack.botToken ? 1 : 0.5 }}>
          {saving === 'slack' ? 'Connecting…' : 'Connect Slack'}
        </button>
      </ServiceCard>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="primary" onClick={onNext}
          style={{ flex: 1, padding: '10px 16px', fontSize: 13 }}>
          Continue →
        </button>
      </div>
      <button onClick={onNext} style={{ width: '100%', marginTop: 8, padding: '7px', fontSize: 12,
        color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Skip all dev tools
      </button>
    </>
  );
}

// ─── Step 4: Productivity tools ───────────────────────────────────────────────

function ProductivityStep({ onNext }) {
  const [notion,  setNotion]  = useState({ apiKey: '', notesDbId: '' });
  const [todoist, setTodoist] = useState('');
  const [notionSt,  setNotionSt]  = useState(null);
  const [todoistSt, setTodoistSt] = useState(null);
  const [saving, setSaving] = useState(null);

  async function testNotion() {
    if (!notion.apiKey) return;
    setSaving('notion'); setNotionSt(null);
    try {
      const r = await apiFetch('/api/credentials/test/notion', { method: 'POST',
        body: JSON.stringify({ apiKey: notion.apiKey, notesDbId: notion.notesDbId }) });
      const d = await r.json();
      setNotionSt(d.ok ? 'ok' : d.error ?? 'Failed');
    } catch (e) { setNotionSt(e.message); }
    setSaving(null);
  }

  async function testTodoist() {
    if (!todoist) return;
    setSaving('todoist'); setTodoistSt(null);
    try {
      const r = await apiFetch('/api/credentials/test/todoist', { method: 'POST',
        body: JSON.stringify({ key: todoist }) });
      const d = await r.json();
      setTodoistSt(d.ok ? 'ok' : d.error ?? 'Failed');
    } catch (e) { setTodoistSt(e.message); }
    setSaving(null);
  }

  return (
    <>
      <StepLabel n={3} of={4} />
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Productivity tools</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>
        Connect Notion and Todoist for task and note management.
      </p>

      <ServiceCard title="Notion" icon="📝" connected={notionSt === 'ok'}>
        <Field label="Integration Secret" value={notion.apiKey} onChange={v => setNotion(n => ({ ...n, apiKey: v }))}
          placeholder="ntn_… or secret_ntn_…"
          linkText="Get token" linkHref="https://www.notion.so/profile/integrations" />
        <Field label="Notes Database ID (optional)" type="text" value={notion.notesDbId}
          onChange={v => setNotion(n => ({ ...n, notesDbId: v }))}
          placeholder="Paste the URL or 32-char ID from Notion"
          hint="Open database in Notion → share → copy link" />
        {notionSt && notionSt !== 'ok' && <StatusBadge status={notionSt} />}
        <button onClick={testNotion} disabled={!notion.apiKey || saving === 'notion'}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            cursor: notion.apiKey ? 'pointer' : 'default', opacity: notion.apiKey ? 1 : 0.5 }}>
          {saving === 'notion' ? 'Connecting…' : 'Connect Notion'}
        </button>
      </ServiceCard>

      <ServiceCard title="Todoist" icon="✅" connected={todoistSt === 'ok'}>
        <Field label="API Token" value={todoist} onChange={setTodoist}
          placeholder="Todoist API token"
          linkText="Get token" linkHref="https://app.todoist.com/app/settings/integrations/developer" />
        {todoistSt && todoistSt !== 'ok' && <StatusBadge status={todoistSt} />}
        <button onClick={testTodoist} disabled={!todoist || saving === 'todoist'}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            cursor: todoist ? 'pointer' : 'default', opacity: todoist ? 1 : 0.5 }}>
          {saving === 'todoist' ? 'Connecting…' : 'Connect Todoist'}
        </button>
      </ServiceCard>

      <button className="primary" onClick={onNext}
        style={{ width: '100%', padding: '10px 16px', fontSize: 13, marginTop: 4 }}>
        Continue →
      </button>
      <button onClick={onNext} style={{ width: '100%', marginTop: 8, padding: '7px', fontSize: 12,
        color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Skip productivity tools
      </button>
    </>
  );
}

// ─── Step 5: AI keys ──────────────────────────────────────────────────────────

function AIKeysStep({ onNext }) {
  const [gemini,   setGemini]   = useState('');
  const [groq,     setGroq]     = useState('');
  const [geminiSt, setGeminiSt] = useState(null);
  const [groqSt,   setGroqSt]   = useState(null);
  const [saving,   setSaving]   = useState(null);

  const anyConnected = geminiSt === 'ok' || groqSt === 'ok';

  async function testGemini() {
    if (!gemini) return;
    setSaving('gemini'); setGeminiSt(null);
    try {
      const r = await apiFetch('/api/credentials/test/gemini', { method: 'POST',
        body: JSON.stringify({ key: gemini }) });
      const d = await r.json();
      setGeminiSt(d.ok ? 'ok' : d.error ?? 'Failed');
    } catch (e) { setGeminiSt(e.message); }
    setSaving(null);
  }

  async function testGroq() {
    if (!groq) return;
    setSaving('groq'); setGroqSt(null);
    try {
      const r = await apiFetch('/api/credentials/test/groq', { method: 'POST',
        body: JSON.stringify({ key: groq }) });
      const d = await r.json();
      setGroqSt(d.ok ? 'ok' : d.error ?? 'Failed');
    } catch (e) { setGroqSt(e.message); }
    setSaving(null);
  }

  return (
    <>
      <StepLabel n={4} of={4} />
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>AI engine</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: '0 0 6px' }}>
        DevOS needs at least one AI key for chat and digest to work.
        Both are free to start — add either one.
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 20px' }}>
        Don't have one yet? The app will use a shared key with limited capacity until you add your own.
      </p>

      <ServiceCard title="Gemini (recommended)" icon="✦" connected={geminiSt === 'ok'}>
        <Field label="Gemini API Key" value={gemini} onChange={setGemini}
          placeholder="AIzaSy…"
          linkText="Get free key" linkHref="https://aistudio.google.com/app/apikey"
          hint="Google AI Studio → Create API key — free tier is generous" />
        {geminiSt && geminiSt !== 'ok' && <StatusBadge status={geminiSt} />}
        <button onClick={testGemini} disabled={!gemini || saving === 'gemini'}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            cursor: gemini ? 'pointer' : 'default', opacity: gemini ? 1 : 0.5 }}>
          {saving === 'gemini' ? 'Verifying…' : 'Save Gemini key'}
        </button>
      </ServiceCard>

      <ServiceCard title="Groq" icon="⚡" connected={groqSt === 'ok'}>
        <Field label="Groq API Key" value={groq} onChange={setGroq}
          placeholder="gsk_…"
          linkText="Get free key" linkHref="https://console.groq.com/keys"
          hint="Groq Console → API Keys → Create — very fast inference" />
        {groqSt && groqSt !== 'ok' && <StatusBadge status={groqSt} />}
        <button onClick={testGroq} disabled={!groq || saving === 'groq'}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            cursor: groq ? 'pointer' : 'default', opacity: groq ? 1 : 0.5 }}>
          {saving === 'groq' ? 'Verifying…' : 'Save Groq key'}
        </button>
      </ServiceCard>

      <button className="primary" onClick={onNext}
        style={{ width: '100%', padding: '10px 16px', fontSize: 13, marginTop: 4 }}>
        {anyConnected ? 'Continue →' : 'Skip — use shared key'}
      </button>
    </>
  );
}

// ─── Step 6: Done ─────────────────────────────────────────────────────────────

function DoneStep({ onComplete }) {
  return (
    <>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: '#f0fdf4', color: '#16a34a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, marginBottom: 20,
      }}>
        ✓
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>You're all set!</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 10px' }}>
        Your workspace is ready. You can add or change any integration any time from Settings.
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 28px' }}>
        The agent is standing by — try asking it <em>"What's on my plate today?"</em>
      </p>
      <button className="primary" onClick={onComplete}
        style={{ width: '100%', padding: '11px 16px', fontSize: 14 }}>
        Go to dashboard →
      </button>
    </>
  );
}
