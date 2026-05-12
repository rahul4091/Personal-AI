import { useState, useEffect } from 'react';
import { useCache } from '../hooks/useCache.js';

const TTL_30MIN = 30 * 60 * 1000;

export default function EmailPanel({ connected }) {
  const [emails,   setEmails]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [editing,  setEditing]  = useState({});
  const [cacheAge, setCacheAge] = useState(null);
  const cache = useCache('devos_emails', TTL_30MIN);

  useEffect(() => {
    if (!connected) return;
    const cached = cache.get();
    if (cached) {
      setEmails(cached.data);
      const raw = JSON.parse(localStorage.getItem('devos_emails') || '{}');
      setCacheAge(raw.at ?? Date.now());
      return; // skip API — use cache
    }
    load();
  }, [connected]);

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

  async function approveDraft(email) {
    const edited = editing[email.id] ?? email.draftReply;
    await fetch('/api/email/approve-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email.from, subject: 'Re: ' + email.subject, original: email.draftReply, edited }),
    });
    setEmails(e => e.filter(x => x.id !== email.id));
  }

  async function archive(id) {
    await fetch('/api/email/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setEmails(e => e.filter(x => x.id !== id));
  }

  const priorityColor = p => p === 'P1' ? 'var(--danger)' : p === 'P2' ? 'var(--warning)' : 'var(--hint)';
  const priorityTag   = p => `tag-${p === 'P1' ? 'danger' : p === 'P2' ? 'warn' : 'gray'}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Comms — triaged inbox</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {cacheAge && <span style={{ fontSize: 11, color: 'var(--hint)' }}>cached {formatAge(cacheAge)}</span>}
          <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {!connected && <p style={{ color: 'var(--muted)' }}>Connect Google to load your inbox.</p>}

      {loading && <p style={{ color: 'var(--muted)' }}>Triaging inbox…</p>}

      {emails.map(email => (
        <div key={email.id} style={{
          background: 'var(--surface)', border: '0.5px solid var(--border)',
          borderLeft: `3px solid ${priorityColor(email.priority)}`,
          borderRadius: '0 var(--radius) var(--radius) 0',
          padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className={`tag ${priorityTag(email.priority)}`}>{email.priority}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{email.from}</span>
            <span style={{ fontSize: 11, color: 'var(--hint)' }}>{new Date(email.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div style={{ fontWeight: 500, marginBottom: 4 }}>{email.subject}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: email.draftReply ? 10 : 0 }}>{email.intent}</div>

          {email.draftReply && email.priority !== 'P3' && (
            <>
              <textarea
                rows={3}
                style={{ fontSize: 12, marginBottom: 8 }}
                value={editing[email.id] ?? email.draftReply}
                onChange={e => setEditing(prev => ({ ...prev, [email.id]: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="primary" onClick={() => approveDraft(email)}>Send ↗</button>
                <button onClick={() => archive(email.id)}>Skip</button>
              </div>
            </>
          )}

          {email.priority === 'P3' && (
            <button onClick={() => archive(email.id)} style={{ fontSize: 11, color: 'var(--hint)' }}>Archive</button>
          )}
        </div>
      ))}

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
