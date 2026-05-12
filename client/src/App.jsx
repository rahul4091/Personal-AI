import { useState, useEffect } from 'react';
import ChatPanel     from './components/ChatPanel.jsx';
import EmailPanel    from './components/EmailPanel.jsx';
import CalendarPanel from './components/CalendarPanel.jsx';
import TaskPanel     from './components/TaskPanel.jsx';
import DigestPanel   from './components/DigestPanel.jsx';
import LinkedInPanel from './components/LinkedInPanel.jsx';
import GitHubPanel   from './components/GitHubPanel.jsx';
import SlackPanel    from './components/SlackPanel.jsx';
import TopBar        from './components/TopBar.jsx';

const VIEWS = ['digest', 'comms', 'calendar', 'tasks', 'content', 'chat'];

export default function App() {
  const [view,           setView]           = useState('digest');
  const [connected,      setConnected]      = useState(false);
  const [health,         setHealth]         = useState({});
  const [taskRefreshKey,     setTaskRefreshKey]     = useState(0);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  function handleChatAction(panel) {
    if (panel === 'tasks')    setTaskRefreshKey(k => k + 1);
    if (panel === 'calendar') setCalendarRefreshKey(k => k + 1);
  }

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { setHealth(d); setConnected(d.google); })
      .catch(() => {});

    // Check for OAuth redirect
    if (window.location.search.includes('connected=true')) {
      setConnected(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const navItems = [
    { id: 'digest',   label: "Today's digest", dot: '#888780' },
    { id: 'comms',    label: 'Comms',      dot: '#1D9E75' },
    { id: 'calendar', label: 'Calendar',   dot: '#7F77DD' },
    { id: 'tasks',    label: 'Tasks',      dot: '#D85A30' },
    { id: 'github',   label: 'GitHub',     dot: '#24292f' },
    { id: 'linkedin', label: 'LinkedIn',   dot: '#0A66C2' },
    { id: 'slack',    label: 'Slack',      dot: '#611f69' },
    { id: 'chat',     label: 'Chat',       dot: '#378ADD' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr', minHeight: '100vh' }}>
      <TopBar connected={connected} health={health} />

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}>

        {/* Sidebar */}
        <aside style={{ background: 'var(--surface)', borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '8px 0' }}>

          <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Navigation</div>

          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', margin: '1px 4px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: view === n.id ? 'var(--bg)' : 'transparent',
                color: view === n.id ? 'var(--text)' : 'var(--muted)',
                fontWeight: view === n.id ? 500 : 400,
                textAlign: 'left',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.dot, flexShrink: 0 }} />
              {n.label}
            </button>
          ))}

          <div style={{ marginTop: 'auto', padding: '8px' }}>
            {!connected && (
              <a href="/api/auth/google">
                <button className="primary" style={{ width: '100%', fontSize: 12 }}>
                  Connect Google
                </button>
              </a>
            )}
            {connected && (
              <div style={{ fontSize: 11, color: 'var(--success)', textAlign: 'center', padding: '6px 0' }}>
                ● Google connected
              </div>
            )}
          </div>
        </aside>

        {/* Main panel — keep all mounted so data isn't re-fetched on every tab switch */}
        <main style={{ overflow: 'auto', padding: 16, position: 'relative' }}>
          <div style={{ display: view === 'digest'   ? 'block' : 'none' }}><DigestPanel /></div>
          <div style={{ display: view === 'comms'    ? 'block' : 'none' }}><EmailPanel connected={connected} /></div>
          <div style={{ display: view === 'calendar' ? 'block' : 'none' }}><CalendarPanel connected={connected} refreshKey={calendarRefreshKey} /></div>
          <div style={{ display: view === 'tasks'    ? 'block' : 'none' }}><TaskPanel refreshKey={taskRefreshKey} /></div>
          <div style={{ display: view === 'github'   ? 'block' : 'none' }}><GitHubPanel health={health} /></div>
          <div style={{ display: view === 'linkedin' ? 'block' : 'none' }}><LinkedInPanel health={health} /></div>
          <div style={{ display: view === 'slack'    ? 'block' : 'none' }}><SlackPanel health={health} /></div>
          <div style={{ display: view === 'chat'     ? 'block' : 'none' }}><ChatPanel onAction={handleChatAction} /></div>
        </main>

      </div>
    </div>
  );
}
