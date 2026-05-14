/* global React */
// Sidebar — 200px fixed nav with colored dots.

function Sidebar({ view, setView, connected, setConnected }) {
  const navItems = [
    { id: "digest",   label: "Today's digest", dot: "#888780" },
    { id: "comms",    label: "Comms",          dot: "#1D9E75" },
    { id: "calendar", label: "Calendar",       dot: "#7F77DD" },
    { id: "tasks",    label: "Tasks",          dot: "#D85A30" },
    { id: "github",   label: "GitHub",         dot: "#24292f" },
    { id: "linkedin", label: "LinkedIn",       dot: "#0A66C2" },
    { id: "slack",    label: "Slack",          dot: "#611f69" },
    { id: "chat",     label: "Chat",           dot: "#378ADD" },
  ];

  return (
    <aside
      style={{
        background: "var(--surface)",
        borderRight: "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "8px 0",
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          fontSize: 10,
          fontWeight: 500,
          color: "var(--hint)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginBottom: 4,
        }}
      >
        Navigation
      </div>

      {navItems.map((n) => (
        <button
          key={n.id}
          onClick={() => setView(n.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            margin: "1px 4px",
            borderRadius: "var(--radius)",
            border: "none",
            background: view === n.id ? "var(--bg)" : "transparent",
            color: view === n.id ? "var(--text)" : "var(--muted)",
            fontWeight: view === n.id ? 500 : 400,
            textAlign: "left",
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: n.dot,
              flexShrink: 0,
            }}
          />
          {n.label}
        </button>
      ))}

      <div style={{ marginTop: "auto", padding: 8 }}>
        {!connected ? (
          <Button
            variant="primary"
            style={{ width: "100%", fontSize: 12 }}
            onClick={() => setConnected(true)}
          >
            Connect Google
          </Button>
        ) : (
          <div
            style={{
              fontSize: 11,
              color: "var(--success)",
              textAlign: "center",
              padding: "6px 0",
            }}
          >
            ● Google connected
          </div>
        )}
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
