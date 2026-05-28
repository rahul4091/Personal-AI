import { useState, useEffect } from 'react';

const STEPS = [
  { id: 'welcome', title: 'Welcome to DevOS' },
  { id: 'google',  title: 'Connect Google' },
  { id: 'tools',   title: 'What else connects' },
  { id: 'done',    title: "You're all set!" },
];

export default function OnboardingWizard({ user, onComplete }) {
  const [step, setStep] = useState(0);

  // If returning from Google OAuth redirect, jump straight to the done step.
  useEffect(() => {
    if (window.location.search.includes('connected=true')) {
      window.history.replaceState({}, '', '/');
      setStep(STEPS.length - 1);
    }
  }, []);

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  function next() {
    if (isLast) onComplete();
    else setStep(s => s + 1);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div style={{
        width: 500, padding: 40,
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: 'var(--border-hairline)',
        boxShadow: 'var(--shadow-2)',
      }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= step ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {current.id === 'welcome' && (
          <WelcomeStep username={user.username} onNext={next} />
        )}
        {current.id === 'google' && (
          <GoogleStep onNext={next} />
        )}
        {current.id === 'tools' && (
          <ToolsStep onNext={next} />
        )}
        {current.id === 'done' && (
          <DoneStep onComplete={onComplete} />
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ username, onNext }) {
  return (
    <>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>
        Welcome, {username}!
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-base)', lineHeight: 'var(--lh-loose)', margin: '0 0 32px' }}>
        DevOS is your personal AI command centre. It manages your email, calendar, tasks,
        and code — all from one place. Let's connect your tools.
      </p>
      <button className="primary" onClick={onNext} style={{ width: '100%', padding: '10px 16px' }}>
        Get started
      </button>
    </>
  );
}

function GoogleStep({ onNext }) {
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <span className="t-eyebrow">Step 1 of 2</span>
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>Connect Google</h2>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-base)', lineHeight: 'var(--lh-loose)', margin: '0 0 8px' }}>
        Connecting Google unlocks Gmail triage, smart calendar management, and conflict detection.
      </p>

      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '12px 14px',
        marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {['Triage your inbox by priority', 'Draft and send emails via the agent', 'Schedule and reschedule calendar events', 'Detect and resolve scheduling conflicts'].map(item => (
          <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-base)', color: 'var(--muted)' }}>
            <span className="ds-dot ds-dot--success" />
            {item}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="primary"
          style={{ width: '100%', padding: '10px 16px' }}
          onClick={async () => {
            try {
              const token = localStorage.getItem('devos_token');
              const r = await fetch('/api/auth/google/init', {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!r.ok) {
                if (r.status === 401) {
                  localStorage.removeItem('devos_token');
                  window.location.reload();
                }
                return;
              }
              const data = await r.json();
              if (data.url) window.location.href = data.url;
            } catch { /* network error */ }
          }}
        >
          Connect Gmail &amp; Calendar
        </button>
        <button
          onClick={onNext}
          style={{ width: '100%', padding: '9px 16px', color: 'var(--muted)' }}
        >
          Skip for now
        </button>
      </div>
    </>
  );
}

function ToolsStep({ onNext }) {
  const tools = [
    { name: 'Todoist / Notion', desc: 'Task management — create and track your to-dos' },
    { name: 'GitHub',           desc: 'PRs, issues, and code activity' },
    { name: 'Slack',            desc: 'Team alerts and daily digests' },
    { name: 'Trello',           desc: 'Board cards and stale card scan' },
  ];

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <span className="t-eyebrow">Step 2 of 2</span>
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>All optional from here</h2>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-base)', lineHeight: 'var(--lh-loose)', margin: '0 0 4px' }}>
        The app is fully working now. These extra tools unlock more features — add them any time from Settings.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', margin: '0 0 16px' }}>
        Just paste an API key. No technical setup needed.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
        {tools.map(t => (
          <div
            key={t.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 'var(--radius)',
              border: 'var(--border-hairline)', background: 'var(--bg)',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--hint)' }}>○</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 'var(--fs-base)' }}>{t.name}</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <button className="primary" onClick={onNext} style={{ width: '100%', padding: '10px 16px' }}>
        Go to dashboard
      </button>
    </>
  );
}

function DoneStep({ onComplete }) {
  return (
    <>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--tag-success-bg)', color: 'var(--success)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 20,
      }}>
        ✓
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>You're all set!</h2>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-base)', lineHeight: 'var(--lh-loose)', margin: '0 0 28px' }}>
        Your workspace is ready. Head to the dashboard — the agent is standing by.
      </p>
      <button className="primary" onClick={onComplete} style={{ width: '100%', padding: '10px 16px' }}>
        Go to dashboard
      </button>
    </>
  );
}
