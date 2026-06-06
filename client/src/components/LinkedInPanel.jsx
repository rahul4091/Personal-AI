import { useState } from 'react';
import { apiFetch } from '../api.js';

export default function LinkedInPanel({ health = {} }) {
  const [source,   setSource]   = useState('');
  const [draft,    setDraft]    = useState(null);
  const [loading,  setLoading]  = useState('');
  const [selected, setSelected] = useState(0);
  const [status,   setStatus]   = useState('');

  async function generate() {
    if (!source.trim()) return;
    setLoading('gen');
    setStatus('');
    try {
      const r = await apiFetch('/api/content/linkedin', {
        method: 'POST',
        body: JSON.stringify({ source }),
      });
      const data = await r.json();
      setDraft(data);
      setSelected(data.recommendedVariant ?? 0);
    } catch { setStatus('Failed to generate. Check AI keys.'); }
    finally  { setLoading(''); }
  }

  async function approve(postNow = false) {
    const variant = draft.variants[selected];
    setLoading(postNow ? 'posting' : 'saving');
    try {
      const r = await apiFetch('/api/content/approve', {
        method: 'POST',
        body: JSON.stringify({ original: draft.variants[0].body, edited: variant.body, type: 'linkedin', postNow }),
      });
      const data = await r.json();
      setStatus(postNow && data.posted ? '✓ Posted to LinkedIn' : '✓ Saved to voice profile');
      setDraft(null);
      setSource('');
    } catch { setStatus('Action failed.'); }
    finally  { setLoading(''); }
  }

  const connected = !!health.linkedin;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>LinkedIn</h2>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: connected ? '#dcfce7' : '#fee2e2', color: connected ? '#166534' : '#991b1b' }}>
          {connected ? '● Connected via Make.com' : '○ Webhook not configured'}
        </span>
      </div>

      {!connected && (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--muted)' }}>
          Add <code>LINKEDIN_WEBHOOK_URL</code> to your <code>.env</code> to enable posting directly to LinkedIn via Make.com.
        </div>
      )}

      {/* Input */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>What do you want to post about?</div>
        <textarea
          rows={4}
          placeholder="Paste a raw note, Slack message, PR description, or idea…"
          value={source}
          onChange={e => setSource(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <button className="primary" onClick={generate} disabled={loading === 'gen' || !source.trim()}>
          {loading === 'gen' ? 'Generating 3 variants…' : 'Generate variants'}
        </button>
      </div>

      {/* Variants */}
      {draft && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>3 variants — click to select</div>
          {draft.variants?.map((v, i) => (
            <div
              key={i}
              onClick={() => setSelected(i)}
              style={{
                background: 'var(--surface)',
                border: `${i === selected ? '2px' : '0.5px'} solid ${i === selected ? '#1D9E75' : 'var(--border)'}`,
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {connected && (
              <button className="primary" onClick={() => approve(true)} disabled={!!loading}>
                {loading === 'posting' ? 'Posting…' : 'Post to LinkedIn ↗'}
              </button>
            )}
            <button onClick={() => approve(false)} disabled={!!loading}>
              {loading === 'saving' ? 'Saving…' : 'Save to voice profile'}
            </button>
            <button onClick={() => { setDraft(null); setStatus(''); }}>Dismiss</button>
          </div>
        </div>
      )}

      {status && (
        <p style={{ fontSize: 12, color: status.startsWith('✓') ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{status}</p>
      )}
    </div>
  );
}
