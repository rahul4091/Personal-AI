const ICONS = {
  digest: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1.2"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2"/>
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2"/>
    </svg>
  ),
  comms: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="13" height="9" rx="1.5"/>
      <path d="M1 5l6.5 4.5L14 5"/>
    </svg>
  ),
  calendar: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2.5" width="13" height="11" rx="1.5"/>
      <path d="M5 1v3M10 1v3M1 7h13"/>
    </svg>
  ),
  tasks: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5h11M2 7.5h7M2 10.5h5"/>
      <circle cx="12" cy="10.5" r="2.2"/>
      <path d="M11.2 10.5l.7.7 1.3-1.3"/>
    </svg>
  ),
  github: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <path d="M7.5 0C3.36 0 0 3.36 0 7.5c0 3.32 2.15 6.12 5.13 7.12.37.07.51-.16.51-.36 0-.18-.01-.77-.01-1.4-1.88.35-2.37-.46-2.52-.88-.08-.21-.45-.88-.77-1.06-.26-.14-.64-.49-.01-.5.59-.01 1.01.55 1.15.77.67 1.13 1.75.81 2.19.62.07-.49.26-.82.47-1.01-1.67-.19-3.41-.84-3.41-3.71 0-.82.29-1.49.77-2.02-.08-.19-.34-.96.07-1.99 0 0 .63-.2 2.06.77.6-.17 1.24-.25 1.88-.25.64 0 1.28.08 1.88.25 1.43-.97 2.06-.77 2.06-.77.41 1.03.15 1.8.07 1.99.48.53.77 1.2.77 2.02 0 2.88-1.75 3.52-3.42 3.71.27.23.5.68.5 1.38 0 1-.01 1.8-.01 2.05 0 .2.14.44.51.36C12.85 13.62 15 10.82 15 7.5 15 3.36 11.64 0 7.5 0z"/>
    </svg>
  ),
  linkedin: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <path d="M1.5 0A1.5 1.5 0 000 1.5v12A1.5 1.5 0 001.5 15h12a1.5 1.5 0 001.5-1.5v-12A1.5 1.5 0 0013.5 0h-12zm2.44 11.5H2.16V5.78h1.78V11.5zm-.89-6.52a1.03 1.03 0 110-2.06 1.03 1.03 0 010 2.06zm8.45 6.52h-1.78V8.67c0-.66-.01-1.52-.93-1.52-.93 0-1.07.72-1.07 1.47V11.5H6.94V5.78h1.71v.78h.02c.24-.45.82-.93 1.68-.93 1.8 0 2.13 1.18 2.13 2.72V11.5z"/>
    </svg>
  ),
  slack: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5 1.5A1.5 1.5 0 013.5 3v4A1.5 1.5 0 016.5 7V3A1.5 1.5 0 005 1.5z"/>
      <path d="M10 1.5A1.5 1.5 0 008.5 3v4A1.5 1.5 0 0011.5 7V3A1.5 1.5 0 0010 1.5z"/>
      <path d="M13.5 5A1.5 1.5 0 0012 3.5H8A1.5 1.5 0 008 6.5h4A1.5 1.5 0 0013.5 5z"/>
      <path d="M13.5 10A1.5 1.5 0 0012 8.5H8A1.5 1.5 0 008 11.5h4A1.5 1.5 0 0013.5 10z"/>
      <path d="M1.5 10A1.5 1.5 0 003 11.5h4A1.5 1.5 0 007 8.5H3A1.5 1.5 0 001.5 10z"/>
      <path d="M5 13.5A1.5 1.5 0 006.5 12V8A1.5 1.5 0 003.5 8v4A1.5 1.5 0 005 13.5z"/>
      <path d="M10 13.5A1.5 1.5 0 0011.5 12V8A1.5 1.5 0 008.5 8v4A1.5 1.5 0 0010 13.5z"/>
    </svg>
  ),
  chat: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 1H2a1 1 0 00-1 1v7.5a1 1 0 001 1h3l2.5 3 2.5-3H13a1 1 0 001-1V2a1 1 0 00-1-1z"/>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="7.5" r="2.2"/>
      <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.1 3.1l1.06 1.06M10.84 10.84l1.06 1.06M3.1 11.9l1.06-1.06M10.84 4.16l1.06-1.06"/>
    </svg>
  ),
  admin: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1L2 3.5V8c0 3.04 2.46 5.5 5.5 5.5S13 11.04 13 8V3.5L7.5 1z"/>
      <path d="M5.5 7.5l1.5 1.5 3-3"/>
    </svg>
  ),
};

