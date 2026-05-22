import { useState } from 'react';

export default function AuthPage({ onAuth }) {
  const mode = 'login'; // signup disabled — re-enable later
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        body:    JSON.stringify({ username, password }),
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
            Sign in to your workspace
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
            {loading ? '…' : 'Sign in'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
          <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--hint)' }}>or</span>
          <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
        </div>

        <a href="/api/auth/google/signin" style={{ textDecoration: 'none', display: 'block' }}>
          <button
            type="button"
            style={{
              width: '100%', padding: '9px 16px',
              fontSize: 'var(--fs-base)', fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        </a>

      </div>
    </div>
  );
}
