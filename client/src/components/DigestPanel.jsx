import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function DigestPanel({ refreshKey, onGoToSettings, health = {}, connected = false }) {
  const [digest,  setDigest]  = useState(null);
  const [loading, setLoading] = useState(false);

  // Count how many integrations this user has connected
  const connectedCount = [
    connected,                  // Google
    health.notion,
    health.todoist,
    health.github,
    health.slack,
    health.trello,
    health.gemini || health.groq,
  ].filter(Boolean).length;

  useEffect(() => {
    apiFetch('/api/digest/latest')
      .then(r => r.json())
      .then(d => { if (d) setDigest(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!refreshKey) return;
    apiFetch('/api/digest/latest')
      .then(r => r.json())
      .then(d => { if (d) setDigest(d); })
      .catch(() => {});
  }, [refreshKey]);

  async function runDigest() {
    setLoading(true);
    try {
      const r = await apiFetch('/api/digest/run', { method: 'POST' });
      setDigest(await r.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const card = (children, accent) => (
    <div style={{
      background: 'var(--surface)', border: `0.5px solid var(--border)`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: accent ? '0 var(--radius) var(--radius) 0' : 'var(--radius)',
      padding: '10px 14px', marginBottom: 8,
    }}>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500 }}>Today's digest</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <button className="primary" onClick={runDigest} disabled={loading}>
          {loading ? 'Running...' : digest ? 'Refresh digest' : 'Run digest'}
        </button>
      </div>

      {!digest && !loading && connectedCount < 2 && (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
          padding: '36px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Connect more tools to unlock the digest</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 360, margin: '0 auto 20px' }}>
            The digest needs at least 2 integrations — like Google + Notion, or GitHub + Todoist — to give you a useful summary.
            You have <strong>{connectedCount}</strong> connected right now.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            {[
              { label: 'Google', hint: 'Gmail & Calendar', done: connected },
              { label: 'Notion / Todoist', hint: 'Tasks & notes', done: health.notion || health.todoist },
              { label: 'GitHub', hint: 'PRs & issues', done: health.github },
              { label: 'Slack', hint: 'Team messages', done: health.slack },
            ].map(t => (
              <div key={t.label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20,
                background: t.done ? 'rgba(29,158,117,0.08)' : 'var(--surface)',
                border: `1px solid ${t.done ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 12, color: t.done ? 'var(--accent)' : 'var(--text-muted)',
              }}>
                <span>{t.done ? '✓' : '○'}</span>
                <span style={{ fontWeight: t.done ? 600 : 400 }}>{t.label}</span>
              </div>
            ))}
          </div>
          <button className="primary" onClick={onGoToSettings}
            style={{ padding: '9px 20px', fontSize: 13 }}>
            Add integrations in Settings →
          </button>
        </div>
      )}

      {!digest && !loading && connectedCount >= 2 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No digest yet for today</p>
          <p style={{ fontSize: 12, marginBottom: 16 }}>
            Click "Run digest" to get a summary of your emails, calendar, tasks, and code activity.
          </p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <p>Running 4 sub-agents in parallel…</p>
        </div>
      )}

      {digest && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Emails pending',  val: digest.comms?.pending?.length ?? 0,    color: 'var(--success)' },
              { label: 'Conflicts',       val: digest.calendar?.conflicts?.length ?? 0, color: 'var(--warning)' },
              { label: 'Blockers',        val: digest.tasks?.blockers?.length ?? 0,    color: 'var(--danger)' },
              { label: 'Content drafts',  val: digest.content?.drafts?.length ?? 0,   color: 'var(--info)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Comms */}
          {digest.comms?.pending?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Comms</div>
              {digest.comms.pending.slice(0, 3).map((e, i) => card(
                <>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{e.from}</div>
                  <div style={{ fontWeight: 500 }}>{e.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{e.intent}</div>
                </>,
                'var(--border)'
              ))}
            </div>
          )}

          {/* Calendar */}
          {digest.calendar?.conflicts?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Calendar conflicts</div>
              {digest.calendar.conflicts.map((c, i) => card(
                <>
                  <div style={{ fontWeight: 500 }}>{c.eventA?.title} ↔ {c.eventB?.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {c.type === 'overlap' ? `${Math.round(c.overlapMin)}min overlap` : `${Math.round(c.gapMin)}min gap`}
                  </div>
                </>,
                'var(--danger)'
              ))}
            </div>
          )}

          {/* Blockers */}
          {digest.tasks?.blockers?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Blockers</div>
              {digest.tasks.blockers.map((b, i) => card(
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <span className="tag tag-danger">Blocked</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{b.source}</span>
                  </div>
                  <div style={{ fontWeight: 500 }}>{b.title}</div>
                </>,
                'var(--danger)'
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--hint)', textAlign: 'right' }}>
            Generated {new Date(digest.generatedAt).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
