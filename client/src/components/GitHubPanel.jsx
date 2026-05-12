import { useState, useEffect } from 'react';
import { useCache } from '../hooks/useCache.js';

export default function GitHubPanel({ health = {} }) {
  const [prs,       setPRs]       = useState([]);
  const [merged,    setMerged]    = useState([]);
  const [changelog, setChangelog] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [clLoading, setClLoading] = useState(false);

  const connected = !!health.github;
  const cache     = useCache('devos_github', 10 * 60 * 1000); // 10 min

  useEffect(() => {
    if (!connected) return;
    const cached = cache.get();
    if (cached) { setPRs(cached.prs); setMerged(cached.merged); return; }
    load();
  }, [connected]);

  async function load() {
    setLoading(true);
    cache.clear();
    try {
      const [pData, mData] = await Promise.all([
        fetch('/api/prs').then(r => r.json()).catch(() => []),
        fetch('/api/github/merged').then(r => r.json()).catch(() => []),
      ]);
      const prs    = Array.isArray(pData) ? pData : [];
      const merged = Array.isArray(mData) ? mData : [];
      cache.set({ prs, merged });
      setPRs(prs);
      setMerged(merged);
    } finally { setLoading(false); }
  }

  async function generateChangelog() {
    setClLoading(true);
    try {
      const r = await fetch('/api/github/changelog');
      const data = await r.json();
      setChangelog(data.changelog ?? data.error ?? '');
    } finally { setClLoading(false); }
  }

  const stalePRs  = prs.filter(p => p.daysStale >= 3);
  const freshPRs  = prs.filter(p => p.daysStale < 3);

  if (!connected) return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>GitHub</h2>
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Not connected</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
          Add these to your <code>.env</code> and restart the server:
        </p>
        <pre style={{ fontSize: 12, background: 'var(--bg)', padding: 10, borderRadius: 6, marginTop: 8, lineHeight: 1.8 }}>
{`GITHUB_TOKEN=ghp_your_token
GITHUB_OWNER=your_username
GITHUB_REPO=your_repo`}
        </pre>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Get a token at <strong>github.com → Settings → Developer settings → Personal access tokens</strong> with <code>repo</code> scope.
        </p>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>GitHub</h2>
        <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Open PRs',   value: prs.length },
          { label: 'Stale PRs',  value: stalePRs.length,  warn: stalePRs.length > 0 },
          { label: 'Merged (7d)', value: merged.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: `0.5px solid ${s.warn ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.warn ? 'var(--danger)' : 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Stale PRs */}
      {stalePRs.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Stale PRs — needs attention</div>
          {stalePRs.map(pr => <PRRow key={pr.id} pr={pr} stale />)}
        </>
      )}

      {/* Open PRs */}
      {freshPRs.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '12px 0 6px' }}>Open PRs</div>
          {freshPRs.map(pr => <PRRow key={pr.id} pr={pr} />)}
        </>
      )}

      {!loading && prs.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>No open PRs.</p>
      )}

      {/* Merged PRs */}
      {merged.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '12px 0 6px' }}>Merged this week</div>
          {merged.map(pr => (
            <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>#{pr.id}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{pr.title}</span>
              <span style={{ fontSize: 11, color: 'var(--success)' }}>merged</span>
              <a href={pr.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--info)' }}>↗</a>
            </div>
          ))}
        </>
      )}

      {/* Changelog */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>AI Changelog — from merged PRs</div>
          <button onClick={generateChangelog} disabled={clLoading}>
            {clLoading ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {changelog
          ? <pre style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{changelog}</pre>
          : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Generate a polished release note from your merged PRs.</p>
        }
      </div>
    </div>
  );
}

function PRRow({ pr, stale }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--surface)',
      border: '0.5px solid var(--border)',
      borderLeft: stale ? '3px solid var(--danger)' : undefined,
      borderRadius: stale ? '0 var(--radius) var(--radius) 0' : 'var(--radius)',
      padding: '8px 12px', marginBottom: 6,
    }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>#{pr.id}</span>
      <span style={{ flex: 1, fontSize: 13 }}>{pr.title}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{pr.author}</span>
      {stale && <span className="tag tag-danger">{pr.daysStale}d stale</span>}
      <a href={pr.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--info)' }}>View ↗</a>
    </div>
  );
}