const ID_TO_ICON = {
  digest: 'digest', comms: 'comms', calendar: 'calendar', tasks: 'tasks',
  github: 'github', linkedin: 'linkedin', slack: 'slack', chat: 'chat',
  settings: 'settings', admin: 'admin',
};

function NavItem({ id, label, active, onClick, dot }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        width: '100%', padding: '7px 14px 7px 12px',
        border: 'none', borderRadius: 7,
        margin: '1px 0',
        background: active ? 'var(--sidebar-active-bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--sidebar-item-color)',
        fontWeight: active ? 500 : 400,
        fontSize: 13,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.1s, color 0.1s',
        position: 'relative',
        lineHeight: 1,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sidebar-hover-bg)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ opacity: active ? 1 : 0.65, flexShrink: 0, display: 'flex', color: active && dot ? dot : 'currentColor' }}>
        {ICONS[ID_TO_ICON[id]] ?? null}
      </span>
      {label}
    </button>
  );
}

function ServiceDot({ label, ok }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--sidebar-item-color)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? '#22c55e' : '#e5392a', flexShrink: 0 }} />
      {label}
    </span>
  );
}

export default function Sidebar({ view, setView, navItems, user, health, connected, onLogout, onConnectGoogle }) {
  const mainItems = navItems.filter(n => !['settings', 'admin'].includes(n.id));
  const bottomItems = navItems.filter(n => ['settings', 'admin'].includes(n.id));

  const services = [
    { label: 'AI',     ok: health.gemini || health.groq },
    { label: 'Google', ok: connected },
    { label: 'GitHub', ok: health.github },
    { label: 'Notion', ok: health.notion },
    { label: 'Slack',  ok: health.slack },
  ];

  return (
    <aside style={{
      width: 220,
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--sidebar-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
          letterSpacing: '-0.02em',
        }}>D</div>
        <span style={{ fontWeight: 650, fontSize: 14.5, color: 'var(--text)', letterSpacing: '-0.02em' }}>DevOS</span>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 0' }}>
        {mainItems.map(n => (
          <NavItem key={n.id} {...n} active={view === n.id} onClick={() => setView(n.id)} />
        ))}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '6px 16px' }} />

      {/* Bottom nav */}
      <div style={{ padding: '0 8px 4px' }}>
        {bottomItems.map(n => (
          <NavItem key={n.id} {...n} active={view === n.id} onClick={() => setView(n.id)} />
        ))}
      </div>

      {/* Service status */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--sidebar-border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 8px' }}>
          {services.map(s => <ServiceDot key={s.label} {...s} />)}
        </div>
        {!connected && (
          <button
            onClick={onConnectGoogle}
            style={{
              marginTop: 8, width: '100%', fontSize: 11, padding: '5px 8px',
              borderRadius: 6, border: '1px solid var(--sidebar-border)',
              background: 'transparent', color: 'var(--sidebar-item-color)',
              cursor: 'pointer', textAlign: 'center',
            }}
          >
            + Connect Google
          </button>
        )}
      </div>

      {/* User */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'var(--sidebar-avatar-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', fontWeight: 600, fontSize: 11, flexShrink: 0,
        }}>
          {user?.username?.charAt(0).toUpperCase()}
        </div>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--sidebar-item-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          @{user?.username}
        </span>
        <button
          onClick={onLogout}
          title="Log out"
          style={{
            padding: '3px 7px', fontSize: 11, borderRadius: 5,
            border: '1px solid var(--sidebar-border)',
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ↩
        </button>
      </div>
    </aside>
  );
}
