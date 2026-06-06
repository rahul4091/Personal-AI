import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';

const LINKEDIN_MAX = 3000;

const TEMPLATES = [
  { label: 'Achievement',    icon: '🏆', hint: 'Shipped X that does Y, proud of Z...' },
  { label: 'Lesson learned', icon: '💡', hint: 'Biggest mistake I made this year was...' },
  { label: 'Behind the scenes', icon: '🔧', hint: 'Here\'s how we actually built X...' },
  { label: 'Hot take',       icon: '🔥', hint: 'Unpopular opinion: most devs are wrong about...' },
];

function CharBar({ text }) {
  const len = text.length;
  const pct = Math.min(len / LINKEDIN_MAX, 1);
  const over = len > LINKEDIN_MAX;
  const warn = len > LINKEDIN_MAX * 0.9;
  const color = over ? 'var(--danger)' : warn ? 'var(--warning)' : 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 2, transition: 'width .15s, background .15s' }} />
      </div>
      <span style={{ fontSize: 11, color: over ? 'var(--danger)' : 'var(--muted)', minWidth: 60, textAlign: 'right' }}>
        {len} / {LINKEDIN_MAX}
      </span>
    </div>
  );
}

function PostCard({ post, onCopy }) {
  const date = new Date(post.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div style={{
      background: 'var(--surface)', border: '0.5px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, flex: 1, margin: 0,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {post.edited}
        </p>
        <button
          onClick={() => onCopy(post.edited)}
          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Copy
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{date}</div>
    </div>
  );
}

export default function LinkedInPanel({ health = {} }) {
  const [source,    setSource]    = useState('');
  const [draft,     setDraft]     = useState(null);
  const [selected,  setSelected]  = useState(0);
  const [editedBody, setEditedBody] = useState('');
  const [hashtags,  setHashtags]  = useState([]);
  const [activeHashtags, setActiveHashtags] = useState(new Set());
  const [loading,   setLoading]   = useState('');
  const [status,    setStatus]    = useState('');
  const [history,   setHistory]   = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const textareaRef = useRef(null);

  const connected = !!health.linkedin;

  useEffect(() => {
    apiFetch('/api/content/linkedin/history')
      .then(r => r.json())
      .then(setHistory)
      .catch(() => {});
  }, [status]);

  function applyTemplate(t) {
    setSource(t.hint);
    textareaRef.current?.focus();
  }

  async function generate() {
    if (!source.trim()) return;
    setLoading('gen'); setStatus(''); setDraft(null);
    try {
      const r = await apiFetch('/api/content/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setDraft(data);
      const idx = data.recommendedVariant ?? 0;
      setSelected(idx);
      setEditedBody(data.variants[idx].body);
      setHashtags(data.hashtags ?? []);
      setActiveHashtags(new Set(data.hashtags?.slice(0, 3) ?? []));
    } catch (e) {
      setStatus(e.message || 'Failed to generate — check AI keys in Settings.');
    } finally {
      setLoading('');
    }
  }

  function selectVariant(i) {
    setSelected(i);
    setEditedBody(draft.variants[i].body);
  }

  function toggleHashtag(tag) {
    setActiveHashtags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function finalPost() {
    const tags = [...activeHashtags].join(' ');
    return editedBody + (tags ? '\n\n' + tags : '');
  }

  async function approve(postNow = false) {
    const body = finalPost();
    setLoading(postNow ? 'posting' : 'saving');
    try {
      const r = await apiFetch('/api/content/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: draft.variants[0].body, edited: body, type: 'linkedin', postNow }),
      });
      const data = await r.json();
      setStatus(postNow && data.posted ? '✓ Posted to LinkedIn!' : '✓ Saved to voice profile');
      setDraft(null); setSource(''); setEditedBody(''); setHashtags([]); setActiveHashtags(new Set());
    } catch {
      setStatus('Action failed.');
    } finally {
      setLoading('');
    }
  }

  async function copyText(text, idx = null) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx ?? 'final');
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {}
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }}>

      {/* ── Left: Studio ─────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>LinkedIn Studio</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Turn raw thoughts into polished posts</p>
          </div>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 99,
            background: connected ? 'rgba(29,158,117,.1)' : 'var(--surface)',
            color: connected ? 'var(--accent)' : 'var(--muted)',
            border: `0.5px solid ${connected ? 'var(--accent)' : 'var(--border)'}`,
          }}>
            {connected ? '● Auto-post on' : '○ Auto-post off'}
          </span>
        </div>

        {/* Templates */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, padding: '5px 12px', borderRadius: 20,
                border: '0.5px solid var(--border)', background: 'var(--surface)',
                cursor: 'pointer', color: 'var(--text)',
              }}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Raw input — paste a note, PR, idea, or Slack message</div>
          <textarea
            ref={textareaRef}
            rows={4}
            placeholder="e.g. We just shipped dark mode after 3 months. The hardest part wasn't the CSS…"
            value={source}
            onChange={e => setSource(e.target.value)}
            style={{ marginBottom: 0 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="primary" onClick={generate} disabled={loading === 'gen' || !source.trim()}>
              {loading === 'gen' ? 'Generating…' : 'Generate 3 variants →'}
            </button>
          </div>
        </div>

        {/* Variants */}
        {draft && (
          <>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              Pick a variant
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {draft.variants?.map((v, i) => (
                <button
                  key={i}
                  onClick={() => selectVariant(i)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'left',
                    border: `${i === selected ? '2px' : '0.5px'} solid ${i === selected ? '#0A66C2' : 'var(--border)'}`,
                    background: i === selected ? 'rgba(10,102,194,.06)' : 'var(--surface)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: i === selected ? '#0A66C2' : 'var(--muted)', marginBottom: 3 }}>
                    {v.label}
                    {i === (draft.recommendedVariant ?? 0) && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>★ rec</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>~{v.wordCount}w</div>
                </button>
              ))}
            </div>

            {/* Editable post body */}
            <div style={{ background: 'var(--surface)', border: '1px solid #0A66C2', borderRadius: 'var(--radius)', padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#0A66C2', fontWeight: 500, marginBottom: 8 }}>Edit before posting</div>
              <textarea
                rows={9}
                value={editedBody}
                onChange={e => setEditedBody(e.target.value)}
                style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}
              />
              <CharBar text={finalPost()} />
            </div>

            {/* Hashtag picker */}
            {hashtags.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Hashtags — click to toggle</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {hashtags.map(tag => {
                    const on = activeHashtags.has(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleHashtag(tag)}
                        style={{
                          fontSize: 12, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                          border: `0.5px solid ${on ? '#0A66C2' : 'var(--border)'}`,
                          background: on ? 'rgba(10,102,194,.08)' : 'var(--surface)',
                          color: on ? '#0A66C2' : 'var(--muted)',
                          fontWeight: on ? 500 : 400,
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {connected && (
                <button className="primary" onClick={() => approve(true)} disabled={!!loading || finalPost().length > LINKEDIN_MAX}>
                  {loading === 'posting' ? 'Posting…' : 'Post to LinkedIn ↗'}
                </button>
              )}
              <button onClick={() => approve(false)} disabled={!!loading}>
                {loading === 'saving' ? 'Saving…' : 'Save to voice profile'}
              </button>
              <button onClick={() => copyText(finalPost(), 'final')} style={{ marginLeft: 'auto' }}>
                {copiedIdx === 'final' ? '✓ Copied' : 'Copy'}
              </button>
              <button onClick={() => { setDraft(null); setStatus(''); }}>Dismiss</button>
            </div>

            {!connected && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                To enable direct posting, add a <code>LINKEDIN_WEBHOOK_URL</code> (Make.com) in Settings.
              </p>
            )}
          </>
        )}

        {status && (
          <p style={{ fontSize: 13, color: status.startsWith('✓') ? 'var(--accent)' : 'var(--danger)', marginTop: 12, fontWeight: 500 }}>
            {status}
          </p>
        )}
      </div>

      {/* ── Right: History + voice ────────────────────────────────────────── */}
      <div>
        {/* Voice profile card */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Your voice profile</div>
          <VoiceProfile />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Every post you save teaches the AI your writing style.
          </div>
        </div>

        {/* Post history */}
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
          Post history ({history.length})
        </div>
        {history.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            No posts saved yet. Generate a variant and hit "Save to voice profile."
          </p>
        )}
        {history.map((p, i) => (
          <PostCard key={i} post={p} onCopy={text => copyText(text, i)} />
        ))}
        {copiedIdx !== null && copiedIdx !== 'final' && (
          <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>Copied!</p>
        )}
      </div>
    </div>
  );
}

function VoiceProfile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    apiFetch('/api/memory')
      .then(r => r.json())
      .then(d => setProfile(d.voiceProfile))
      .catch(() => {});
  }, []);

  if (!profile) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>;

  const postCount = profile.approvedDrafts?.filter(d => d.type === 'linkedin').length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[
        { label: 'Tone',          val: profile.tone },
        { label: 'Sentences',     val: profile.sentenceLength },
        { label: 'Opening style', val: profile.openingStyle },
        { label: 'Posts saved',   val: String(postCount) },
      ].map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--muted)' }}>{r.label}</span>
          <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', maxWidth: 140, textTransform: 'capitalize' }}>{r.val}</span>
        </div>
      ))}
    </div>
  );
}
