import { useState, useEffect } from 'react';
import { apiFetch } from './api.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const DOT_COLORS = {
  gemini:   '#4285F4',
  groq:     '#F55036',
  google:   '#34A853',
  notion:   '#000',
  github:   '#24292f',
  trello:   '#0052CC',
  slack:    '#611f69',
  linkedin: '#0A66C2',
};

// ─── Reusable sub-components ──────────────────────────────────────────────────

function SectionHeader({ label, tag }) {
  const tagColors = {
    required:    { bg: '#FDECEA', color: '#B71C1C' },
    recommended: { bg: '#E8F5E9', color: '#1B5E20' },
    optional:    { bg: '#EDE7F6', color: '#311B92' },
  };
  const tc = tagColors[tag] ?? tagColors.optional;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 12px' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 7px', borderRadius: 99, background: tc.bg, color: tc.color }}>
        {tag}
      </span>
    </div>
  );
}

function StatusBadge({ connected }) {
  return connected
    ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} /> Connected
      </span>
    : null;
}

function MaskedKey({ hint, updatedAt }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <code style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 4 }}>
        {hint}
      </code>
      {updatedAt && (
        <span style={{ fontSize: 11, color: 'var(--hint)' }}>Saved {timeAgo(updatedAt)}</span>
      )}
    </div>
  );
}

function FieldGroup({ label, hint, linkText, linkHref, value, onChange, placeholder = '••••••••••••••••', type = 'password' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{label}</div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.5 }}>
          {hint}{linkText && linkHref && <> — <a href={linkHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{linkText}</a></>}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '7px 10px',
          fontSize: 13, color: 'var(--text)', fontFamily: 'monospace',
        }}
      />
    </div>
  );
}

