export default function NavBar({ view, setView, navItems }) {
  return (
    <nav style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: 0,
      padding: '0 32px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      flexShrink: 0,
      height: 42,
      overflowX: 'auto',
    }}>
      {navItems.map(n => {
        const active = view === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: '100%',
              border: 'none',
              borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
              background: 'transparent',
              color: active ? 'var(--text)' : 'var(--muted)',
              fontWeight: active ? 500 : 400,
              fontSize: 13,
              borderRadius: 0,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'color var(--t-fast), border-color var(--t-fast)',
              whiteSpace: 'nowrap',
            }}
          >
            {n.dot && (
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: active ? n.dot : 'var(--hint)',
                flexShrink: 0,
                transition: 'background var(--t-fast)',
              }} />
            )}
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}
