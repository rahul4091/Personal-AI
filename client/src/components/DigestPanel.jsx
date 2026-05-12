import { useState, useEffect } from 'react';

export default function DigestPanel() {
  const [digest,  setDigest]  = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/digest/latest')
      .then(r => r.json())
      .then(d => { if (d) setDigest(d); })
      .catch(() => {});
  }, []);

  async function runDigest() {
    setLoading(true);
    try {
      const r = await fetch('/api/digest/run', { method: 'POST' });
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
          <p style={{ fontSize: 12 }}>Click "Run digest" to pull all sub-agents — result is cached until you refresh</p>
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
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <span className={`tag tag-${e.priority === 'P1' ? 'danger' : 'warn'}`}>{e.priority}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.from}</span>
                  </div>
                  <div style={{ fontWeight: 500 }}>{e.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{e.intent}</div>
                </>,
                e.priority === 'P1' ? 'var(--danger)' : 'var(--warning)'
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
