import { useState, useEffect, useRef } from 'react';
import { useCache } from '../hooks/useCache.js';
import { apiFetch } from '../api.js';
import NotConnected from './NotConnected.jsx';
import { toast } from '../toast.jsx';

const TTL_30MIN = 30 * 60 * 1000;

// Wrap raw HTML in a clean document so fonts/margins look right inside iframe
function wrapHtml(html) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px; line-height: 1.6; color: #1a1a1a;
    background: #fff; word-break: break-word;
  }
  img { max-width: 100%; height: auto; }
  a { color: #1a73e8; }
  pre, code { font-size: 12px; }
</style>
</head>
<body>${html}</body>
</html>`;
}

function EmailIframe({ html }) {
  const ref = useRef(null);

  function onLoad() {
    try {
      const doc = ref.current?.contentDocument;
      if (doc?.body) {
        ref.current.style.height = doc.body.scrollHeight + 32 + 'px';
      }
    } catch (_) {}
  }

  return (
    <iframe
      ref={ref}
      srcDoc={wrapHtml(html)}
      sandbox="allow-same-origin allow-popups"
      onLoad={onLoad}
      title="email"
      style={{ width: '100%', border: 'none', minHeight: 200, display: 'block' }}
    />
  );
}

// ─── Inline reply draft ───────────────────────────────────────────────────────

function ReplyDraft({ email, toAddr, onSent }) {
  const [text,    setText]    = useState(email.draftReply || '');
  const [open,    setOpen]    = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const r = await apiFetch('/api/email/approve-draft', {
        method: 'POST',
        body: JSON.stringify({
          to:       toAddr,
          subject:  'Re: ' + email.subject,
          original: email.draftReply,
          edited:   text,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Send failed');
      }
      toast('Reply sent to ' + toAddr, 'success');
      onSent(email.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSending(false);
    }
  }

  if (!email.draftReply) return null;

  return (
    <div style={{ borderTop: '0.5px solid var(--border)', background: '#f8fffe', padding: '12px 20px 14px' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            fontSize: 12, color: '#1D9E75', fontWeight: 500,
            background: 'none', border: '1px solid #1D9E75',
            borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="9,17 4,12 9,7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
          AI draft ready — click to review &amp; send
        </button>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
            Reply to <strong>{toAddr}</strong> · Re: {email.subject}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            style={{
              width: '100%', fontSize: 13, lineHeight: 1.6,
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '8px 10px', fontFamily: 'inherit', resize: 'vertical',
              background: '#fff', color: 'var(--text)',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="primary"
              style={{ fontSize: 12, padding: '6px 14px' }}
            >
              {sending ? 'Sending…' : 'Send reply'}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ fontSize: 12, padding: '6px 10px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function EmailPanel({ connected, refreshKey, onConnectGoogle, onGoToSettings }) {
  const [emails,     setEmails]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [openId,     setOpenId]     = useState(null);
  const [fullEmails, setFullEmails] = useState({});
  const [fetching,   setFetching]   = useState({});
  const [cacheAge,   setCacheAge]   = useState(null);
  const [authError,  setAuthError]  = useState(false);
  const cache = useCache('devos_emails', TTL_30MIN);

  useEffect(() => {
    if (!connected) return;
    const cached = cache.get();
    if (cached) {
      setEmails(Array.isArray(cached.data) ? cached.data : []);
      const raw = JSON.parse(localStorage.getItem('devos_emails') || '{}');
      setCacheAge(raw.at ?? Date.now());
      return;
    }
    load();
  }, [connected]);

  useEffect(() => {
    if (!connected || !refreshKey) return;
    cache.clear();
    setFullEmails({});
    load();
  }, [refreshKey]);

  async function load() {
    setLoading(true);
    setCacheAge(null);
    setAuthError(false);
    try {
      const r    = await apiFetch('/api/emails');
      if (r.status === 401) {
        const body = await r.json().catch(() => ({}));
        if (body.error === 'google_auth_required') setAuthError(true);
        return;
      }
      const data = await r.json();
      const list = Array.isArray(data) ? data : [];
      cache.set({ data: list });
      setCacheAge(Date.now());
      setEmails(list);
    } finally { setLoading(false); }
  }

  async function openEmail(id) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (fullEmails[id]) return;

    // Triage already fetched format:full — reuse it if htmlBody is present
    const triaged = emails.find(e => e.id === id);
    if (triaged && triaged.htmlBody !== undefined) {
      setFullEmails(f => ({ ...f, [id]: triaged }));
      return;
    }

    // Fallback for stale cache entries that predate htmlBody support
    setFetching(f => ({ ...f, [id]: true }));
    try {
      const r    = await apiFetch(`/api/email/${id}`);
      if (r.ok) {
        const data = await r.json();
        setFullEmails(f => ({ ...f, [id]: data }));
      } else {
        toast('Could not load email body', 'error');
      }
    } finally {
      setFetching(f => ({ ...f, [id]: false }));
    }
  }

  async function archive(id, e) {
    e?.stopPropagation();
    await apiFetch('/api/email/archive', { method: 'POST', body: JSON.stringify({ id }) });
    setEmails(prev => prev.filter(x => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  function onReplySent(id) {
    // archive after sending so it leaves the triage view
    archive(id);
  }

  const priorityColor = p => p === 'P1' ? 'var(--danger)' : p === 'P2' ? 'var(--warning)' : 'var(--hint)';

  if (!connected) return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Comms — triaged inbox</h2>
      <NotConnected
        title="Gmail not connected"
        description="Connect your Google account to triage emails by priority, draft replies, and stay on top of your inbox."
        primaryLabel="Connect Google"
        onPrimary={onConnectGoogle}
        secondaryLabel="Go to Settings"
        onSecondary={onGoToSettings}
      />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Comms — triaged inbox</h2>
        {cacheAge && <span style={{ fontSize: 11, color: 'var(--hint)' }}>cached {formatAge(cacheAge)}</span>}
      </div>
      {loading    && <p style={{ color: 'var(--muted)' }}>Triaging inbox…</p>}
      {authError  && (
        <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--danger)', fontSize: 13 }}>Google disconnected</span>
          <button className="primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={onConnectGoogle}>
            Reconnect
          </button>
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      {emails.map(email => {
        const isOpen = openId === email.id;
        const full   = fullEmails[email.id];
        const isLoading = fetching[email.id];

        const { name, email: addr } = parseFrom(email.from);

        return (
          <div
            key={email.id}
            style={{
              borderLeft:   `3px solid ${priorityColor(email.priority)}`,
              borderBottom: '1px solid var(--border)',
              background:   'var(--surface)',
              overflow:     'hidden',
            }}
          >
            {/* Collapsed row */}
            <div
              onClick={() => openEmail(email.id)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', cursor: 'pointer' }}
            >
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: avatarColor(addr || name), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 600,
              }}>
                {(name || addr).charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Sender name + email */}
                <div style={{ fontSize: 13, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</span>
                  {addr && <span style={{ color: 'var(--hint)', marginLeft: 4 }}>&lt;{addr}&gt;</span>}
                </div>
                {/* Preview: subject, then snippet */}
                <div style={{
                  fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.45,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {email.subject}
                  {email.snippet && <span style={{ color: 'var(--hint)' }}> — {email.snippet}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--hint)' }}>
                  {new Date(email.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
              </div>
            </div>

            {/* Expanded — Gmail-style */}
            {isOpen && (
              <div onClick={e => e.stopPropagation()} style={{ borderTop: '0.5px solid var(--border)' }}>

                {/* Subject bar */}
                <div style={{ padding: '14px 20px 0', background: '#fff' }}>
                  <div style={{ fontSize: 20, fontWeight: 400, color: '#202124', marginBottom: 12 }}>
                    {email.subject}
                  </div>

                  {/* Sender row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: avatarColor(addr || name), color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 500,
                      }}>
                        {(name || addr).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#202124' }}>
                          {(full?.from || email.from).replace(/<.*>/, '').trim()}
                        </div>
                        <div style={{ fontSize: 11, color: '#5f6368', marginTop: 2 }}>
                          {full?.from || email.from}
                        </div>
                        {full?.to && (
                          <div style={{ fontSize: 11, color: '#5f6368' }}>to {full.to}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#5f6368', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {new Date(email.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* Email body */}
                <div style={{ background: '#fff', padding: '0 4px' }}>
                  {isLoading ? (
                    <div style={{ padding: '24px 20px', color: '#5f6368', fontSize: 13 }}>Loading…</div>
                  ) : full?.htmlBody ? (
                    <EmailIframe html={full.htmlBody} />
                  ) : (
                    <pre style={{
                      margin: 0, padding: '0 20px 20px',
                      fontSize: 14, lineHeight: 1.7, color: '#202124',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                      maxHeight: 500, overflowY: 'auto',
                    }}>
                      {full?.body || email.snippet}
                    </pre>
                  )}
                </div>

                {/* AI reply draft */}
                <ReplyDraft email={email} toAddr={addr || email.from} onSent={onReplySent} />

                {/* Action bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 20px 14px', background: '#fff',
                  borderTop: '0.5px solid var(--border)',
                }}>
                  {email.intent && (
                    <span style={{ fontSize: 11, color: '#5f6368', flex: 1 }}>{email.intent}</span>
                  )}
                  <button
                    onClick={e => archive(email.id, e)}
                    style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}
                  >
                    Archive
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      </div>

      {!loading && emails.length === 0 && connected && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', paddingTop: 40 }}>Inbox clear ✓</p>
      )}
    </div>
  );
}

function formatAge(at) {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// Split a "Name <email>" header into its two parts.
function parseFrom(from = '') {
  const m = from.match(/^\s*"?(.*?)"?\s*<(.+?)>\s*$/);
  if (m) return { name: (m[1].trim() || m[2].trim()), email: m[2].trim() };
  return { name: from.trim(), email: '' };
}

const AVATAR_COLORS = ['#1a73e8', '#34A853', '#9334e6', '#e8710a', '#d93025', '#129eaf', '#a142f4', '#e52592'];

// Deterministic avatar color from the sender so it stays stable per contact.
function avatarColor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
