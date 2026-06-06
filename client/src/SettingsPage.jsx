import { useState, useEffect } from 'react';
import { apiFetch } from './api.js';

function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function ServiceIcon({ service }) {
  const s = { display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (service === 'google') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
  if (service === 'gemini') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <path fill="#4285F4" d="M12 2 9.1 9.1 2 12l7.1 2.9L12 22l2.9-7.1L22 12l-7.1-2.9z"/>
    </svg>
  );
  if (service === 'groq') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <circle cx="12" cy="12" r="10" fill="#F55036"/>
      <text x="7" y="17" fontSize="13" fontWeight="bold" fill="white">G</text>
    </svg>
  );
  if (service === 'notion') return (
    <svg width="18" height="18" viewBox="0 0 100 100" style={s}>
      <rect width="100" height="100" rx="12" fill="white"/>
      <path d="M12 12 h50 l24 24 v52 H12 z" fill="white" stroke="#e5e5e5" strokeWidth="4"/>
      <path d="M26 30 L26 72 M26 30 L58 70 M58 30 L58 72" stroke="#1a1a1a" strokeWidth="8" strokeLinecap="round" fill="none"/>
    </svg>
  );
  if (service === 'github') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#24292f" style={s}>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  );
  if (service === 'slack') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <path fill="#E01E5A" d="M5.04 15.17a2.52 2.52 0 0 1-2.52 2.52A2.52 2.52 0 0 1 0 15.17a2.52 2.52 0 0 1 2.52-2.52h2.52v2.52zM6.3 15.17a2.52 2.52 0 0 1 2.52-2.52 2.52 2.52 0 0 1 2.52 2.52v6.3A2.52 2.52 0 0 1 8.82 24a2.52 2.52 0 0 1-2.52-2.52v-6.3zM8.82 5.04a2.52 2.52 0 0 1-2.52-2.52A2.52 2.52 0 0 1 8.82 0a2.52 2.52 0 0 1 2.52 2.52v2.52H8.82zM8.82 6.3a2.52 2.52 0 0 1 2.52 2.52 2.52 2.52 0 0 1-2.52 2.52H2.52A2.52 2.52 0 0 1 0 8.82a2.52 2.52 0 0 1 2.52-2.52h6.3zM18.96 8.82a2.52 2.52 0 0 1 2.52-2.52A2.52 2.52 0 0 1 24 8.82a2.52 2.52 0 0 1-2.52 2.52h-2.52V8.82zM17.7 8.82a2.52 2.52 0 0 1-2.52 2.52 2.52 2.52 0 0 1-2.52-2.52V2.52A2.52 2.52 0 0 1 15.18 0a2.52 2.52 0 0 1 2.52 2.52v6.3zM15.18 18.96a2.52 2.52 0 0 1 2.52 2.52A2.52 2.52 0 0 1 15.18 24a2.52 2.52 0 0 1-2.52-2.52v-2.52h2.52zM15.18 17.7a2.52 2.52 0 0 1-2.52-2.52 2.52 2.52 0 0 1 2.52-2.52h6.3A2.52 2.52 0 0 1 24 15.18a2.52 2.52 0 0 1-2.52 2.52h-6.3z"/>
    </svg>
  );
  if (service === 'todoist') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <circle cx="12" cy="12" r="11" fill="#DB4035"/>
      <path d="M7 12l3.5 3.5L17 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
  if (service === 'trello') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <rect width="24" height="24" rx="5" fill="#0052CC"/>
      <rect x="3.5" y="4" width="6.5" height="12" rx="1.5" fill="white"/>
      <rect x="14" y="4" width="6.5" height="8.5" rx="1.5" fill="white"/>
    </svg>
  );
  if (service === 'linkedin') return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={s}>
      <rect width="24" height="24" rx="4" fill="#0A66C2"/>
      <path fill="white" d="M7.2 9.6h2.4V17H7.2V9.6zM8.4 8.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zM11.6 9.6h2.3v1h.03A2.6 2.6 0 0 1 16.3 9.4c2.4 0 2.9 1.6 2.9 3.7V17h-2.4v-3.4c0-.8 0-1.9-1.16-1.9-1.17 0-1.34.9-1.34 1.84V17h-2.4V9.6z"/>
    </svg>
  );
  // fallback
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#aaa' }} />;
}

