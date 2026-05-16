import { useState } from 'react';

export default function AuthPage({ onAuth }) {
  const [mode,     setMode]     = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email,    setEmail]    = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(`/api/auth/${mode}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          username,
          password,
          ...(mode === 'signup' ? { email } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return; }
      localStorage.setItem('devos_token', data.token);
      onAuth(data.user, mode === 'signup');
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(m => m === 'login' ? 'signup' : 'login');
    setError('');
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div style={{
        width: 360, padding: 32,
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: 'var(--border-hairline)',
        boxShadow: 'var(--shadow-2)',
      }}>
        {/* Logo area */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginBottom: 6,
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--accent)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>D</span>
            <span style={{ fontWeight: 600, fontSize: 18, color: 'var(--text)' }}>DevOS</span>
          </div>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--muted)', margin: 0 }}>
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoFocus
            autoComplete="off"
          />
          {mode === 'signup' && (
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          )}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="primary"
            style={{ marginTop: 4, padding: '9px 16px', fontSize: 'var(--fs-base)' }}
          >
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ margin: '20px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--muted)', textAlign: 'center' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={toggleMode}
            style={{
              background: 'none', border: 'none',
              color: 'var(--accent)', cursor: 'pointer',
              fontSize: 'var(--fs-sm)', padding: 0, fontWeight: 500,
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
