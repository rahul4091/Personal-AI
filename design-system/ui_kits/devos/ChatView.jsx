/* global React */
// Chat — asymmetric bubbles, suggestion chips, bounce loading.

const SUGGESTIONS = [
  "What do I have today?",
  "Add task: review PRs and block 2h focus time tomorrow",
  "Any urgent emails?",
  "Show my open PRs and stale Trello cards",
];

function fakeReply(text) {
  const t = text.toLowerCase();
  if (t.includes("today") || t.includes("calendar")) {
    return {
      reply: "Standup at 10:00 (15m) · Sprint planning 11:30 (1h) · Focus block 2–4pm · Sprint sync 4:30 · DSA study 8pm.",
      intents: ["calendar"],
    };
  }
  if (t.includes("email") || t.includes("urgent") || t.includes("inbox")) {
    return {
      reply: "1 P1 from ceo@company.com (Q3 numbers — needs reply today). 2 P2 — Jane on roadmap, Sam on renewal.",
      intents: ["email_triage"],
    };
  }
  if (t.includes("task") || t.includes("add")) {
    return { reply: "Added to Notion → Not started. I'll surface it in tomorrow's digest.", intents: ["task_create"] };
  }
  if (t.includes("pr") || t.includes("trello") || t.includes("stale")) {
    return { reply: "2 PRs open · #847 is 3d stale (auth refresh). 1 Trello card stale 6d (digest layout review).", intents: ["github", "trello"] };
  }
  return { reply: "Routed to general chat. I can pull from email, calendar, tasks, Notion, GitHub, or Trello — try one.", intents: ["general_chat"] };
}

function ChatView() {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const bottomRef = React.useRef(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: text, at: Date.now() }]);
    setLoading(true);
    setTimeout(() => {
      const r = fakeReply(text);
      setMessages(m => [...m, { role: "assistant", content: r.reply, intents: r.intents, at: Date.now() }]);
      setLoading(false);
    }, 700);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Chat</h2>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            style={{ fontSize: 11, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Clear history
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, minHeight: 0 }}>
        {messages.length === 0 && (
          <div style={{ paddingTop: 32 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, textAlign: "center" }}>
              Ask DevOS anything about your emails, calendar, or tasks.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGGESTIONS.map(s => (
                <Button key={s} onClick={() => send(s)} style={{ fontSize: 12 }}>{s}</Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            marginBottom: 10,
          }}>
            <div style={{
              maxWidth: "75%",
              background: m.role === "user" ? "#1D9E75" : "var(--surface)",
              color: m.role === "user" ? "#fff" : "var(--text)",
              border: m.role === "user" ? "none" : "0.5px solid var(--border)",
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              padding: "10px 14px",
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {m.content}
              {m.intents?.filter(i => i !== "general_chat").length > 0 && (
                <div style={{ fontSize: 10, marginTop: 6, opacity: 0.6 }}>
                  {m.intents.filter(i => i !== "general_chat").join(" · ")}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 7, height: 7, borderRadius: "50%", background: "var(--muted)",
                animation: `bounce 1s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Input placeholder="Ask DevOS anything…" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          disabled={loading} />
        <Button variant="primary" onClick={() => send()} disabled={loading || !input.trim()}>Send</Button>
      </div>

      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

window.ChatView = ChatView;
