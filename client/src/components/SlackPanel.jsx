import { useState } from 'react';
import { apiFetch } from '../api.js';
import NotConnected from './NotConnected.jsx';

export default function SlackPanel({ health = {}, onGoToSettings }) {
  const [message,  setMessage]  = useState('');
  const [log,      setLog]      = useState([]);
  const [loading,  setLoading]  = useState('');
  const [digest,   setDigest]   = useState(null);

  const connected = !!health.slack;

  async function sendDM() {
    if (!message.trim()) return;
    setLoading('dm');
    try {
      const r = await apiFetch('/api/slack/send', {
        method: 'POST',
        body: JSON.stringify({ text: message }),
      });
      const data = await r.json();
      if (data.ok) {
        setLog(l => [{ text: message, at: new Date().toLocaleTimeString(), ok: true }, ...l]);
        setMessage('');
      } else {
        setLog(l => [{ text: message, at: new Date().toLocaleTimeString(), ok: false, error: data.error }, ...l]);
      }
    } catch (err) {
      setLog(l => [{ text: message, at: new Date().toLocaleTimeString(), ok: false, error: err.message }, ...l]);
    } finally { setLoading(''); }
  }

  async function runDigest() {
    setLoading('digest');
    try {
      const r = await apiFetch('/api/digest/run', { method: 'POST' });
      const data = await r.json();
      setDigest(data);
    } finally { setLoading(''); }
  }

  if (!connected) return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Slack</h2>
      <NotConnected
        title="Slack not connected"
        description="Add your Slack bot token in Settings to send messages, run team digests, and get alerts."
        primaryLabel="Go to Settings"
        onPrimary={onGoToSettings}
      />
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Slack</h2>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#166534' }}>● Connected</span>
      </div>

      {/* Send DM */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>Send yourself a message</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Type a message…"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendDM()}
            disabled={loading === 'dm'}
          />
          <button className="primary" onClick={sendDM} disabled={loading === 'dm' || !message.trim()}>
            {loading === 'dm' ? 'Sending…' : 'Send'}
          </button>
        </div>
        {log.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {log.slice(0, 5).map((l, i) => (
              <div key={i} style={{ fontSize: 11, color: l.ok ? 'var(--success)' : 'var(--danger)', marginBottom: 3 }}>
                {l.ok ? '✓' : '✗'} {l.text} <span style={{ opacity: .5 }}>{l.at}</span>
                {l.error && <span> — {l.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Digest */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>Morning Digest</div>
            <div style={{ fontSize: 11, color: 'var(--hint)' }}>Runs automatically at 9 AM — sends to your Slack DM</div>
          </div>
          <button className="primary" onClick={runDigest} disabled={loading === 'digest'}>
            {loading === 'digest' ? 'Running…' : 'Run now'}
          </button>
        </div>
        {digest && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            <div>Emails pending: <strong style={{ color: 'var(--text)' }}>{digest.comms?.pending?.length ?? 0}</strong></div>
            <div>Calendar conflicts: <strong style={{ color: 'var(--text)' }}>{digest.calendar?.conflicts?.length ?? 0}</strong></div>
            <div>Blockers: <strong style={{ color: 'var(--text)' }}>{digest.tasks?.blockers?.length ?? 0}</strong></div>
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--hint)' }}>Sent to Slack at {new Date(digest.generatedAt).toLocaleTimeString()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
