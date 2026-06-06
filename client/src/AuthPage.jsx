import { useState } from 'react';

export default function AuthPage({ onAuth }) {
  const [mode,     setMode]     = useState('login');
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPwd,  setShowPwd]  = useState(false);
  const params = new URLSearchParams(window.location.search);
  const [error, setError] = useState(() => {
    if (params.get('auth_error') === 'google_failed') {
      const detail = params.get('detail');
      return detail ? `Google sign-in failed: ${detail}` : 'Google sign-in failed. Please try again.';
    }
    return '';
  });

  function switchMode(next) {
    setMode(next);
    setError('');
    setUsername('');
    setEmail('');
    setPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { username, password };
      if (mode === 'signup' && email.trim()) body.email = email.trim();

      const res  = await fetch(`/api/auth/${mode}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
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

  const isSignup = mode === 'signup';

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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--accent)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>D</span>
            <span style={{ fontWeight: 600, fontSize: 18, color: 'var(--text)' }}>DevOS</span>
          </div>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--muted)', margin: 0 }}>
            {isSignup ? 'Create your workspace' : 'Sign in to your workspace'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
          {isSignup && (
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          )}
          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              tabIndex={-1}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--hint)', display: 'flex', alignItems: 'center',
              }}
              aria-label={showPwd ? 'Hide password' : 'Show password'}
            >
              {showPwd ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {isSignup && (
            <p style={{ fontSize: 11, color: 'var(--hint)', margin: '0 2px' }}>
              Password must be at least 8 characters.
            </p>
          )}

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
            {loading ? '…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', margin: '14px 0 0' }}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? 'login' : 'signup')}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--accent)', fontWeight: 500, fontSize: 13,
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </p>

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
