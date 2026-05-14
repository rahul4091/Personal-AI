/* global React */
// Comms — triaged inbox with expandable Gmail-style reader.

const SAMPLE_EMAILS = [
  {
    id: "e1",
    priority: "P1",
    from: "Alex Chen <ceo@company.com>",
    subject: "Urgent — Q3 numbers",
    snippet: "Need the deck before tomorrow's board sync. Can you slot 30 min today?",
    date: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    intent: "Needs reply — VIP sender",
    body: "Hey,\n\nNeed the deck before tomorrow's board sync. Can you slot 30 min today to walk me through?\n\nPaste the latest pipeline numbers + one slide on the Acme expansion.\n\nThanks,\nAlex",
  },
  {
    id: "e2",
    priority: "P2",
    from: "Jane Park <jane@acme.com>",
    subject: "Q3 roadmap review",
    snippet: "Looped in product. Feedback on the staging cohort is mixed but…",
    date: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    intent: "Needs decision by Thursday",
    body: "Hi,\n\nLooped in product. Feedback on the staging cohort is mixed but trending positive on the retention curves.\n\nWant to land on Q3 priorities by Thursday. Reply when you can.\n\nThanks,\nJane",
  },
  {
    id: "e3",
    priority: "P2",
    from: "Sam Liu <sam@vendor.io>",
    subject: "Renewal contract draft",
    snippet: "Attached the updated terms — 30 day reply window.",
    date: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    intent: "30-day reply window",
  },
  {
    id: "e4",
    priority: "P3",
    from: "GitHub <noreply@github.com>",
    subject: "PR #847 has been waiting 3 days",
    snippet: "Reminder: auth-refresh-tokens is awaiting review.",
    date: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    intent: "Automated — low priority",
  },
];

function CommsView() {
  const [emails, setEmails] = React.useState(SAMPLE_EMAILS);
  const [openId, setOpenId] = React.useState("e1");
  const [loading, setLoading] = React.useState(false);

  function openEmail(id) {
    setOpenId(openId === id ? null : id);
  }

  function archive(id, e) {
    e.stopPropagation();
    setEmails(prev => prev.filter(x => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  function refresh() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setEmails(SAMPLE_EMAILS); }, 700);
  }

  const priorityColor = p =>
    p === "P1" ? "var(--danger)" : p === "P2" ? "var(--warning)" : "var(--hint)";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Comms — triaged inbox</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--hint)" }}>cached 4m ago</span>
          <Button onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
        </div>
      </div>

      {emails.map(email => {
        const isOpen = openId === email.id;
        return (
          <div
            key={email.id}
            style={{
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              borderLeft: `3px solid ${priorityColor(email.priority)}`,
              borderRadius: "0 var(--radius) var(--radius) 0",
              marginBottom: 8,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => openEmail(email.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {email.subject}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {email.from}
                  {!isOpen && email.snippet && (
                    <span style={{ color: "var(--hint)", marginLeft: 6 }}>— {email.snippet.slice(0, 60)}…</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--hint)" }}>
                  {new Date(email.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    display: "inline-block",
                    transform: isOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                >▾</span>
              </div>
            </div>

            {isOpen && (
              <div onClick={e => e.stopPropagation()} style={{ borderTop: "0.5px solid var(--border)" }}>
                <div style={{ padding: "14px 20px 0", background: "#fff" }}>
                  <div style={{ fontSize: 20, fontWeight: 400, color: "#202124", marginBottom: 12 }}>
                    {email.subject}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 16,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: "#1a73e8", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 15, fontWeight: 500,
                        }}
                      >
                        {email.from.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#202124" }}>
                          {email.from.replace(/<.*>/, "").trim()}
                        </div>
                        <div style={{ fontSize: 11, color: "#5f6368", marginTop: 2 }}>{email.from}</div>
                        <div style={{ fontSize: 11, color: "#5f6368" }}>to me</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#5f6368", whiteSpace: "nowrap", marginTop: 4 }}>
                      {new Date(email.date).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>

                <pre
                  style={{
                    margin: 0,
                    padding: "0 20px 20px",
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "#202124",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                    background: "#fff",
                  }}
                >
                  {email.body || email.snippet}
                </pre>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 20px 14px",
                    background: "#fff",
                    borderTop: "0.5px solid var(--border)",
                  }}
                >
                  {email.intent && (
                    <span style={{ fontSize: 11, color: "#5f6368", flex: 1 }}>{email.intent}</span>
                  )}
                  <Button onClick={e => archive(email.id, e)} style={{ marginLeft: "auto", color: "var(--muted)" }}>
                    Archive
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {emails.length === 0 && (
        <p style={{ color: "var(--muted)", textAlign: "center", paddingTop: 40 }}>Inbox clear ✓</p>
      )}
    </div>
  );
}

window.CommsView = CommsView;
