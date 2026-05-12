export default function TopBar({ connected, health }) {
  const dot = ok => (
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? 'var(--success)' : 'var(--danger)', display: 'inline-block', marginRight: 4 }} />
  );

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', borderBottom: '0.5px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 500, fontSize: 13 }}>D</div>
        <span style={{ fontWeight: 500, fontSize: 14 }}>DevOS Agent</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
        <span>{dot(health.gemini || health.groq)} AI</span>
        <span>{dot(connected)} Google</span>
        <span>{dot(health.todoist)} Todoist</span>
        {health.linkedin !== undefined && <span>{dot(health.linkedin)} LinkedIn</span>}
        {health.notion   !== undefined && <span>{dot(health.notion)}   Notion</span>}
        {health.github   !== undefined && <span>{dot(health.github)}   GitHub</span>}
        {health.slack    !== undefined && <span>{dot(health.slack)}    Slack</span>}
        {health.trello   !== undefined && <span>{dot(health.trello)}   Trello</span>}
      </div>
    </header>
  );
}
