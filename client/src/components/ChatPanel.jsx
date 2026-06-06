import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';
import { toast } from '../toast.jsx';

const STORAGE_KEY = 'devos_chat_history';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderContent(text) {
  if (!text) return null;
  // Simple inline formatting: **bold**, `code`, newlines
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{p.slice(1, -1)}</code>;
    if (p === '\n') return <br key={i} />;
    return p;
  });
}

const ALL_SUGGESTIONS = [
  { key: 'google',   text: 'What do I have today?'             },
  { key: 'google',   text: 'Any urgent emails needing a reply?' },
  { key: 'github',   text: 'Show my open PRs and stale issues'  },
  { key: 'todoist',  text: 'What are my open tasks today?'      },
  { key: 'slack',    text: 'Draft a Slack message to the team'  },
  { key: 'linkedin', text: 'Draft a LinkedIn post about my recent work' },
  { key: 'notion',   text: 'Show my recent notes'              },
  { key: null,       text: 'Run my morning digest'             },
];

const CONNECTED_TOOLS = [
  { key: 'google',   label: 'Gmail & Calendar', dot: '#34A853' },
  { key: 'todoist',  label: 'Todoist',          dot: '#DB4035' },
  { key: 'notion',   label: 'Notion',           dot: '#000'    },
  { key: 'github',   label: 'GitHub',           dot: '#24292f' },
  { key: 'slack',    label: 'Slack',            dot: '#611f69' },
  { key: 'linkedin', label: 'LinkedIn',         dot: '#0A66C2' },
];

