/* global React */
// TopBar — DevOS green brand mark + status dots.
const { useMemo } = React;

function TopBar({ connected, health }) {
  const dotFor = (ok) => (
    <Dot color={ok ? "var(--success)" : "var(--danger)"} style={{ marginRight: 4 }} />
  );
  const items = [
    ["AI", health.gemini || health.groq],
    ["Google", connected],
    ["Notion", health.notion],
    ["GitHub", health.github],
    ["Slack", health.slack],
    ["Trello", health.trello],
  ];
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "0.5px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: "#1D9E75",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 500, fontSize: 13,
          }}
        >D</div>
        <span style={{ fontWeight: 500, fontSize: 14 }}>DevOS Agent</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--muted)" }}>
        {items.map(([label, ok]) => (
          <span key={label}>{dotFor(ok)}{label}</span>
        ))}
      </div>
    </header>
  );
}

window.TopBar = TopBar;
