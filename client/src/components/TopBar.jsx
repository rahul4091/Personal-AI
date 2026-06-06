export default function TopBar({ connected, health, user, isLoggedIn, onLogout, onConnectGoogle }) {
  const statusDot = ok => (
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: ok ? 'var(--success)' : 'var(--danger)',
      display: 'inline-block', flexShrink: 0,
    }} />
  );

  const services = [
    { label: 'AI',       ok: health.gemini || health.groq, always: true },
    { label: 'Google',   ok: connected,                    always: true },
    { label: 'Todoist',  ok: health.todoist,               always: true },
    { label: 'GitHub',   ok: health.github,                always: health.github !== undefined },
    { label: 'Slack',    ok: health.slack,                 always: health.slack  !== undefined },
    { label: 'LinkedIn', ok: health.linkedin,              always: health.linkedin !== undefined },
  ].filter(s => s.always);

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      height: 52,
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28,
          borderRadius: 8,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 14,
          letterSpacing: '-0.02em',
        }}>D</div>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em' }}>DevOS</span>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Service status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {services.map(s => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
              {statusDot(s.ok)}
              {s.label}
            </span>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

        {/* Connect Google */}
        {!connected && onConnectGoogle && (
          <button
            className="primary"
            style={{ fontSize: 12, padding: '5px 12px', height: 30 }}
            onClick={onConnectGoogle}
          >
            Connect Google
          </button>
        )}

        {/* User */}
        {isLoggedIn && user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26,
              borderRadius: '50%',
              background: '#e8e7e3',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontWeight: 600, fontSize: 11,
            }}>
              {user.username?.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>@{user.username}</span>
            <button
              onClick={onLogout}
              style={{
                fontSize: 11, color: 'var(--muted)',
                background: 'transparent',
                border: '0.5px solid var(--border)',
                borderRadius: 5,
                padding: '3px 10px',
                height: 26,
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
