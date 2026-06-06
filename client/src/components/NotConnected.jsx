export default function NotConnected({ title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: '64px 24px', maxWidth: 380, margin: '0 auto',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--bg)', border: 'var(--border-hairline)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, marginBottom: 16, color: 'var(--muted)',
      }}>○</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
        {title}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
        {description}
      </p>
      <button className="primary" onClick={onPrimary} style={{ minWidth: 160, padding: '8px 20px' }}>
        {primaryLabel}
      </button>
      {onSecondary && (
        <button
          onClick={onSecondary}
          style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13, minWidth: 160 }}
        >
          {secondaryLabel ?? 'Go to Settings'}
        </button>
      )}
    </div>
  );
}
