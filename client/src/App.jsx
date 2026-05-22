import { useState, useEffect } from 'react';
import { apiFetch } from './api.js';
import ChatPanel       from './components/ChatPanel.jsx';
import EmailPanel      from './components/EmailPanel.jsx';
import CalendarPanel   from './components/CalendarPanel.jsx';
import TaskPanel       from './components/TaskPanel.jsx';
import DigestPanel     from './components/DigestPanel.jsx';
import LinkedInPanel   from './components/LinkedInPanel.jsx';
import GitHubPanel     from './components/GitHubPanel.jsx';
import SlackPanel      from './components/SlackPanel.jsx';
import TopBar          from './components/TopBar.jsx';
import AuthPage        from './AuthPage.jsx';
import OnboardingWizard from './OnboardingWizard.jsx';
import SettingsPage     from './SettingsPage.jsx';

const VIEWS = ['digest', 'comms', 'calendar', 'tasks', 'content', 'chat'];

export default function App() {
  const [view,           setView]           = useState('digest');
  const [connected,      setConnected]      = useState(false);
  const [health,         setHealth]         = useState({});
  const [taskRefreshKey,     setTaskRefreshKey]     = useState(0);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [githubRefreshKey,   setGithubRefreshKey]   = useState(0);
  const [emailRefreshKey,    setEmailRefreshKey]    = useState(0);
  const [digestRefreshKey,   setDigestRefreshKey]   = useState(0);

  const [user,           setUser]           = useState(null);
  const [authChecked,    setAuthChecked]    = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoggedIn,     setIsLoggedIn]     = useState(false);

  function handleAuth(newUser, isSignup) {
    setUser(newUser);
    setIsLoggedIn(true);
    if (isSignup) {
      localStorage.setItem('devos_onboarding', 'true');
      setShowOnboarding(true);
    }
  }

  function handleOnboardingComplete() {
    localStorage.removeItem('devos_onboarding');
    setShowOnboarding(false);
  }

  function handleLogout() {
    localStorage.removeItem('devos_token');
    localStorage.removeItem('devos_onboarding');
    setUser(null);
    setIsLoggedIn(false);
  }

  function handleChatAction(panel) {
    if (panel === 'tasks')    setTaskRefreshKey(k => k + 1);
    if (panel === 'calendar') setCalendarRefreshKey(k => k + 1);
    if (panel === 'github')   setGithubRefreshKey(k => k + 1);
    if (panel === 'comms')    setEmailRefreshKey(k => k + 1);
    if (panel === 'digest')   setDigestRefreshKey(k => k + 1);
  }

  useEffect(() => {
    // ── 1. Verify stored token ───────────────────────────────────────────────
    const token = localStorage.getItem('devos_token');
    if (token) {
      fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => {
          if (u) {
            setUser(u);
            setIsLoggedIn(true);
            if (localStorage.getItem('devos_onboarding') === 'true') setShowOnboarding(true);
          } else {
            localStorage.removeItem('devos_token');
            localStorage.removeItem('devos_onboarding');
          }
          setAuthChecked(true);
        })
        .catch(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }

    // ── 2. Health check ──────────────────────────────────────────────────────
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { setHealth(d); setConnected(d.google); })
      .catch(() => {});

    // ── 3. Google sign-in redirect (token in URL) ────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('google_token');
    if (googleToken) {
      localStorage.setItem('devos_token', googleToken);
      window.history.replaceState({}, '', '/');
      fetch('/api/users/me', { headers: { Authorization: `Bearer ${googleToken}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => { if (u) { setUser(u); setIsLoggedIn(true); setAuthChecked(true); } })
        .catch(() => {});
      return;
    }

    // ── 4. Google OAuth redirect ─────────────────────────────────────────────
    if (window.location.search.includes('connected=true')) {
      setConnected(true);
      // Don't clear the URL here — OnboardingWizard handles it when active.
      if (localStorage.getItem('devos_onboarding') !== 'true') {
        window.history.replaceState({}, '', '/');
      }
    }
    // Settings-specific OAuth return (google_connected=true → handled by SettingsPage)
    if (window.location.search.includes('google_connected=true')) {
      setConnected(true);
      setView('settings');
    }
  }, []);

  // ─── Auth gate ──────────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--hint)', fontSize: 'var(--fs-base)' }}>
        Loading…
      </div>
    );
  }
  if (!user) return <AuthPage onAuth={handleAuth} />;
  if (showOnboarding) return <OnboardingWizard user={user} onComplete={handleOnboardingComplete} />;

  const navItems = [
    { id: 'digest',   label: "Today's digest", dot: '#888780' },
    { id: 'comms',    label: 'Comms',      dot: '#1D9E75' },
    { id: 'calendar', label: 'Calendar',   dot: '#7F77DD' },
    { id: 'tasks',    label: 'Tasks',      dot: '#D85A30' },
    { id: 'github',   label: 'GitHub',     dot: '#24292f' },
    { id: 'linkedin', label: 'LinkedIn',   dot: '#0A66C2' },
    { id: 'slack',    label: 'Slack',      dot: '#611f69' },
    { id: 'chat',     label: 'Chat',       dot: '#378ADD' },
    { id: 'settings', label: 'Settings',   dot: '#888780' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr', minHeight: '100vh' }}>
      <TopBar connected={connected} health={health} />

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}>

        {/* Sidebar */}
        <aside style={{ background: 'var(--surface)', borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '8px 0' }}>

          <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Navigation</div>

          {navItems.filter(n => n.id !== 'settings').map(n => (
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

          <div style={{ marginTop: 'auto' }}>
            <div style={{ height: '0.5px', background: 'var(--border)', margin: '4px 0' }} />
            <button
              onClick={() => setView('settings')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', margin: '1px 4px',
                borderRadius: 'var(--radius)',
                border: 'none', width: 'calc(100% - 8px)',
                background: view === 'settings' ? 'var(--bg)' : 'transparent',
                color: view === 'settings' ? 'var(--text)' : 'var(--muted)',
                fontWeight: view === 'settings' ? 500 : 400,
                textAlign: 'left',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#888780', flexShrink: 0 }} />
              Settings
            </button>

            {/* Google connection */}
            {!connected && (
              <div style={{ padding: '6px 8px 2px' }}>
                <button
                  className="primary"
                  style={{ width: '100%', fontSize: 12 }}
                  onClick={async () => {
                    const r = await apiFetch('/api/auth/google/init');
                    const { url } = await r.json();
                    window.location.href = url;
                  }}
                >
                  Connect Google
                </button>
              </div>
            )}
            {connected && (
              <div style={{ fontSize: 11, color: 'var(--success)', textAlign: 'center', padding: '4px 0' }}>
                ● Google connected
              </div>
            )}

            {/* User login / logout */}
            <div style={{ height: '0.5px', background: 'var(--border)', margin: '6px 0 4px' }} />
            {isLoggedIn ? (
              <div style={{ padding: '4px 8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{user.username}
                </span>
                <button
                  onClick={handleLogout}
                  style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}
                >
                  Log out
                </button>
              </div>
            ) : (
              <div style={{ padding: '4px 8px 6px' }}>
                <button
                  onClick={() => setUser(null)}
                  className="primary"
                  style={{ width: '100%', fontSize: 12 }}
                >
                  Log in
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main panel — keep all mounted so data isn't re-fetched on every tab switch */}
        <main style={{ overflow: 'auto', padding: 16, position: 'relative' }}>
          <div style={{ display: view === 'digest'   ? 'block' : 'none' }}><DigestPanel refreshKey={digestRefreshKey} /></div>
          <div style={{ display: view === 'comms'    ? 'block' : 'none' }}><EmailPanel connected={connected} refreshKey={emailRefreshKey} /></div>
          <div style={{ display: view === 'calendar' ? 'block' : 'none' }}><CalendarPanel connected={connected} refreshKey={calendarRefreshKey} /></div>
          <div style={{ display: view === 'tasks'    ? 'block' : 'none' }}><TaskPanel refreshKey={taskRefreshKey} /></div>
          <div style={{ display: view === 'github'   ? 'block' : 'none' }}><GitHubPanel health={health} refreshKey={githubRefreshKey} /></div>
          <div style={{ display: view === 'linkedin' ? 'block' : 'none' }}><LinkedInPanel health={health} /></div>
          <div style={{ display: view === 'slack'    ? 'block' : 'none' }}><SlackPanel health={health} /></div>
          <div style={{ display: view === 'chat'     ? 'block' : 'none' }}><ChatPanel onAction={handleChatAction} /></div>
          {view === 'settings' && <SettingsPage user={user} onLogout={handleLogout} />}
        </main>

      </div>
    </div>
  );
}
