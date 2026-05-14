import { useState, useEffect, useRef } from 'react';
import { useCache } from '../hooks/useCache.js';

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

export default function EmailPanel({ connected, refreshKey }) {
  const [emails,     setEmails]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [openId,     setOpenId]     = useState(null);
  const [fullEmails, setFullEmails] = useState({});
  const [fetching,   setFetching]   = useState({});
  const [cacheAge,   setCacheAge]   = useState(null);
  const cache = useCache('devos_emails', TTL_30MIN);

  useEffect(() => {
    if (!connected) return;
    const cached = cache.get();
    if (cached) {
      setEmails(cached.data);
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
    try {
      const r    = await fetch('/api/emails');
      const data = await r.json();
      cache.set({ data });
      setCacheAge(Date.now());
      setEmails(data);
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
      const r    = await fetch(`/api/email/${id}`);
      if (r.ok) {
        const data = await r.json();
        setFullEmails(f => ({ ...f, [id]: data }));
      }
    } finally {
      setFetching(f => ({ ...f, [id]: false }));
    }
  }

  async function archive(id, e) {
    e.stopPropagation();
    await fetch('/api/email/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setEmails(prev => prev.filter(x => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  const priorityColor = p => p === 'P1' ? 'var(--danger)' : p === 'P2' ? 'var(--warning)' : 'var(--hint)';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Comms — triaged inbox</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {cacheAge && <span style={{ fontSize: 11, color: 'var(--hint)' }}>cached {formatAge(cacheAge)}</span>}
          <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {!connected && <p style={{ color: 'var(--muted)' }}>Connect Google to load your inbox.</p>}
      {loading    && <p style={{ color: 'var(--muted)' }}>Triaging inbox…</p>}

      {emails.map(email => {
        const isOpen = openId === email.id;
        const full   = fullEmails[email.id];
        const isLoading = fetching[email.id];

        return (
          <div
            key={email.id}
            style={{
              background:   'var(--surface)',
              border:       '0.5px solid var(--border)',
              borderLeft:   `3px solid ${priorityColor(email.priority)}`,
              borderRadius: '0 var(--radius) var(--radius) 0',
              marginBottom: 8,
              overflow:     'hidden',
            }}
          >
            {/* Collapsed row */}
            <div
              onClick={() => openEmail(email.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {email.subject}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {email.from}
                  {!isOpen && email.snippet && (
                    <span style={{ color: 'var(--hint)', marginLeft: 6 }}>— {email.snippet.slice(0, 60)}…</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                        background: '#1a73e8', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 500,
                      }}>
                        {(full?.from || email.from).charAt(0).toUpperCase()}
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