function TestButton({ onTest, testing, label = 'Test connection' }) {
  return (
    <button
      className="primary"
      onClick={onTest}
      disabled={testing}
      style={{ padding: '8px 18px', fontSize: 13, opacity: testing ? 0.7 : 1 }}
    >
      {testing ? 'Testing…' : label}
    </button>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--error)', background: 'var(--tag-error-bg, #fdecea)', padding: '6px 10px', borderRadius: 'var(--radius)', lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

// ─── Single-key card (Gemini, Groq) ──────────────────────────────────────────

function SingleKeyCard({ service, label, description, linkText, linkHref, keyName, fieldLabel, fieldHint, saved, testing, onTest, onDisconnect, error }) {
  const [value, setValue] = useState('');
  const keyMeta = saved?.[service]?.[keyName];
  const connected = !!keyMeta;

  return (
    <div style={{
      border: `1px solid ${connected ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      background: 'var(--surface)',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: connected ? 8 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS[service], flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        </div>
        <StatusBadge connected={connected} />
      </div>

      {!connected && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>{description}</p>
      )}

      {connected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <MaskedKey hint={keyMeta.keyHint} updatedAt={keyMeta.updatedAt} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onDisconnect(service)} style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px' }}>
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <>
          <FieldGroup
            label={fieldLabel}
            hint={fieldHint}
            linkText={linkText}
            linkHref={linkHref}
            value={value}
            onChange={setValue}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TestButton onTest={() => onTest(service, value)} testing={testing === service} />
          </div>
          <ErrorMsg msg={error} />
        </>
      )}
    </div>
  );
}

// ─── Multi-field card (Notion, GitHub, Trello, Slack, LinkedIn) ───────────────

function MultiKeyCard({ service, label, description, fields: fieldDefs, saved, testing, onTest, onDisconnect, error, primaryKey }) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState({});

  const keyMeta = saved?.[service]?.[primaryKey];
  const connected = !!keyMeta;

  function setField(key, val) {
    setValues(v => ({ ...v, [key]: val }));
  }

  return (
    <div style={{
      border: `1px solid ${connected ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      background: 'var(--surface)',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS[service], flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
            {!connected && !expanded && (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0', lineHeight: 1.4 }}>{description}</p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {connected && <StatusBadge connected />}
          {!connected && (
            <button
              onClick={() => setExpanded(e => !e)}
              className={expanded ? '' : 'primary'}
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              {expanded ? 'Cancel' : 'Add'}
            </button>
          )}
        </div>
      </div>

      {connected && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <MaskedKey hint={keyMeta.keyHint} updatedAt={keyMeta.updatedAt} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onDisconnect(service)} style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px' }}>
              Disconnect
            </button>
            <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 12, padding: '4px 10px' }}>
              {expanded ? 'Cancel' : 'Reconnect'}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {fieldDefs.map(f => (
            <FieldGroup
              key={f.key}
              label={f.label}
              hint={f.hint}
              linkText={f.linkText}
              linkHref={f.linkHref}
              value={values[f.key] ?? ''}
              onChange={val => setField(f.key, val)}
              placeholder={f.placeholder}
              type={f.type ?? 'password'}
            />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TestButton
              onTest={() => onTest(service, values)}
              testing={testing === service}
            />
          </div>
          <ErrorMsg msg={error} />
        </div>
      )}
    </div>
  );
}

// ─── Google card ──────────────────────────────────────────────────────────────

function GoogleCard({ connected, email, onConnect }) {
  return (
    <div style={{
      border: `1px solid ${connected ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS.google, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Google</span>
        </div>
        {connected && <StatusBadge connected />}
      </div>

      {connected ? (
        <>
          {email && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
              Connected as <strong style={{ color: 'var(--text)' }}>{email}</strong>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/api/auth/google?from=settings">
              <button style={{ fontSize: 12, padding: '5px 12px' }}>Reconnect</button>
            </a>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Connects Gmail triage, email drafting, calendar management, and conflict detection. All in one OAuth flow.
          </p>
          <a href="/api/auth/google?from=settings" style={{ textDecoration: 'none' }}>
            <button className="primary" style={{ padding: '9px 20px', fontSize: 13 }}>
              Connect Gmail &amp; Calendar
            </button>
          </a>
        </>
      )}
    </div>
  );
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ user, onLogout }) {
  const [email, setEmail]           = useState(user.email || '');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass]         = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [deletePass, setDeletePass]   = useState('');
  const [showDelete, setShowDelete]   = useState(false);
  const [status, setStatus]           = useState(null);
  const [saving, setSaving]           = useState(false);

  async function saveEmail() {
    setSaving('email');
    setStatus(null);
    const r = await apiFetch('/api/users/me/email', { method: 'PUT', body: JSON.stringify({ email }) });
    const d = await r.json();
    setSaving(false);
    setStatus(d.ok ? { type: 'success', msg: 'Email updated.' } : { type: 'error', msg: d.error });
  }

  async function changePassword() {
    if (newPass !== confirmPass) return setStatus({ type: 'error', msg: 'Passwords do not match' });
    setSaving('password');
    setStatus(null);
    const r = await apiFetch('/api/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
      setStatus({ type: 'success', msg: 'Password changed.' });
    } else {
      setStatus({ type: 'error', msg: d.error });
    }
  }

  async function deleteAccount() {
    const r = await apiFetch('/api/users/me', { method: 'DELETE', body: JSON.stringify({ password: deletePass }) });
    const d = await r.json();
    if (d.ok) {
      localStorage.removeItem('devos_token');
      window.location.href = '/';
    } else {
      setStatus({ type: 'error', msg: d.error });
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '7px 10px',
    fontSize: 13, color: 'var(--text)',
  };
  const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Email */}
        <div>
          <label style={labelStyle}>Email address</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              className="primary"
              onClick={saveEmail}
              disabled={saving === 'email'}
              style={{ padding: '7px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {saving === 'email' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Password */}
        <div>
          <label style={labelStyle}>Change password</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} placeholder="Current password" style={inputStyle} />
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="New password (min 8 chars)" style={inputStyle} />
            <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirm new password" style={inputStyle} />
            <button
              className="primary"
              onClick={changePassword}
              disabled={!currentPass || !newPass || saving === 'password'}
              style={{ padding: '7px 14px', fontSize: 12, alignSelf: 'flex-start' }}
            >
              {saving === 'password' ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </div>

        {status && (
          <div style={{
            fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius)', lineHeight: 1.5,
            color: status.type === 'success' ? 'var(--success)' : 'var(--error)',
            background: status.type === 'success' ? 'var(--tag-success-bg)' : 'var(--tag-error-bg, #fdecea)',
          }}>
            {status.msg}
          </div>
        )}

        {/* Danger zone */}
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--error)', marginBottom: 6 }}>Danger zone</div>
          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              style={{ fontSize: 12, color: 'var(--error)', padding: '5px 12px', border: '1px solid var(--error)', borderRadius: 'var(--radius)', background: 'transparent' }}
            >
              Delete account
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                This will permanently delete your account and all stored keys. Enter your password to confirm.
              </p>
              <input
                type="password"
                value={deletePass}
                onChange={e => setDeletePass(e.target.value)}
                placeholder="Your password"
                style={{ ...inputStyle, borderColor: 'var(--error)' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={deleteAccount}
                  disabled={!deletePass}
                  style={{ fontSize: 12, color: '#fff', background: 'var(--error)', padding: '5px 12px', border: 'none', borderRadius: 'var(--radius)' }}
                >
                  Delete my account
                </button>
                <button onClick={() => setShowDelete(false)} style={{ fontSize: 12, padding: '5px 12px' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────

export default function SettingsPage({ user, onLogout }) {
  const [saved,   setSaved]   = useState({});
  const [testing, setTesting] = useState(null);
  const [errors,  setErrors]  = useState({});
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail,     setGoogleEmail]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSaved();
    loadGoogleStatus();

    // After returning from Google OAuth via settings
    if (window.location.search.includes('google_connected=true')) {
      window.history.replaceState({}, '', '/settings');
      loadGoogleStatus();
    }
  }, []);

  async function loadSaved() {
    try {
      const r = await apiFetch('/api/integrations');
      if (r.ok) setSaved(await r.json());
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleStatus() {
    const r = await fetch('/api/auth/google/email');
    if (!r.ok) return;
    const d = await r.json();
    setGoogleConnected(d.connected);
    setGoogleEmail(d.email);
  }

  async function testAndSave(service, payload) {
    setTesting(service);
    setErrors(e => ({ ...e, [service]: null }));
    try {
      const r = await apiFetch(`/api/credentials/test/${service}`, {
        method: 'POST',
        body:   JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok) {
        await loadSaved();
      } else {
        setErrors(e => ({ ...e, [service]: d.error || 'Test failed' }));
      }
    } catch (err) {
      setErrors(e => ({ ...e, [service]: err.message }));
    } finally {
      setTesting(null);
    }
  }

  async function disconnect(service) {
    await apiFetch(`/api/integrations/${service}`, { method: 'DELETE' });
    await loadSaved();
  }

  const aiMissing = !saved.gemini?.GEMINI_API_KEY && !saved.groq?.GROQ_API_KEY;

  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--hint)', fontSize: 'var(--fs-base)' }}>Loading…</div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Settings</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
        Your API keys are encrypted and stored securely. They are never logged.
      </p>

      {aiMissing && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 'var(--radius)',
          background: '#FFF3E0',
          border: '1px solid #FFB74D',
          fontSize: 12,
          color: '#E65100',
          lineHeight: 1.5,
        }}>
          <strong>AI engine not configured.</strong> Add a Gemini or Groq API key to use the chat and agent features.
        </div>
      )}

      {/* Section 1 — AI Engine */}
      <SectionHeader label="AI Engine" tag="required" />
      <SingleKeyCard
        service="gemini"
        label="Gemini"
        description="Powers the agent, email triage, calendar summaries, and content generation."
        linkText="Get key at aistudio.google.com"
        linkHref="https://aistudio.google.com/apikey"
        keyName="GEMINI_API_KEY"
        fieldLabel="Gemini API key"
        fieldHint="Go to Google AI Studio → Get API key → Create API key"
        saved={saved}
        testing={testing}
        onTest={(svc, key) => testAndSave(svc, { key })}
        onDisconnect={disconnect}
        error={errors.gemini}
      />
      <SingleKeyCard
        service="groq"
        label="Groq"
        description="Fast inference fallback — used when Gemini is rate-limited."
        linkText="Get key at console.groq.com"
        linkHref="https://console.groq.com/keys"
        keyName="GROQ_API_KEY"
        fieldLabel="Groq API key"
        fieldHint="Go to Groq Console → API Keys → Create API Key"
        saved={saved}
        testing={testing}
        onTest={(svc, key) => testAndSave(svc, { key })}
        onDisconnect={disconnect}
        error={errors.groq}
      />

      {/* Section 2 — Google */}
      <SectionHeader label="Google" tag="required" />
      <GoogleCard
        connected={googleConnected}
        email={googleEmail}
      />

      {/* Section 3 — Productivity */}
      <SectionHeader label="Productivity tools" tag="recommended" />

      <MultiKeyCard
        service="notion"
        label="Notion"
        description="Task and notes database. Create, list, and update tasks and notes via the agent."
        primaryKey="NOTION_API_KEY"
        saved={saved}
        testing={testing}
        onTest={(svc, vals) => testAndSave(svc, { apiKey: vals.apiKey, taskDbId: vals.taskDbId, notesDbId: vals.notesDbId })}
        onDisconnect={disconnect}
        error={errors.notion}
        fields={[
          {
            key: 'apiKey',
            label: 'Notion Integration Secret',
            hint: 'Go to notion.so/my-integrations → New integration → copy the secret (starts with secret_ntn_)',
            linkText: 'Open integrations',
            linkHref: 'https://www.notion.so/my-integrations',
            placeholder: 'secret_ntn_…',
          },
          {
            key: 'taskDbId',
            label: 'Tasks Database ID',
            hint: 'Open your Tasks database in Notion → copy the 32-char ID from the URL (between last / and ?)',
            placeholder: '32-character database ID (optional)',
          },
          {
            key: 'notesDbId',
            label: 'Notes Database ID',
            hint: 'Same process — open your Notes database and copy the ID from the URL',
            placeholder: '32-character database ID (optional)',
          },
        ]}
      />

      <MultiKeyCard
        service="github"
        label="GitHub"
        description="PRs, issues, and code activity. Create issues, track stale PRs, and generate changelogs."
        primaryKey="GITHUB_TOKEN"
        saved={saved}
        testing={testing}
        onTest={(svc, vals) => testAndSave(svc, { token: vals.token, owner: vals.owner, repo: vals.repo })}
        onDisconnect={disconnect}
        error={errors.github}
        fields={[
          {
            key: 'token',
            label: 'Personal Access Token',
            hint: 'GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic) with repo scope',
            linkText: 'Generate token',
            linkHref: 'https://github.com/settings/tokens',
            placeholder: 'ghp_…',
          },
          {
            key: 'owner',
            label: 'GitHub username / org',
            hint: 'Your GitHub username or organisation name',
            placeholder: 'your-username',
            type: 'text',
          },
          {
            key: 'repo',
            label: 'Repository name',
            hint: 'The repo to use by default (just the name, not the full URL)',
            placeholder: 'my-repo',
            type: 'text',
          },
        ]}
      />

      <MultiKeyCard
        service="trello"
        label="Trello"
        description="Board cards and stale card scan. Track work in progress and surface blockers."
        primaryKey="TRELLO_API_KEY"
        saved={saved}
        testing={testing}
        onTest={(svc, vals) => testAndSave(svc, { apiKey: vals.apiKey, token: vals.token, boardId: vals.boardId })}
        onDisconnect={disconnect}
        error={errors.trello}
        fields={[
          {
            key: 'apiKey',
            label: 'Trello API Key',
            hint: 'Go to trello.com/app-key — your key is shown at the top',
            linkText: 'Get API key',
            linkHref: 'https://trello.com/app-key',
            placeholder: 'API key…',
          },
          {
            key: 'token',
            label: 'Trello Token',
            hint: 'On the same page, click "generate a token" to get your token',
            placeholder: 'Token…',
          },
          {
            key: 'boardId',
            label: 'Board ID',
            hint: 'Open your board in Trello → copy the short ID from the URL (e.g. trello.com/b/XXXXXXXX)',
            placeholder: 'Board short ID (optional)',
            type: 'text',
          },
        ]}
      />

      {/* Section 4 — Delivery channels */}
      <SectionHeader label="Delivery channels" tag="optional" />

      <MultiKeyCard
        service="slack"
        label="Slack"
        description="Team alerts and daily digests. The agent sends digest summaries and stale PR alerts to your Slack."
        primaryKey="SLACK_BOT_TOKEN"
        saved={saved}
        testing={testing}
        onTest={(svc, vals) => testAndSave(svc, { botToken: vals.botToken, userId: vals.userId })}
        onDisconnect={disconnect}
        error={errors.slack}
        fields={[
          {
            key: 'botToken',
            label: 'Bot Token',
            hint: 'Create a Slack app at api.slack.com/apps → OAuth & Permissions → install to workspace → copy Bot User OAuth Token',
            linkText: 'Slack API console',
            linkHref: 'https://api.slack.com/apps',
            placeholder: 'xoxb-…',
          },
          {
            key: 'userId',
            label: 'Your Slack User ID',
            hint: 'In Slack → click your name → View full profile → Copy member ID',
            placeholder: 'U…',
            type: 'text',
          },
        ]}
      />

      <MultiKeyCard
        service="linkedin"
        label="LinkedIn"
        description="Post LinkedIn content via a Make.com webhook. The agent drafts posts from your recent activity."
        primaryKey="LINKEDIN_WEBHOOK_URL"
        saved={saved}
        testing={testing}
        onTest={(svc, vals) => testAndSave(svc, { webhookUrl: vals.webhookUrl })}
        onDisconnect={disconnect}
        error={errors.linkedin}
        fields={[
          {
            key: 'webhookUrl',
            label: 'Make.com Webhook URL',
            hint: 'Create a webhook scenario in Make.com that posts to LinkedIn, then paste the webhook URL here',
            linkText: 'Open Make.com',
            linkHref: 'https://www.make.com',
            placeholder: 'https://hook.make.com/…',
            type: 'text',
          },
        ]}
      />

      {/* Account section */}
      <SectionHeader label="Account" tag="optional" />
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        background: 'var(--surface)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Signed in as <strong style={{ color: 'var(--text)' }}>{user.username}</strong>
        </div>
        <AccountSection user={user} />
      </div>

      {/* Sign out */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <button
          onClick={onLogout}
          style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 14px' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
