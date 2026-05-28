import { useState, useEffect } from 'react';
import { useCache } from '../hooks/useCache.js';
import { apiFetch } from '../api.js';
import NotConnected from './NotConnected.jsx';

export default function GitHubPanel({ health = {}, refreshKey, onGoToSettings }) {
  const [repos,         setRepos]         = useState([]);
  const [activeRepo,    setActiveRepo]    = useState('');
  const [prs,           setPRs]           = useState([]);
  const [merged,        setMerged]        = useState([]);
  const [issues,        setIssues]        = useState([]);
  const [contributions, setContributions] = useState(null);
  const [branches,      setBranches]      = useState([]);
  const [changelog,     setChangelog]     = useState('');
  const [loading,       setLoading]       = useState(false);
  const [contribLoad,   setContribLoad]   = useState(false);
  const [branchLoad,    setBranchLoad]    = useState(false);
  const [clLoading,     setClLoading]     = useState(false);
  const [newTitle,      setNewTitle]      = useState('');
  const [newBody,       setNewBody]       = useState('');
  const [creating,      setCreating]      = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [issueError,    setIssueError]    = useState('');
  const [drafting,      setDrafting]      = useState(false);
  const [tab,           setTab]           = useState('overview'); // overview | contributions | branches

  const connected = !!health.github;
  const cache     = useCache('devos_github', 10 * 60 * 1000);

  useEffect(() => {
    if (!connected) return;
    apiFetch('/api/github/repos')
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list) && list.length) {
          setRepos(list);
          setActiveRepo(list[0]);
        }
      })
      .catch(() => {});
  }, [connected]);

  useEffect(() => {
    if (!activeRepo) return;
    const cacheKey = `devos_github_${activeRepo.replace('/', '_')}`;
    const cached = cache.get(cacheKey);
    if (cached) { setPRs(cached.prs); setMerged(cached.merged); setIssues(cached.issues ?? []); return; }
    load(activeRepo);
  }, [activeRepo]);

  useEffect(() => {
    if (!refreshKey || !activeRepo) return;
    const cacheKey = `devos_github_${activeRepo.replace('/', '_')}`;
    localStorage.removeItem(cacheKey);
    load(activeRepo);
  }, [refreshKey]);

  // Load contributions when tab switches to it
  useEffect(() => {
    if (tab === 'contributions' && !contributions && activeRepo) loadContributions();
  }, [tab, activeRepo]);

  // Load branches when tab switches to it
  useEffect(() => {
    if (tab === 'branches' && !branches.length && activeRepo) loadBranches();
  }, [tab, activeRepo]);

  async function load(repo) {
    setLoading(true);
    const q = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    try {
      const [pData, mData, iData] = await Promise.all([
        apiFetch(`/api/prs${q}`).then(r => r.json()).catch(() => []),
        apiFetch(`/api/github/merged${q}`).then(r => r.json()).catch(() => []),
        apiFetch(`/api/github/issues${q}`).then(r => r.json()).catch(() => []),
      ]);
      const prs    = Array.isArray(pData) ? pData : [];
      const merged = Array.isArray(mData) ? mData : [];
      const issues = Array.isArray(iData) ? iData : [];
      const cacheKey = `devos_github_${(repo ?? '').replace('/', '_')}`;
      cache.set({ prs, merged, issues }, cacheKey);
      setPRs(prs); setMerged(merged); setIssues(issues);
      setChangelog('');
    } finally { setLoading(false); }
  }

  async function loadContributions() {
    setContribLoad(true);
    try {
      const q = activeRepo ? `?repo=${encodeURIComponent(activeRepo)}` : '';
      const data = await apiFetch(`/api/github/contributions${q}`).then(r => r.json());
      setContributions(data);
    } catch { setContributions(null); }
    finally { setContribLoad(false); }
  }

  async function loadBranches() {
    setBranchLoad(true);
    try {
      const q = activeRepo ? `?repo=${encodeURIComponent(activeRepo)}` : '';
      const data = await apiFetch(`/api/github/branches${q}`).then(r => r.json());
      setBranches(Array.isArray(data) ? data : []);
    } catch { setBranches([]); }
    finally { setBranchLoad(false); }
  }

  async function submitIssue() {
    if (!newTitle.trim()) return;
    setCreating(true); setIssueError('');
    try {
      const r = await apiFetch('/api/github/issues', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim(), repo: activeRepo }),
      });
      const data = await r.json();
      if (data.id) {
        setIssues(prev => [data, ...prev]);
        setNewTitle(''); setNewBody(''); setShowForm(false); setIssueError('');
        cache.clear(`devos_github_${(activeRepo ?? '').replace('/', '_')}`);
      } else {
        setIssueError(data.error ?? 'Failed to create issue.');
      }
    } catch { setIssueError('Network error — could not create issue.'); }
    finally { setCreating(false); }
  }

  async function draftBody() {
    if (!newTitle.trim()) return;
    setDrafting(true); setIssueError('');
    try {
      const r = await apiFetch('/api/github/draft-body', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), context: newBody.trim() }),
      });
      const data = await r.json();
      if (data.body) setNewBody(data.body);
    } catch { setIssueError('Failed to generate body.'); }
    finally { setDrafting(false); }
  }

  async function generateChangelog() {
    setClLoading(true);
    try {
      const q = activeRepo ? `?repo=${encodeURIComponent(activeRepo)}` : '';
      const data = await apiFetch(`/api/github/changelog${q}`).then(r => r.json());
      setChangelog(data.changelog ?? data.error ?? '');
    } finally { setClLoading(false); }
  }

  const stalePRs = prs.filter(p => p.daysStale >= 3);
  const freshPRs = prs.filter(p => p.daysStale < 3);

  function labelColor(label) {
    const l = label.toLowerCase();
    if (l === 'bug')                            return { bg: '#FAECE7', color: '#712B13' };
    if (l === 'feature' || l === 'enhancement') return { bg: '#E6F1FB', color: '#0C447C' };
    if (l === 'docs' || l === 'documentation')  return { bg: '#F1EFE8', color: '#444441' };
    if (l === 'good first issue')               return { bg: '#EAF3DE', color: '#27500A' };
    if (l.includes('phase') || l.includes('integration')) return { bg: '#F3EEFF', color: '#5B21B6' };
    return { bg: '#F1EFE8', color: '#444441' };
  }

  if (!connected) return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>GitHub</h2>
      <NotConnected
        title="GitHub not connected"
        description="Add your GitHub token in Settings to view open PRs, track stale issues, and generate changelogs."
        primaryLabel="Go to Settings"
        onPrimary={onGoToSettings}
      />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>GitHub</h2>
        <button onClick={() => { load(activeRepo); setContributions(null); setBranches([]); }} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Repo selector */}
      {repos.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {repos.map(r => {
            const name   = r.split('/')[1];
            const active = activeRepo === r;
            return (
              <button key={r} onClick={() => { setActiveRepo(r); setContributions(null); setBranches([]); }} style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 20,
                background: active ? 'var(--text)' : 'var(--surface)',
                color:      active ? 'var(--bg)'   : 'var(--muted)',
                border:    `0.5px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                fontWeight: active ? 600 : 400,
              }}>
                {name}
              </button>
            );
          })}
        </div>
      ) : repos.length === 1 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          <span style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 20, padding: '3px 10px' }}>{activeRepo}</span>
        </div>
      ) : null}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'overview',      label: 'Overview' },
          { key: 'contributions', label: 'Contributions' },
          { key: 'branches',      label: 'Branches' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontSize: 13, padding: '8px 16px', fontWeight: tab === t.key ? 600 : 400,
            background: 'transparent', border: 'none',
            borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
            color: tab === t.key ? 'var(--text)' : 'var(--muted)',
            cursor: 'pointer', marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
            {[
              { label: 'Open PRs',    value: prs.length,      warn: false },
              { label: 'Stale PRs',   value: stalePRs.length, warn: stalePRs.length > 0 },
              { label: 'Merged (7d)', value: merged.length,   warn: false },
              { label: 'Issues',      value: issues.length,   warn: false },
            ].map(s => (
              <div key={s.label} style={{
                background: s.warn ? '#FEF5F2' : 'var(--surface)',
                border: `0.5px solid ${s.warn ? 'var(--danger)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: s.warn ? 'var(--danger)' : 'var(--muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {stalePRs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel label="Needs attention" danger />
              {stalePRs.map(pr => <PRCard key={pr.id} pr={pr} stale />)}
            </div>
          )}

          {freshPRs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel label="Open PRs" />
              {freshPRs.map(pr => <PRCard key={pr.id} pr={pr} />)}
            </div>
          )}

          {!loading && prs.length === 0 && (
            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              No open pull requests
            </div>
          )}

          {merged.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel label="Merged this week" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {merged.map(pr => (
                  <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '9px 14px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--hint)', flexShrink: 0 }}>#{pr.id}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{pr.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--success)', background: '#EAF3DE', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>merged</span>
                    <a href={pr.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--info)', flexShrink: 0 }}>↗</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issues */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionLabel label="Open Issues" noMargin />
              <button onClick={() => { setShowForm(f => !f); setIssueError(''); }} style={{ fontSize: 11, padding: '4px 10px' }}>
                {showForm ? 'Cancel' : '+ New Issue'}
              </button>
            </div>

            {showForm && (
              <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 10 }}>
                <input placeholder="Issue title" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Description</span>
                  <button onClick={draftBody} disabled={drafting || !newTitle.trim()} style={{ fontSize: 11, padding: '3px 10px', color: 'var(--accent)', border: '0.5px solid var(--accent)', background: 'transparent' }}>
                    {drafting ? 'Drafting…' : '✦ AI Draft'}
                  </button>
                </div>
                <textarea placeholder="Description (optional)" value={newBody} onChange={e => setNewBody(e.target.value)} rows={newBody ? 8 : 3} style={{ width: '100%', marginBottom: 8, resize: 'vertical' }} />
                {issueError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{issueError}</p>}
                <button className="primary" onClick={submitIssue} disabled={creating || !newTitle.trim()}>
                  {creating ? 'Creating…' : 'Create Issue'}
                </button>
              </div>
            )}

            {issues.length === 0 && !showForm && (
              <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                No open issues
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {issues.map(issue => (
                <div key={`${issue.repo ?? ''}/${issue.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--hint)', flexShrink: 0 }}>#{issue.id}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{issue.title}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {issue.labels?.map(l => {
                      const c = labelColor(l);
                      return <span key={l} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: c.bg, color: c.color, fontWeight: 500 }}>{l}</span>;
                    })}
                  </div>
                  <a href={issue.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--info)', flexShrink: 0 }}>↗</a>
                </div>
              ))}
            </div>
          </div>

          {/* Changelog */}
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: changelog ? '0.5px solid var(--border)' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>AI Changelog</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Generated from merged PRs</div>
              </div>
              <button onClick={generateChangelog} disabled={clLoading} style={{ fontSize: 11 }}>
                {clLoading ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {changelog
              ? <pre style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text)', padding: '12px 14px' }}>{changelog}</pre>
              : <p style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 14px' }}>Click Generate to create a polished release note from your merged PRs.</p>
            }
          </div>
        </div>
      )}

      {/* ── Contributions tab ── */}
      {tab === 'contributions' && (
        <div>
          {contribLoad && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading contributions…</p>}

          {!contribLoad && contributions && (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
                {[
                  { label: 'Commits (30d)',    value: contributions.totalCommits,  color: 'var(--accent)' },
                  { label: 'PRs opened',        value: contributions.prsOpened,     color: 'var(--success)' },
                  { label: 'Reviews done',      value: contributions.reviewsDone,   color: 'var(--info)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Streak */}
              {contributions.streak > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '0.5px solid #bbf7d0', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>🔥</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#166534' }}>{contributions.streak}-day streak</div>
                    <div style={{ fontSize: 12, color: '#15803d' }}>Keep it up — you've committed every day for {contributions.streak} days</div>
                  </div>
                </div>
              )}

              {/* 30-day activity heatmap */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                  Activity — last 30 days
                </div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
                  {contributions.dailyActivity.map((d, i) => {
                    const max   = Math.max(...contributions.dailyActivity.map(x => x.count), 1);
                    const pct   = d.count / max;
                    const h     = Math.max(4, Math.round(pct * 40));
                    const bg    = d.count === 0 ? 'var(--border)'
                                : pct < 0.33    ? '#bbf7d0'
                                : pct < 0.66    ? '#4ade80'
                                :                 '#16a34a';
                    const label = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <div key={d.date} title={`${label}: ${d.count} commit${d.count !== 1 ? 's' : ''}`}
                        style={{ flex: 1, height: h, background: bg, borderRadius: 3, minWidth: 4, cursor: 'default', transition: 'height 0.2s' }} />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--hint)' }}>30 days ago</span>
                  <span style={{ fontSize: 10, color: 'var(--hint)' }}>Today</span>
                </div>
              </div>

              {contributions.totalCommits === 0 && (
                <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                  No commits in the last 30 days for {contributions.author}
                </p>
              )}
            </>
          )}

          {!contribLoad && !contributions && (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
              Could not load contributions. Make sure your GitHub token has the right permissions.
            </p>
          )}
        </div>
      )}

      {/* ── Branches tab ── */}
      {tab === 'branches' && (
        <div>
          {branchLoad && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading branches… (fetching commit dates)</p>}

          {!branchLoad && branches.length > 0 && (
            <>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
                {[
                  { label: 'Total',    value: branches.length,                            color: 'var(--text)' },
                  { label: 'Active',   value: branches.filter(b => !b.stale).length,      color: 'var(--success)' },
                  { label: 'Stale',    value: branches.filter(b => b.stale).length,       color: branches.some(b => b.stale) ? 'var(--warning)' : 'var(--muted)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Stale warning */}
              {branches.filter(b => b.stale).length > 0 && (
                <div style={{ background: '#FEF9E7', border: '0.5px solid #F9C74F', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#7D4F00' }}>
                  <strong>{branches.filter(b => b.stale).length} stale branch{branches.filter(b => b.stale).length > 1 ? 'es' : ''}</strong> — no commits in 14+ days. Consider merging or deleting them.
                </div>
              )}

              {/* Branch list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {branches.map(b => (
                  <div key={b.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--surface)',
                    border: `0.5px solid ${b.stale ? '#F9C74F' : 'var(--border)'}`,
                    borderLeft: `3px solid ${b.isDefault ? 'var(--accent)' : b.stale ? 'var(--warning)' : 'var(--border)'}`,
                    borderRadius: '0 var(--radius) var(--radius) 0',
                    padding: '9px 12px',
                  }}>
                    <code style={{ flex: 1, fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.name}
                    </code>

                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                      {b.isDefault && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#E6F1FB', color: '#0C447C', fontWeight: 600 }}>default</span>
                      )}
                      {b.protected && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#F3EEFF', color: '#5B21B6', fontWeight: 600 }}>🔒 protected</span>
                      )}
                      {b.stale && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#FEF9E7', color: '#7D4F00', fontWeight: 600 }}>
                          {b.daysOld}d stale
                        </span>
                      )}
                      {!b.stale && !b.isDefault && b.daysOld !== null && (
                        <span style={{ fontSize: 10, color: 'var(--hint)' }}>
                          {b.daysOld === 0 ? 'today' : `${b.daysOld}d ago`}
                        </span>
                      )}
                      <code style={{ fontSize: 10, color: 'var(--hint)', fontFamily: 'monospace' }}>{b.sha}</code>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!branchLoad && branches.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
              No branches found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ label, danger, noMargin }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: danger ? 'var(--danger)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: noMargin ? 0 : 8 }}>
      {label}
    </div>
  );
}

function PRCard({ pr, stale }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: 'var(--surface)',
      border: '0.5px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      marginBottom: 6,
    }}>
      <div style={{ width: 3, alignSelf: 'stretch', background: stale ? 'var(--danger)' : 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--hint)', flexShrink: 0 }}>#{pr.id}</span>
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.title}</span>
          {stale && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#FAECE7', color: '#712B13', fontWeight: 600, flexShrink: 0 }}>
              {pr.daysStale}d stale
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>by {pr.author}</span>
          {pr.branch && (
            <span style={{ fontSize: 10, color: 'var(--hint)', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>
              {pr.branch}
            </span>
          )}
          {pr.reviewers?.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>· reviewers: {pr.reviewers.join(', ')}</span>
          )}
        </div>
      </div>
      <a href={pr.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--info)', padding: '0 14px', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>↗</a>
    </div>
  );
}