export default function ChatPanel({ onAction, health = {}, connected = false }) {
  const [messages,    setMessages]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; }
  });
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [statusText, setStatusText] = useState('');
  const [useAgent,   setUseAgent]   = useState(() => localStorage.getItem('devos_use_agent') === 'true');
  const [listening,  setListening]  = useState(false);
  const bottomRef      = useRef(null);
  const textareaRef    = useRef(null);
  const recognitionRef = useRef(null);

  const SpeechRecognition = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleListening() {
    if (!SpeechRecognition) {
      toast('Voice input is not supported in this browser', 'error');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    recognitionRef.current = rec;

    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = e => {
      setListening(false);
      if (e.error !== 'aborted') toast('Mic error: ' + e.error, 'error');
    };
    rec.onresult = e => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setInput(transcript);
    };
    rec.start();
  }

  function toggleAgent() {
    setUseAgent(v => { localStorage.setItem('devos_use_agent', String(!v)); return !v; });
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: text, at: Date.now() };
    setMessages(m => [...m, userMsg]);
    setLoading(true);
    setStatusText('Connecting…');

    const token = localStorage.getItem('devos_token');
    let assistantContent = '';
    let assistantAdded   = false;

    // ── LangChain agent path (non-streaming JSON) ──
    if (useAgent) {
      setStatusText('Agent thinking…');
      try {
        const r = await apiFetch('/api/chat/agent', {
          method: 'POST',
          body:   JSON.stringify({ message: text, history: messages.slice(-12) }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Server error');
        setMessages(m => [...m, { role: 'assistant', content: data.reply || '(no reply)', intents: data.intents, at: Date.now() }]);
        (data.affectedPanels ?? []).forEach(panel => onAction?.(panel));
      } catch (err) {
        setMessages(m => [...m, { role: 'assistant', content: 'Agent error: ' + err.message, at: Date.now() }]);
      } finally {
        setLoading(false);
        setStatusText('');
      }
      return;
    }

    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ message: text, history: messages.slice(-10) }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error ?? 'Server error');
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === 'status') {
            setStatusText(data.text);

          } else if (data.type === 'token') {
            assistantContent += data.text;
            if (!assistantAdded) {
              setMessages(m => [...m, { role: 'assistant', content: assistantContent, at: Date.now() }]);
              assistantAdded = true;
            } else {
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: assistantContent };
                return copy;
              });
            }

          } else if (data.type === 'done') {
            const finalContent = assistantContent || data.reply || '';
            if (!assistantAdded) {
              setMessages(m => [...m, { role: 'assistant', content: finalContent, intents: data.intents, at: Date.now() }]);
            } else {
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: finalContent, intents: data.intents };
                return copy;
              });
            }
            (data.affectedPanels ?? []).forEach(panel => onAction?.(panel));

          } else if (data.type === 'error') {
            setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + data.text, at: Date.now() }]);
          }
        }
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong: ' + err.message, at: Date.now() }]);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    // Also wipe the server-side rolling summary so the agent starts fresh
    apiFetch('/api/chat/agent/clear', { method: 'POST' }).catch(() => {});
  }

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #1D9E75, #15805e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 14,
          }}>D</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>DevOS Agent</div>
            <div style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              {useAgent ? 'LangChain agent' : 'Online'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* LangChain agent toggle */}
          <button
            onClick={toggleAgent}
            title={useAgent ? 'Using the LangChain agent — click to switch back to the classic engine' : 'Switch to the LangChain agent'}
            style={{
              fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99,
              border: `1px solid ${useAgent ? 'var(--accent)' : 'var(--border)'}`,
              background: useAgent ? 'var(--accent)' : 'transparent',
              color: useAgent ? '#fff' : 'var(--muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: useAgent ? '#fff' : 'var(--hint)' }} />
            Agent: {useAgent ? 'ON' : 'OFF'}
          </button>
          {!isEmpty && (
            <button onClick={clearHistory} style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px', background: 'transparent' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

        {/* Empty state */}
        {isEmpty && (() => {
          const activeTools = CONNECTED_TOOLS.filter(t =>
            t.key === 'google' ? connected : !!health[t.key]
          );
          const suggestions = ALL_SUGGESTIONS.filter(s =>
            s.key === null ||
            (s.key === 'google' ? connected : !!health[s.key])
          ).slice(0, 6);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 36, paddingBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, #1D9E75, #15805e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 22,
                marginBottom: 14,
                boxShadow: '0 4px 16px rgba(29,158,117,0.25)',
              }}>D</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>How can I help?</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
                Ask me anything — emails, calendar, tasks, PRs, drafts, or your whole day.
              </div>

              {/* Connected tools */}
              {activeTools.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 22, maxWidth: 480 }}>
                  {activeTools.map(t => (
                    <span key={t.key} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, padding: '4px 10px',
                      borderRadius: 20,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--muted)',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
                      {t.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Dynamic suggestions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520 }}>
                {suggestions.map(s => (
                  <button
                    key={s.text}
                    onClick={() => { setInput(s.text); textareaRef.current?.focus(); }}
                    style={{
                      fontSize: 12, padding: '7px 14px',
                      borderRadius: 20,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
                  >
                    {s.text}
                  </button>
                ))}
              </div>

              {activeTools.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--hint)', marginTop: 16, textAlign: 'center', maxWidth: 300 }}>
                  Connect Google, GitHub, or Todoist in Settings to unlock more actions.
                </p>
              )}
            </div>
          );
        })()}

        {/* Message list */}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const showAvatar = !isUser && (i === 0 || messages[i - 1]?.role !== 'assistant');
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 8,
                marginBottom: 4,
                paddingBottom: (i === messages.length - 1 || messages[i + 1]?.role !== m.role) ? 12 : 2,
              }}
            >
              {/* Avatar — only for first assistant message in a group */}
              {!isUser && (
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: showAvatar ? 'linear-gradient(135deg, #1D9E75, #15805e)' : 'transparent',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 12,
                }}>
                  {showAvatar ? 'D' : ''}
                </div>
              )}

              {/* Bubble */}
              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: isUser ? 'var(--accent)' : 'var(--surface)',
                  color: isUser ? '#fff' : 'var(--text)',
                  border: isUser ? 'none' : '1px solid var(--border)',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.65,
                  boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                }}>
                  {renderContent(m.content)}
                  {m.intents?.filter(x => x !== 'general_chat').length > 0 && (
                    <div style={{
                      marginTop: 8,
                      display: 'flex', flexWrap: 'wrap', gap: 4,
                    }}>
                      {m.intents.filter(x => x !== 'general_chat').map(intent => (
                        <span key={intent} style={{
                          fontSize: 10, fontWeight: 500,
                          background: 'rgba(255,255,255,0.15)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 4, padding: '1px 6px',
                          opacity: 0.8,
                        }}>
                          {intent.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 3, padding: '0 2px' }}>
                  {formatTime(m.at)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing / status indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #1D9E75, #15805e)',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 12,
            }}>D</div>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '16px 16px 16px 4px',
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'inline-block',
                    animation: `typingDot 1.2s ${i * 0.2}s ease-in-out infinite`,
                  }} />
                ))}
              </span>
              {statusText && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{statusText}</span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '10px 12px',
        display: 'flex', alignItems: 'flex-end', gap: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        marginTop: 8,
      }}>
        <textarea
          ref={textareaRef}
          placeholder="Message DevOS…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text)',
            fontFamily: 'inherit',
            padding: 0,
            overflowY: 'auto',
            maxHeight: 160,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Mic button */}
          <button
            onClick={toggleListening}
            title={listening ? 'Stop listening' : 'Voice input'}
            style={{
              width: 34, height: 34, borderRadius: 10, padding: 0,
              border: `1px solid ${listening ? '#D85A30' : 'var(--border)'}`,
              background: listening ? '#fff3f0' : 'transparent',
              color: listening ? '#D85A30' : 'var(--hint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {listening ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            )}
          </button>

          {/* Send button */}
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              width: 34, height: 34,
              borderRadius: 10,
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg)',
              border: '1px solid ' + (input.trim() && !loading ? 'var(--accent)' : 'var(--border)'),
              color: input.trim() && !loading ? '#fff' : 'var(--hint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, padding: 0,
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
            }}
          >
            {loading ? (
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            ) : '↑'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--hint)', textAlign: 'right', marginTop: 5 }}>
        {listening ? '🔴 Listening… click ■ to stop' : 'Enter to send · Shift+Enter for new line · mic for voice'}
      </div>

      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
