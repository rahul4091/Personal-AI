import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'devos_chat_history';

export default function ChatPanel({ onAction }) {
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; }
  });
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: text, at: Date.now() };
    setMessages(m => [...m, userMsg]);
    setLoading(true);

    try {
      const r    = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages.slice(-10) }),
      });
      const data = await r.json();
      const assistantMsg = { role: 'assistant', content: data.reply, intents: data.intents, at: Date.now() };
      setMessages(m => [...m, assistantMsg]);
      (data.affectedPanels ?? []).forEach(panel => onAction?.(panel));
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + err.message, at: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  const suggestions = [
    'What do I have today?',
    'Add task: review PRs and block 2h focus time tomorrow',
    'Any urgent emails?',
    'Show my open PRs and stale Trello cards',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Chat</h2>
        {messages.length > 0 && <button onClick={clearHistory} style={{ fontSize: 11, color: 'var(--muted)' }}>Clear history</button>}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ paddingTop: 32 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, textAlign: 'center' }}>Ask DevOS anything about your emails, calendar, or tasks.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => { setInput(s); }} style={{ fontSize: 12 }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 10,
          }}>
            <div style={{
              maxWidth: '75%',
              background: m.role === 'user' ? '#1D9E75' : 'var(--surface)',
              color:      m.role === 'user' ? '#fff' : 'var(--text)',
              border:     m.role === 'user' ? 'none' : '0.5px solid var(--border)',
              borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
              {m.intents?.filter(i => i !== 'general_chat').length > 0 && (
                <div style={{ fontSize: 10, marginTop: 6, opacity: .6 }}>
                  {m.intents.filter(i => i !== 'general_chat').join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)',
                animation: `bounce 1s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Ask DevOS anything…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button className="primary" onClick={send} disabled={loading || !input.trim()}>Send</button>
      </div>

      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}
