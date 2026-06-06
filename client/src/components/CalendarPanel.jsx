import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api.js';
import NotConnected from './NotConnected.jsx';

const DAYS = [
  { label: 'Mon', num: 1 }, { label: 'Tue', num: 2 }, { label: 'Wed', num: 3 },
  { label: 'Thu', num: 4 }, { label: 'Fri', num: 5 }, { label: 'Sat', num: 6 }, { label: 'Sun', num: 7 },
];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function eventColor(title = '') {
  const t = title.toLowerCase();
  if (t.includes('focus') || t.includes('deep work') || t.includes('frontend') || t.includes('dev'))
    return '#7591b0';
  if (t.includes('design') || t.includes('product') || t.includes('ui') || t.includes('brand'))
    return '#7ba88c';
  if (t.includes('research') || t.includes('interview') || t.includes('study') || t.includes('dsa') || t.includes('test'))
    return '#9488b6';
  if (t.includes('lunch') || t.includes('break') || t.includes('meet') || t.includes('andria'))
    return '#c08fa1';
  if (t.includes('standup') || t.includes('sync') || t.includes('catch') || t.includes('collab'))
    return '#c0a37c';
  return '#a3abb4';
}

export default function CalendarPanel({ connected, refreshKey, onConnectGoogle, onGoToSettings }) {
  const [events,    setEvents]   = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [authError, setAuthError] = useState(false);
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [showForm,  setShowForm] = useState(false);
  const [creating,  setCreating] = useState(false);
  const [form, setForm] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return { title: '', date: d.toISOString().slice(0, 16), duration: 60, recurring: false, days: [], time: '14:00' };
  });

  useEffect(() => { if (connected) load(); }, [connected]);
  useEffect(() => { if (connected && refreshKey) load(); }, [refreshKey]);

  async function load() {
    setLoading(true);
    setAuthError(false);
    try {
      const r = await apiFetch('/api/calendar');
      if (r.status === 401) {
        const body = await r.json().catch(() => ({}));
        if (body.error === 'google_auth_required') { setAuthError(true); return; }
      }
      const ev = await r.json();
      setEvents(Array.isArray(ev) ? ev : []);
    } finally { setLoading(false); }
  }

  async function createEvent() {
    if (!form.title.trim()) return;
    if (form.recurring && !form.days.length) { alert('Select at least one day'); return; }
    if (!form.recurring && !form.date) return;
    setCreating(true);
    try {
      const body = form.recurring
        ? { title: form.title, recurring: true, days: form.days, time: form.time, duration: Number(form.duration) }
        : { title: form.title, date: form.date, duration: Number(form.duration) };
      const r = await apiFetch('/api/calendar', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      const next = new Date(); next.setHours(next.getHours() + 1, 0, 0, 0);
      setForm({ title: '', date: next.toISOString().slice(0, 16), duration: 60, recurring: false, days: [], time: '14:00' });
      setShowForm(false);
      await load();
    } finally { setCreating(false); }
  }

  function toggleDay(num) {
    setForm(f => ({ ...f, days: f.days.includes(num) ? f.days.filter(d => d !== num) : [...f.days, num] }));
  }

  const today = new Date();

  // 6-week grid starting on the Monday on or before the 1st of the displayed month
  const gridDays = useMemo(() => {
    const dow    = monthStart.getDay();            // 0=Sun
    const offset = dow === 0 ? -6 : 1 - dow;      // shift back to Monday
    const start  = addDays(monthStart, offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthStart]);

  function eventsForDay(day) {
    return events
      .filter(ev => ev.start && sameDay(new Date(ev.start), day))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (!connected) return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Calendar</h2>
      <NotConnected
        title="Calendar not connected"
        description="Connect your Google account to see upcoming events, create meetings, and detect scheduling conflicts."
        primaryLabel="Connect Google"
        onPrimary={onConnectGoogle}
        secondaryLabel="Go to Settings"
        onSecondary={onGoToSettings}
      />
    </div>
  );

  return (
    <div>
      {authError && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--danger)', fontSize: 13 }}>Google disconnected</span>
          <button className="primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={onConnectGoogle}>
            Reconnect
          </button>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => setMonthStart(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={navBtn}
        >‹</button>
        <button
          onClick={() => setMonthStart(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={navBtn}
        >›</button>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{monthLabel}</h2>
        <button onClick={() => setMonthStart(startOfMonth(new Date()))} style={{ fontSize: 12 }}>Today</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="primary"
            onClick={() => setShowForm(true)}
            style={{ fontSize: 13, padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Create
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          {DOW.map((d, i) => (
            <div key={d} style={{
              padding: '10px 0', textAlign: 'center',
              fontSize: 12, fontWeight: 500, color: 'var(--muted)',
              borderRight: i < 6 ? '1px solid var(--border)' : 'none',
            }}>{d}</div>
          ))}
        </div>

        {/* 6 week rows */}
        {Array.from({ length: 6 }, (_, week) => (
          <div
            key={week}
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: week < 5 ? '1px solid var(--border)' : 'none',
            }}
          >
            {gridDays.slice(week * 7, week * 7 + 7).map((day, di) => {
              const isToday        = sameDay(day, today);
              const isCurrentMonth = day.getMonth() === monthStart.getMonth();
              const dayEvs         = eventsForDay(day);
              const visible        = dayEvs.slice(0, 3);
              const overflow       = dayEvs.length - 3;

              return (
                <div key={di} style={{
                  minHeight: 96,
                  padding: '8px 8px 6px',
                  borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                  background: isToday ? 'rgba(99,102,241,0.03)' : 'var(--bg)',
                  outline: isToday ? '2px solid var(--accent)' : 'none',
                  outlineOffset: '-2px',
                  boxSizing: 'border-box',
                }}>
                  {/* Date number */}
                  <div style={{
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday
                      ? 'var(--accent)'
                      : isCurrentMonth ? 'var(--text)' : 'var(--hint)',
                    marginBottom: 5,
                  }}>
                    {day.getDate()}
                  </div>

                  {/* Event chips */}
                  {visible.map(ev => (
                    <div key={ev.id} title={ev.title} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      marginBottom: 3, cursor: 'default',
                    }}>
                      <span style={{
                        width: 3, height: 14, borderRadius: 2,
                        background: eventColor(ev.title), flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 11.5, color: 'var(--text)',
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ev.title}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--hint)', flexShrink: 0 }}>›</span>
                    </div>
                  ))}

                  {overflow > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 2 }}>+{overflow} more</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Create event modal */}
      {showForm && (
        <CreateEventModal
          form={form} setForm={setForm}
          creating={creating} onCreate={createEvent}
          onClose={() => setShowForm(false)}
          toggleDay={toggleDay}
        />
      )}
    </div>
  );
}

const navBtn = {
  width: 32, height: 32, padding: 0, borderRadius: 8,
  border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--muted)', fontSize: 18, lineHeight: 1,
};

const miniNav = {
  width: 24, height: 24, padding: 0, borderRadius: 6, border: 'none',
  background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1,
};

function CreateEventModal({ form, setForm, creating, onCreate, onClose, toggleDay }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.28)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 440, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)',
        zIndex: 201, padding: '20px 22px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>New event</span>
          <button onClick={onClose} style={{ ...miniNav, border: '1px solid var(--border)' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['Single', 'Recurring'].map(mode => {
            const active = (mode === 'Recurring') === form.recurring;
            return (
              <button key={mode} onClick={() => setForm(f => ({ ...f, recurring: mode === 'Recurring' }))} style={{
                fontSize: 12, padding: '4px 14px', borderRadius: 7,
                background: active ? 'var(--text)' : 'var(--surface)',
                color: active ? 'var(--bg)' : 'var(--muted)',
                border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
              }}>{mode}</button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input placeholder="Event title" value={form.title} autoFocus
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && onCreate()} />

          {form.recurring ? (
            <>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>Days of week</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {DAYS.map(({ label, num }) => {
                    const on = form.days.includes(num);
                    return (
                      <button key={num} onClick={() => toggleDay(num)} style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        background: on ? 'var(--accent)' : 'var(--surface)',
                        color: on ? '#fff' : 'var(--muted)',
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      }}>{label}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Start time</div>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
                <div style={{ position: 'relative', flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Duration</div>
                  <input type="number" value={form.duration} min={5} step={5}
                    onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} style={{ paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 10, bottom: 9, fontSize: 11, color: 'var(--muted)', pointerEvents: 'none' }}>min</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ flex: 2 }} />
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="number" value={form.duration} min={5} step={5}
                  onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} style={{ paddingRight: 36 }} />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted)', pointerEvents: 'none' }}>min</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            {[15, 30, 60, 90].map(m => (
              <button key={m} onClick={() => setForm(f => ({ ...f, duration: m }))} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 6,
                background: Number(form.duration) === m ? 'var(--text)' : 'var(--surface)',
                color: Number(form.duration) === m ? 'var(--bg)' : 'var(--muted)',
                border: `1px solid ${Number(form.duration) === m ? 'var(--text)' : 'var(--border)'}`,
              }}>{m < 60 ? `${m}m` : `${m / 60}h`}</button>
            ))}
          </div>

          <button className="primary" onClick={onCreate}
            disabled={creating || !form.title.trim() || (form.recurring ? !form.days.length : !form.date)}
            style={{ alignSelf: 'flex-end', marginTop: 4, padding: '8px 18px', opacity: (creating || !form.title.trim()) ? 0.4 : 1 }}>
            {creating ? 'Creating…' : form.recurring ? 'Create recurring event' : 'Create event'}
          </button>
        </div>
      </div>
    </>
  );
}
