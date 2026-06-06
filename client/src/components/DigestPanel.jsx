import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';

export default function DigestPanel({ refreshKey, onGoToSettings }) {
  const [digest,  setDigest]  = useState(null);
  const [loading, setLoading] = useState(false);

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

      {!digest && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No digest yet for today</p>
          <p style={{ fontSize: 12, marginBottom: 16 }}>
            Connect your tools first, then click "Run digest" to get a summary of emails, calendar, tasks, and code activity.
          </p>
          <button
            onClick={onGoToSettings}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Go to Settings to connect your tools →
          </button>
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
