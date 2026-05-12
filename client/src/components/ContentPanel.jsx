import { useState } from 'react';

export default function ContentPanel({ health = {} }) {
  const [source,    setSource]    = useState('');
  const [draft,     setDraft]     = useState(null);
  const [changelog, setChangelog] = useState(null);
  const [loading,   setLoading]   = useState('');
  const [selected,  setSelected]  = useState(0);
  const [posted,    setPosted]    = useState(false);

  async function generatePost() {
    if (!source.trim()) return;
    setLoading('post');
    setPosted(false);
    try {
      const r = await fetch('/api/content/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await r.json();
      setDraft(data);
      setSelected(data.recommendedVariant ?? 0);
    } finally { setLoading(''); }
  }

  async function approvePost(postNow = false) {
    const variant = draft.variants[selected];
    setLoading(postNow ? 'posting' : 'saving');
    try {
      const r = await fetch('/api/content/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: draft.variants[0].body, edited: variant.body, type: 'linkedin', postNow }),
      });
      const data = await r.json();
      if (postNow && data.posted) setPosted(true);
      setDraft(null);
      setSource('');
    } finally { setLoading(''); }
  }

  async function generateChangelog() {
    setLoading('changelog');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'generate changelog from recent merged PRs' }),
      });
      const data = await r.json();
      setChangelog(data.reply);
    } finally { setLoading(''); }
  }

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Content</h2>

      {/* LinkedIn post generator */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>LinkedIn post generator</div>
        <textarea
          rows={3}
          placeholder="Paste a raw note, Slack message, or PR summary…"
          value={source}
          onChange={e => setSource(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <button className="primary" onClick={generatePost} disabled={loading === 'post' || !source.trim()}>
          {loading === 'post' ? 'Generating 3 variants…' : 'Generate variants'}
        </button>
      </div>

      {/* Draft variants */}
      {draft && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>3 variants — click to select</div>
          {draft.variants?.map((v, i) => (
            <div
              key={i}
              onClick={() => setSelected(i)}
              style={{
                background: 'var(--surface)',
                border: `${i === selected ? '2px' : '0.5px'} solid ${i === selected ? 'var(--info)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span className="tag tag-info">{v.label}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>~{v.wordCount} words</span>
                {i === (draft.recommendedVariant ?? 0) && <span className="tag tag-success">recommended</span>}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: i === selected ? 'var(--text)' : 'var(--muted)', whiteSpace: 'pre-line' }}>{v.body}</p>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {health.linkedin && (
              <button className="primary" onClick={() => approvePost(true)} disabled={!!loading}>
                {loading === 'posting' ? 'Posting…' : 'Post to LinkedIn ↗'}
              </button>
            )}
            <button onClick={() => approvePost(false)} disabled={!!loading}>
              {loading === 'saving' ? 'Saving…' : 'Save to voice profile'}
            </button>
            <button onClick={() => setDraft(null)}>Dismiss</button>
          </div>
          {posted && <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 8 }}>Posted to LinkedIn via Make.com</p>}
        </div>
      )}

      {/* Changelog */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>Changelog — from merged PRs</div>
          <button onClick={generateChangelog} disabled={loading === 'changelog'}>
            {loading === 'changelog' ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {changelog
          ? <pre style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{changelog}</pre>
          : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Click Generate to pull your recent merged PRs into a formatted changelog.</p>
        }
      </div>
    </div>
  );
}
