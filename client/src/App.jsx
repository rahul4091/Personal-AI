import { useState, useEffect, useRef, useCallback } from 'react';
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
import NavBar          from './components/NavBar.jsx';
import AuthPage        from './AuthPage.jsx';
import OnboardingWizard from './OnboardingWizard.jsx';
import SettingsPage     from './SettingsPage.jsx';

const navItems = [
  { id: 'digest',   label: "Today's digest", dot: '#888780' },
  { id: 'comms',    label: 'Comms',          dot: '#1D9E75' },
  { id: 'calendar', label: 'Calendar',       dot: '#7F77DD' },
  { id: 'tasks',    label: 'Tasks',          dot: '#D85A30' },
  { id: 'github',   label: 'GitHub',         dot: '#24292f' },
  { id: 'linkedin', label: 'LinkedIn',       dot: '#0A66C2' },
  { id: 'slack',    label: 'Slack',          dot: '#611f69' },
  { id: 'chat',     label: 'Chat',           dot: '#378ADD' },
  { id: 'settings', label: 'Settings',       dot: null },
];

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

  async function handleConnectGoogle() {
    try {
      const r = await apiFetch('/api/auth/google/init');
      if (r.status === 401) { handleLogout(); return; }
      const data = await r.json();
      if (data.url) window.location.href = data.url;
    } catch { /* network error — silently ignore */ }
  }

  function fetchHealth() {
    fetch('/api/health', { headers: { Authorization: `Bearer ${localStorage.getItem('devos_token')}` } })
      .then(r => r.json())
      .then(d => { setHealth(d); setConnected(d.google); })
      .catch(() => {});
  }

  function handleViewChange(newView) {
    if (view === 'settings') fetchHealth();
    setView(newView);
  }

  function handleChatAction(panel) {
    if (panel === 'tasks')    setTaskRefreshKey(k => k + 1);
    if (panel === 'calendar') setCalendarRefreshKey(k => k + 1);
    if (panel === 'github')   setGithubRefreshKey(k => k + 1);
    if (panel === 'comms')    setEmailRefreshKey(k => k + 1);
    if (panel === 'digest')   setDigestRefreshKey(k => k + 1);
  }

  const lastRefreshRef = useRef(Date.now());

  const refreshAll = useCallback(() => {
    lastRefreshRef.current = Date.now();
    setTaskRefreshKey(k => k + 1);
    setCalendarRefreshKey(k => k + 1);
    setGithubRefreshKey(k => k + 1);
    setEmailRefreshKey(k => k + 1);
    setDigestRefreshKey(k => k + 1);
    fetch('/api/health', { headers: { Authorization: `Bearer ${localStorage.getItem('devos_token')}` } })
      .then(r => r.json())
      .then(d => { setHealth(d); setConnected(d.google); })
      .catch(() => {});
  }, []);

  // Auto-refresh: on tab focus (if away >5 min) + every 10 min while active
  useEffect(() => {
    if (!isLoggedIn) return;

    const STALE_MS = 5 * 60 * 1000;
    const INTERVAL_MS = 10 * 60 * 1000;

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRefreshRef.current > STALE_MS) {
          refreshAll();
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshAll();
    }, INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(timer);
    };
  }, [isLoggedIn, refreshAll]);

  useEffect(() => {
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

    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('google_token');
    if (googleToken) {
      localStorage.setItem('devos_token', googleToken);
      window.history.replaceState({}, '', '/');
      fetch('/api/users/me', { headers: { Authorization: `Bearer ${googleToken}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => { if (u) { setUser(u); setIsLoggedIn(true); setAuthChecked(true); } })
        .catch(() => {});
      // Fetch health with the new token so connected state updates immediately
      fetch('/api/health', { headers: { Authorization: `Bearer ${googleToken}` } })
        .then(r => r.json())
        .then(d => { setHealth(d); setConnected(d.google); })
        .catch(() => {});
      return;
    }

    // Always pass the token — health endpoint requires auth
    const storedToken = localStorage.getItem('devos_token');
    if (storedToken) {
      fetch('/api/health', { headers: { Authorization: `Bearer ${storedToken}` } })
        .then(r => r.json())
        .then(d => { setHealth(d); setConnected(d.google); })
        .catch(() => {});
    }

    if (window.location.search.includes('connected=true')) {
      setConnected(true);
      if (localStorage.getItem('devos_onboarding') !== 'true') {
        window.history.replaceState({}, '', '/');
      }
    }
    if (window.location.search.includes('google_connected=true')) {
      setConnected(true);
      setView('settings');
    }
  }, []);

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--hint)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }
  if (!user) return <AuthPage onAuth={handleAuth} />;
  if (showOnboarding) return <OnboardingWizard user={user} onComplete={handleOnboardingComplete} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        connected={connected}
        health={health}
        user={user}
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
        onConnectGoogle={handleConnectGoogle}
      />
      <NavBar view={view} setView={handleViewChange} navItems={navItems} />

      <main style={{ flex: 1, overflow: 'auto', padding: '28px 40px' }}>
        <div style={{ display: view === 'digest'   ? 'block' : 'none' }}><DigestPanel refreshKey={digestRefreshKey} onGoToSettings={() => handleViewChange('settings')} /></div>
        <div style={{ display: view === 'comms'    ? 'block' : 'none' }}><EmailPanel connected={connected} refreshKey={emailRefreshKey} onConnectGoogle={handleConnectGoogle} onGoToSettings={() => handleViewChange('settings')} /></div>
        <div style={{ display: view === 'calendar' ? 'block' : 'none' }}><CalendarPanel connected={connected} refreshKey={calendarRefreshKey} onConnectGoogle={handleConnectGoogle} onGoToSettings={() => handleViewChange('settings')} /></div>
        <div style={{ display: view === 'tasks'    ? 'block' : 'none' }}><TaskPanel refreshKey={taskRefreshKey} onGoToSettings={() => handleViewChange('settings')} /></div>
        <div style={{ display: view === 'github'   ? 'block' : 'none' }}><GitHubPanel health={health} refreshKey={githubRefreshKey} onGoToSettings={() => handleViewChange('settings')} /></div>
        <div style={{ display: view === 'linkedin' ? 'block' : 'none' }}><LinkedInPanel health={health} /></div>
        <div style={{ display: view === 'slack'    ? 'block' : 'none' }}><SlackPanel health={health} onGoToSettings={() => handleViewChange('settings')} /></div>
        <div style={{ display: view === 'chat'     ? 'block' : 'none', height: '100%' }}><ChatPanel onAction={handleChatAction} health={health} connected={connected} /></div>
        {view === 'settings' && <SettingsPage user={user} onLogout={handleLogout} health={health} />}
      </main>
    </div>
  );
}