const TAG_STYLES = {
  required:    { background: '#FDECEA', color: '#B71C1C' },
  recommended: { background: '#E8F5E9', color: '#1B5E20' },
  optional:    { background: '#EDE7F6', color: '#311B92' },
};

function SectionLabel({ label, tag }) {
  const tc = TAG_STYLES[tag] ?? TAG_STYLES.optional;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '32px 0 10px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 7px', borderRadius: 99, ...tc }}>
        {tag}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function IntegrationGroup({ children }) {
  return (
    <div style={{
      background: '#fff',
      border: '1.5px solid rgba(0,0,0,0.1)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {children}
    </div>
  );
}

// Action button — green ✓ when connected, + when not, × when the panel is open
function ToggleBtn({ expanded, onClick, connected }) {
  // Colors per state
  const bg     = expanded ? 'var(--text)' : connected ? '#E8F5E9' : '#fff';
  const border = expanded ? 'transparent' : connected ? '#86c997' : 'rgba(0,0,0,0.18)';
  const color  = expanded ? '#fff' : connected ? '#1B7A33' : '#555';

  return (
    <button
      onClick={onClick}
      title={expanded ? 'Close' : connected ? 'Manage connection' : 'Connect'}
      style={{
        width: 28, height: 28, padding: 0, flexShrink: 0,
        border: `1.5px solid ${border}`,
        borderRadius: 7,
        background: bg,
        color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: expanded ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      {expanded ? (
        // × close
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      ) : connected ? (
        // ✓ connected
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
      ) : (
        // + add
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      )}
    </button>
  );
}

function IntegrationRow({ service, label, connected, keyHint, children, actionSlot }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px' }}>
        {/* Brand icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: '#fff', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        }}>
          <ServiceIcon service={service} />
        </div>

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500, fontSize: 13.5, color: 'var(--text)' }}>{label}</span>
            {connected && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#1B7A33', background: '#E8F5E9', padding: '1px 8px', borderRadius: 99, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1B7A33' }} />
                Connected
              </span>
            )}
          </div>
        </div>

        {actionSlot}
      </div>

      {children && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', padding: '16px 18px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function RowDivider() {
  return <div style={{ height: 1, background: 'rgba(0,0,0,0.07)' }} />;
}

// Floating modal dialog — matches Image #12
function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.28)',
      }} />
      {/* Dialog */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: '94vw', maxHeight: '90vh',
        background: 'var(--bg)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{title}</span>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: 6, padding: 0,
            border: '1px solid var(--border)', background: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', padding: '20px 20px 28px', flex: 1 }}>
          {children}
        </div>
      </div>
    </>
  );
}

function FieldGroup({ label, hint, linkText, linkHref, value, onChange, placeholder = '••••••••••••••••', type = 'password', required = true }) {
  const [show, setShow] = useState(false);
  const isSecret = type === 'password';

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Label with required marker */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </div>
      {/* Input */}
      <div style={{ position: 'relative' }}>
        <input
          type={isSecret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ fontFamily: isSecret ? 'monospace' : 'inherit', paddingRight: isSecret ? 36 : undefined, width: '100%', boxSizing: 'border-box' }}
          autoComplete={isSecret ? 'one-time-code' : 'off'}
        />
        {isSecret && (
          <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--hint)', display: 'flex', alignItems: 'center' }}
            aria-label={show ? 'Hide' : 'Show'}>
            {show ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        )}
      </div>
      {/* Hint BELOW the input — matches Image #6 */}
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
          {hint}
          {linkText && linkHref && (
            <> — <a href={linkHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{linkText}</a></>
          )}
        </div>
      )}
    </div>
  );
}

const CREDENTIALS_TITLES = {
  slack:    'OAuth2 Credentials',
  notion:   'Integration Credentials',
  github:   'Access Token',
  linkedin: 'Webhook Configuration',
  trello:   'API Credentials',
  todoist:  'API Credentials',
  gemini:   'API Credentials',
  groq:     'API Credentials',
  google:   'Google Credentials',
};

// Expanded panel layout matching Image #11
function SetupPanel({ service, label, description, setupLinkLabel, setupLinkHref, credentialsTitle, credentialsSubtitle, children, onDisconnect, connected, testing, onSave, error, warning, extraActions }) {
  return (
    <div>
      {/* ── Section 1: Setup Documentation ── */}
      {/* ── Link row only — no header text above it (matches Image #11) ── */}
      {setupLinkHref && (
        <a href={setupLinkHref} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block', marginBottom: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 14px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          }}>
            <ServiceIcon service={service} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              {setupLinkLabel ?? `${label} Setup`}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15,3 21,3 21,9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </div>
        </a>
      )}

      {/* ── Credentials section ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
          {credentialsTitle ?? CREDENTIALS_TITLES[service] ?? `${label} Credentials`}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          {credentialsSubtitle ?? `Enter your ${label} authentication details`}
        </p>
        {children}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="primary" onClick={onSave} disabled={testing}
          style={{ padding: '7px 16px', fontSize: 13 }}>
          {testing ? 'Testing…' : 'Save & test'}
        </button>
        {extraActions}
        {connected && onDisconnect && (
          <button onClick={onDisconnect}
            style={{ fontSize: 12, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            Disconnect
          </button>
        )}
      </div>
      <ErrorMsg msg={error} />
      <WarnMsg msg={warning} />
    </div>
  );
}

function WarnMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: '#7c4a00', background: '#fff8e1', padding: '7px 10px', borderRadius: 6, lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: '#B71C1C', background: '#FDECEA', padding: '7px 10px', borderRadius: 6, lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

// ─── Single-key integration row (Gemini, Groq) ────────────────────────────────

function SingleKeyRow({ service, label, description, linkText, linkHref, keyName, fieldLabel, fieldHint, saved, testing, onTest, onDisconnect, error, warning }) {
  const [value, setValue] = useState('');
  const [expanded, setExpanded] = useState(false);
  const keyMeta = saved?.[service]?.[keyName];
  const connected = !!keyMeta;

  async function handleTest() {
    const ok = await onTest(service, value);
    if (ok) { setExpanded(false); setValue(''); }
  }

  return (
    <>
      <IntegrationRow
        service={service} label={label} connected={connected}
        keyHint={keyMeta?.keyHint}
        actionSlot={<ToggleBtn expanded={expanded} connected={connected} onClick={() => setExpanded(e => !e)} />}
      />
      <Modal open={expanded} onClose={() => setExpanded(false)} title={`${label} Configuration`}>
        <SetupPanel
          service={service} label={label}
          description={description}
          setupLinkLabel={`${label} ${fieldLabel} Setup`}
          setupLinkHref={linkHref}
          connected={connected}
          testing={testing === service}
          onSave={handleTest}
          onDisconnect={connected && onDisconnect ? () => { onDisconnect(service); setExpanded(false); } : null}
          error={error}
          warning={warning}
        >
          <FieldGroup label={fieldLabel} hint={fieldHint} value={value} onChange={setValue} />
        </SetupPanel>
      </Modal>
    </>
  );
}

// ─── Multi-key integration row (Notion, GitHub, Trello, Slack, LinkedIn) ──────

function MultiKeyRow({ service, label, description, fields: fieldDefs, saved, testing, onTest, onForceSave, onDisconnect, error, primaryKey }) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState({});
  const keyMeta = saved?.[service]?.[primaryKey];
  const connected = !!keyMeta;

  function setField(key, val) { setValues(v => ({ ...v, [key]: val })); }

  async function handleTest() {
    const ok = await onTest(service, values);
    if (ok) { setExpanded(false); setValues({}); }
  }

  async function handleForceSave() {
    const ok = await onForceSave?.(service, values);
    if (ok) { setExpanded(false); setValues({}); }
  }

  const primaryField = fieldDefs[0];
  const hasValues = Object.values(values).some(v => v?.trim());

  return (
    <>
      <IntegrationRow
        service={service} label={label} connected={connected}
        keyHint={keyMeta?.keyHint}
        actionSlot={<ToggleBtn expanded={expanded} connected={connected} onClick={() => setExpanded(e => !e)} />}
      />
      <Modal open={expanded} onClose={() => setExpanded(false)} title={`${label} Configuration`}>
        <SetupPanel
          service={service} label={label}
          description={description}
          setupLinkLabel={`${label} ${primaryField?.label ?? 'Credentials'} Setup`}
          setupLinkHref={primaryField?.linkHref}
          connected={connected}
          testing={testing === service}
          onSave={handleTest}
          onDisconnect={connected && onDisconnect ? () => { onDisconnect(service); setExpanded(false); } : null}
          error={error}
          extraActions={onForceSave && error && hasValues ? (
            <button onClick={handleForceSave} disabled={testing === service}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
              Save anyway
            </button>
          ) : null}
        >
          {fieldDefs.map(f => (
            <FieldGroup
              key={f.key} label={f.label} hint={f.hint}
              value={values[f.key] ?? ''}
              onChange={val => setField(f.key, val)}
              placeholder={f.placeholder}
              type={f.type ?? 'password'}
              required={f.type !== 'text' || f.key === fieldDefs[0].key}
            />
          ))}
        </SetupPanel>
      </Modal>
    </>
  );
}

// ─── Google row ───────────────────────────────────────────────────────────────

function GoogleRow({ connected, email, onConnect, error }) {
  return (
    <IntegrationRow
      service="google" label="Google"
      connected={connected} keyHint={email}
      actionSlot={
        <ToggleBtn expanded={false} connected={connected} onClick={onConnect} />
      }
    >
      {error && <ErrorMsg msg={error} />}
    </IntegrationRow>
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

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Profile row */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 16,
        }}>
          {user.username?.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>@{user.username}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Personal account</div>
        </div>
      </div>

      {/* Email */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>Email address</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ flex: 1 }}
          />
          <button
            className="primary"
            onClick={saveEmail}
            disabled={saving === 'email'}
            style={{ padding: '0 16px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {saving === 'email' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Password */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>Change password</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 400 }}>
          <input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} placeholder="Current password" />
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="New password (min 8 chars)" />
          <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirm new password" />
          <div style={{ marginTop: 4 }}>
            <button
              className="primary"
              onClick={changePassword}
              disabled={!currentPass || !newPass || saving === 'password'}
              style={{ padding: '7px 16px', fontSize: 13 }}
            >
              {saving === 'password' ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </div>
      </div>

      {status && (
        <div style={{
          margin: '0 20px 0', padding: '10px 14px',
          fontSize: 12, lineHeight: 1.5,
          color: status.type === 'success' ? '#1B5E20' : '#B71C1C',
          background: status.type === 'success' ? '#E8F5E9' : '#FDECEA',
          borderBottom: '1px solid var(--border)',
        }}>
          {status.msg}
        </div>
      )}

      {/* Danger zone */}
      <div style={{ padding: '16px 20px', background: 'var(--bg)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger)', marginBottom: 10 }}>
          Danger zone
        </div>
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            style={{ fontSize: 12, color: 'var(--danger)', padding: '5px 12px', border: '1px solid var(--danger)', borderRadius: 6, background: 'transparent' }}
          >
            Delete account
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              This will permanently delete your account and all stored keys. Enter your password to confirm.
            </p>
            <input
              type="password"
              value={deletePass}
              onChange={e => setDeletePass(e.target.value)}
              placeholder="Your password"
              style={{ borderColor: 'var(--danger)' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={deleteAccount}
                disabled={!deletePass}
                className="danger"
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                Delete my account
              </button>
              <button onClick={() => setShowDelete(false)} style={{ fontSize: 12, padding: '6px 14px' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsPage({ user, onLogout, health = {} }) {
  const [saved,        setSaved]        = useState({});
  const [testing,      setTesting]      = useState(null);
  const [errors,       setErrors]       = useState({});
  const [warnings,     setWarnings]     = useState({});
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail,     setGoogleEmail]     = useState(null);
  const [googleError,  setGoogleError]  = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [webhookInfo,  setWebhookInfo]  = useState(null);
  const [webhookCopied, setWebhookCopied] = useState(false);

  useEffect(() => {
    loadSaved();
    loadGoogleStatus();
    loadWebhookInfo();
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

  async function loadWebhookInfo() {
    try {
      const r = await apiFetch('/api/webhook/info');
      if (r.ok) setWebhookInfo(await r.json());
    } catch { /* ignore */ }
  }

  async function loadGoogleStatus() {
    const r = await apiFetch('/api/auth/google/email');
    if (!r.ok) return;
    const d = await r.json();
    setGoogleConnected(d.connected);
    setGoogleEmail(d.email);
  }

  async function handleGoogleConnect() {
    setGoogleError(null);
    try {
      const r = await apiFetch('/api/auth/google/init?from=settings');
      if (r.status === 401) {
        setGoogleError('Your session expired. Please sign out and sign back in, then try again.');
        return;
      }
      if (!r.ok) {
        setGoogleError('Could not start Google sign-in. Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in your .env file.');
        return;
      }
      const data = await r.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setGoogleError('Network error — is the server running?');
    }
  }

  async function testAndSave(service, payload) {
    setTesting(service);
    setErrors(e => ({ ...e, [service]: null }));
    setWarnings(w => ({ ...w, [service]: null }));
    try {
      const r = await apiFetch(`/api/credentials/test/${service}`, { method: 'POST', body: JSON.stringify(payload) });
      const d = await r.json();
      if (d.ok) {
        await loadSaved();
        if (d.warning) setWarnings(w => ({ ...w, [service]: d.warning }));
        return true;
      }
      setErrors(e => ({ ...e, [service]: d.error || 'Test failed' }));
    } catch (err) {
      setErrors(e => ({ ...e, [service]: err.message }));
    } finally {
      setTesting(null);
    }
    return false;
  }

  async function forceSaveNotion(service, payload) {
    setTesting(service);
    setErrors(e => ({ ...e, [service]: null }));
    setWarnings(w => ({ ...w, [service]: null }));
    try {
      const r = await apiFetch('/api/credentials/save/notion', { method: 'POST', body: JSON.stringify(payload) });
      const d = await r.json();
      if (d.ok) {
        await loadSaved();
        if (d.warning) setWarnings(w => ({ ...w, [service]: d.warning }));
        return true;
      }
      setErrors(e => ({ ...e, [service]: d.error || 'Save failed' }));
    } catch (err) {
      setErrors(e => ({ ...e, [service]: err.message }));
    } finally {
      setTesting(null);
    }
    return false;
  }

  async function disconnect(service) {
    await apiFetch(`/api/integrations/${service}`, { method: 'DELETE' });
    await loadSaved();
  }

  const hasOwnAiKey = !!(saved.gemini?.GEMINI_API_KEY || saved.groq?.GROQ_API_KEY);
  const hasSharedAiKey = !!(health.geminiShared || health.groqShared);
  const aiMissing = !hasOwnAiKey && !hasSharedAiKey;

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--hint)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 60 }}>
      {/* Page header */}
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          API keys are encrypted at rest and never logged.
        </p>
      </div>

      {aiMissing && (
        <div style={{
          marginTop: 16, padding: '10px 14px',
          borderRadius: 8, background: '#FFF8E1',
          border: '1px solid #FFCA28',
          fontSize: 12, color: '#6D4C00', lineHeight: 1.6,
        }}>
          <strong>No AI engine configured.</strong> Add a Gemini or Groq API key to enable the agent.
        </div>
      )}

      {hasSharedAiKey && !hasOwnAiKey && (
        <div style={{
          marginTop: 16, padding: '10px 14px',
          borderRadius: 8, background: 'var(--tag-success-bg)',
          border: '1px solid var(--success)',
          fontSize: 12, color: 'var(--success)', lineHeight: 1.6,
        }}>
          <strong>AI is ready.</strong> Shared workspace keys are active — you don't need to add your own unless you want a separate quota.
        </div>
      )}

      {/* AI Engine */}
      <SectionLabel label="AI Engine" tag={hasSharedAiKey && !hasOwnAiKey ? 'optional' : 'required'} />
      <IntegrationGroup>
        <SingleKeyRow
          service="gemini"
          label="Gemini"
          description={health.geminiShared && !saved.gemini?.GEMINI_API_KEY ? "Shared workspace key active. Add your own to use a separate quota." : "Powers the agent, email triage, calendar summaries, and content generation."}
          linkText="Get key"
          linkHref="https://aistudio.google.com/apikey"
          keyName="GEMINI_API_KEY"
          fieldLabel="Gemini API key"
          fieldHint="Google AI Studio → Get API key → Create API key"
          saved={saved} testing={testing}
          onTest={(svc, key) => testAndSave(svc, { key })}
          onDisconnect={disconnect}
          error={errors.gemini}
          warning={warnings.gemini}
        />
        <RowDivider />
        <SingleKeyRow
          service="groq"
          label="Groq"
          description={health.groqShared && !saved.groq?.GROQ_API_KEY ? "Shared workspace key active. Add your own to use a separate quota." : "Fast inference fallback — used when Gemini is rate-limited."}
          linkText="Get key"
          linkHref="https://console.groq.com/keys"
          keyName="GROQ_API_KEY"
          fieldLabel="Groq API key"
          fieldHint="Groq Console → API Keys → Create API Key"
          saved={saved} testing={testing}
          onTest={(svc, key) => testAndSave(svc, { key })}
          onDisconnect={disconnect}
          error={errors.groq}
        />
      </IntegrationGroup>

      {/* Google */}
      <SectionLabel label="Google" tag={googleConnected ? 'optional' : 'required'} />
      <IntegrationGroup>
        <GoogleRow
          connected={googleConnected}
          email={googleEmail}
          onConnect={handleGoogleConnect}
          error={googleError}
        />
      </IntegrationGroup>

      {/* Productivity tools */}
      <SectionLabel label="Productivity tools" tag="recommended" />
      <IntegrationGroup>
        <MultiKeyRow
          service="notion" label="Notion"
          description="Task and notes database. Create, list, and update tasks and notes via the agent."
          primaryKey="NOTION_API_KEY"
          saved={saved} testing={testing}
          onTest={(svc, v) => testAndSave(svc, { apiKey: v.apiKey, taskDbId: v.taskDbId, notesDbId: v.notesDbId })}
          onForceSave={(svc, v) => forceSaveNotion(svc, { apiKey: v.apiKey, taskDbId: v.taskDbId, notesDbId: v.notesDbId })}
          onDisconnect={disconnect} error={errors.notion} warning={warnings.notion}
          fields={[
            { key: 'apiKey',    label: 'Notion Integration Secret', hint: 'app.notion.com/developers/connections → copy the Access token', linkText: 'Open', linkHref: 'https://www.notion.so/profile/integrations', placeholder: 'ntn_… or secret_ntn_…' },
            { key: 'taskDbId',  label: 'Tasks Database ID',  hint: 'Open the database in Notion — paste the full URL or just the 32-char ID from it', placeholder: 'URL or 32-char ID (optional)', type: 'text' },
            { key: 'notesDbId', label: 'Notes Database ID',  hint: 'Open the database in Notion — paste the full URL or just the 32-char ID from it', placeholder: 'URL or 32-char ID (optional)', type: 'text' },
          ]}
        />
        <RowDivider />
        <SingleKeyRow
          service="todoist"
          label="Todoist"
          description="Task management. Create, complete, and list your today's tasks via the agent."
          linkText="Get API token"
          linkHref="https://app.todoist.com/app/settings/integrations/developer"
          keyName="TODOIST_API_KEY"
          fieldLabel="Todoist API token"
          fieldHint="Todoist → Settings → Integrations → Developer → API token"
          saved={saved} testing={testing}
          onTest={(svc, key) => testAndSave(svc, { key })}
          onDisconnect={disconnect}
          error={errors.todoist}
        />
        <RowDivider />
        <MultiKeyRow
          service="github" label="GitHub"
          description="PRs, issues, and code activity. Create issues, track stale PRs, and generate changelogs."
          primaryKey="GITHUB_TOKEN"
          saved={saved} testing={testing}
          onTest={(svc, v) => testAndSave(svc, { token: v.token, owner: v.owner, repo: v.repo })}
          onDisconnect={disconnect} error={errors.github}
          fields={[
            { key: 'token', label: 'Personal Access Token', hint: 'GitHub → Settings → Developer settings → Personal access tokens (classic) with repo scope', linkText: 'Generate', linkHref: 'https://github.com/settings/tokens', placeholder: 'ghp_…' },
            { key: 'owner', label: 'Username / org', hint: 'Your GitHub username or org name', placeholder: 'your-username', type: 'text' },
            { key: 'repo',  label: 'Default repository', hint: 'Just the repo name (not the full URL)', placeholder: 'my-repo', type: 'text' },
          ]}
        />
        {webhookInfo && !webhookInfo.url.includes('localhost') && (
          <div style={{
            margin: '0 0 0 0', padding: '12px 20px 14px',
            background: 'var(--surface)', borderTop: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              GitHub Webhook URL
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{
                flex: 1, fontSize: 11, padding: '5px 10px',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                overflowX: 'auto', whiteSpace: 'nowrap', display: 'block',
              }}>
                {webhookInfo.url}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookInfo.url);
                  setWebhookCopied(true);
                  setTimeout(() => setWebhookCopied(false), 2000);
                }}
                style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  background: webhookCopied ? '#22c55e22' : 'var(--bg)',
                  color: webhookCopied ? '#22c55e' : 'var(--text-muted)',
                  cursor: 'pointer', flexShrink: 0, transition: 'all .15s',
                }}
              >
                {webhookCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Paste this URL in your GitHub repo → Settings → Webhooks.
              {webhookInfo.secret ? ' Webhook secret is configured.' : ' Set GITHUB_WEBHOOK_SECRET in .env for HMAC verification.'}
            </div>
          </div>
        )}
        <RowDivider />
        <MultiKeyRow
          service="trello" label="Trello"
          description="Board cards and stale card scan. Track work in progress and surface blockers."
          primaryKey="TRELLO_API_KEY"
          saved={saved} testing={testing}
          onTest={(svc, v) => testAndSave(svc, { apiKey: v.apiKey, token: v.token, boardId: v.boardId })}
          onDisconnect={disconnect} error={errors.trello}
          fields={[
            { key: 'apiKey',  label: 'Trello API Key',   hint: 'trello.com/app-key — key shown at the top', linkText: 'Get key', linkHref: 'https://trello.com/app-key', placeholder: 'API key…' },
            { key: 'token',   label: 'Trello Token',     hint: 'Same page → click "generate a token"', placeholder: 'Token…' },
            { key: 'boardId', label: 'Board ID',         hint: 'Open your board → copy short ID from URL', placeholder: 'Short board ID (optional)', type: 'text' },
          ]}
        />
      </IntegrationGroup>

      {/* Delivery channels */}
      <SectionLabel label="Delivery channels" tag="optional" />
      <IntegrationGroup>
        <MultiKeyRow
          service="slack" label="Slack"
          description="Team alerts and daily digests. The agent sends summaries and stale PR alerts to your Slack."
          primaryKey="SLACK_BOT_TOKEN"
          saved={saved} testing={testing}
          onTest={(svc, v) => testAndSave(svc, { botToken: v.botToken, userId: v.userId })}
          onDisconnect={disconnect} error={errors.slack}
          fields={[
            { key: 'botToken', label: 'Bot Token',       hint: 'api.slack.com/apps → OAuth & Permissions → install → copy Bot User OAuth Token', linkText: 'Slack API', linkHref: 'https://api.slack.com/apps', placeholder: 'xoxb-…' },
            { key: 'userId',   label: 'Your User ID',    hint: 'Slack → your name → View full profile → Copy member ID', placeholder: 'U…', type: 'text' },
          ]}
        />
        <RowDivider />
        <MultiKeyRow
          service="linkedin" label="LinkedIn"
          description="Post content via a Make.com webhook. The agent drafts posts from your recent activity."
          primaryKey="LINKEDIN_WEBHOOK_URL"
          saved={saved} testing={testing}
          onTest={(svc, v) => testAndSave(svc, { webhookUrl: v.webhookUrl })}
          onDisconnect={disconnect} error={errors.linkedin}
          fields={[
            { key: 'webhookUrl', label: 'Make.com Webhook URL', hint: 'Create a webhook scenario in Make.com that posts to LinkedIn, paste the URL here', linkText: 'Make.com', linkHref: 'https://www.make.com', placeholder: 'https://hook.make.com/…', type: 'text' },
          ]}
        />
      </IntegrationGroup>

      {/* Account */}
      <SectionLabel label="Account" tag="optional" />
      <AccountSection user={user} onLogout={onLogout} />

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          onClick={onLogout}
          style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 16px', background: 'transparent' }}
        >
          Sign out of @{user.username}
        </button>
      </div>
    </div>
  );
}
