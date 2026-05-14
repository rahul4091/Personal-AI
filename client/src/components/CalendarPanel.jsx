import { useState, useEffect } from 'react';

const DAYS = [
  { label: 'Mon', num: 1 },
  { label: 'Tue', num: 2 },
  { label: 'Wed', num: 3 },
  { label: 'Thu', num: 4 },
  { label: 'Fri', num: 5 },
  { label: 'Sat', num: 6 },
  { label: 'Sun', num: 7 },
];

export default function CalendarPanel({ connected, refreshKey }) {
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return {
      title: '', date: d.toISOString().slice(0, 16), duration: 60,
      recurring: false, days: [], time: '14:00',
    };
  });

  useEffect(() => { if (connected) load(); }, [connected]);
  useEffect(() => { if (connected && refreshKey) load(); }, [refreshKey]);

  async function load() {
    setLoading(true);
    try {
      const ev = await fetch('/api/calendar').then(r => r.json());
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
      const r = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      const next = new Date(); next.setHours(next.getHours() + 1, 0, 0, 0);
      setForm({ title: '', date: next.toISOString().slice(0, 16), duration: 60, recurring: false, days: [], time: '14:00' });
      setShowForm(false);
      await load();
    } finally { setCreating(false); }
  }

  function toggleDay(num) {
    setForm(f => ({
      ...f,
      days: f.days.includes(num) ? f.days.filter(d => d !== num) : [...f.days, num],
    }));
  }

  // Group events by calendar date
  function groupByDay(evs) {
    const map = new Map();
    evs.forEach(ev => {
      const key = ev.start ? new Date(ev.start).toDateString() : 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    });
    return [...map.entries()];
  }

  function formatDayHeader(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString())    return { label: 'Today',    sub: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) };
    if (d.toDateString() === tomorrow.toDateString()) return { label: 'Tomorrow', sub: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) };
    return { label: d.toLocaleDateString('en-US', { weekday: 'long' }), sub: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) };
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function getDuration(ev) {
    if (!ev.start || !ev.end) return null;
    const mins = Math.round((new Date(ev.end) - new Date(ev.start)) / 60000);
    if (mins < 60)  return `${mins}m`;
    if (mins === 60) return '1h';
    return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? (mins % 60) + 'm' : ''}`.trim();
  }

  function getEventColor(ev) {
    const title = (ev.title ?? '').toLowerCase();
    if (title.includes('focus') || title.includes('deep work')) return 'var(--info)';
    if (title.includes('lunch') || title.includes('break'))      return 'var(--warning)';
    if (title.includes('standup') || title.includes('sync') || title.includes('catch')) return 'var(--accent)';
    if (title.includes('class') || title.includes('study') || title.includes('dsa'))    return '#8B5CF6';
    return 'var(--hint)';
  }

  const now = Date.now();
  const todayEvents = events.filter(e => e.start && new Date(e.start).toDateString() === new Date().toDateString());
  const upcomingToday = todayEvents.filter(e => new Date(e.start) > now);
  const grouped = groupByDay(events);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Calendar</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowForm(f => !f)} style={{ fontSize: 12 }}>
            {showForm ? 'Cancel' : '+ New Event'}
          </button>
          <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {!connected && (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Connect Google to load your calendar.
        </div>
      )}

      {/* Stats row */}
      {connected && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: "Today's events",  value: todayEvents.length },
            { label: 'Coming up today', value: upcomingToday.length },
            { label: 'Days ahead',      value: grouped.length },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Create event form */}
      {showForm && (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['Single', 'Recurring'].map(mode => {
              const active = (mode === 'Recurring') === form.recurring;
              return (
                <button
                  key={mode}
                  onClick={() => setForm(f => ({ ...f, recurring: mode === 'Recurring' }))}
                  style={{
                    fontSize: 11, padding: '3px 12px',
                    background: active ? 'var(--text)' : 'var(--surface)',
                    color:      active ? 'var(--bg)'   : 'var(--muted)',
                    border:    `0.5px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              placeholder="Event title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && createEvent()}
              autoFocus
            />

            {form.recurring ? (
              <>
                {/* Day-of-week picker (ISO: 1=Mon … 7=Sun) */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>Days of week</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {DAYS.map(({ label, num }) => {
                      const on = form.days.includes(num);
                      return (
                        <button
                          key={num}
                          onClick={() => toggleDay(num)}
                          style={{
                            fontSize: 11, padding: '4px 10px',
                            background: on ? 'var(--accent)' : 'var(--surface)',
                            color:      on ? '#fff'          : 'var(--muted)',
                            border:    `0.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {form.days.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 4 }}>
                      Day codes: {form.days.sort((a, b) => a - b).map(d => `${DAYS[d - 1].label}(${d})`).join(', ')}
                    </div>
                  )}
                </div>

                {/* Time + duration row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Start time</div>
                    <input
                      type="time"
                      value={form.time}
                      onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    />
                  </div>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Duration</div>
                    <input
                      type="number"
                      value={form.duration}
                      onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                      min={5}
                      step={5}
                      style={{ paddingRight: 36 }}
                    />
                    <span style={{ position: 'absolute', right: 10, bottom: 9, fontSize: 11, color: 'var(--muted)', pointerEvents: 'none' }}>min</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={{ flex: 2 }}
                />
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="number"
                    value={form.duration}
                    onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                    min={5}
                    step={5}
                    style={{ paddingRight: 36 }}
                  />
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted)', pointerEvents: 'none' }}>min</span>
                </div>
              </div>
            )}

            {/* Duration presets */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[15, 30, 60, 90].map(m => (
                <button
                  key={m}
                  onClick={() => setForm(f => ({ ...f, duration: m }))}
                  style={{
                    fontSize: 11, padding: '3px 10px',
                    background: Number(form.duration) === m ? 'var(--text)' : 'var(--surface)',
                    color:      Number(form.duration) === m ? 'var(--bg)'   : 'var(--muted)',
                    border:    `0.5px solid ${Number(form.duration) === m ? 'var(--text)' : 'var(--border)'}`,
                  }}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
            </div>

            <button
              className="primary"
              onClick={createEvent}
              disabled={creating || !form.title.trim() || (form.recurring ? !form.days.length : !form.date)}
              style={{ alignSelf: 'flex-end', opacity: (creating || !form.title.trim()) ? 0.4 : 1 }}
            >
              {creating ? 'Creating…' : form.recurring ? 'Create recurring event' : 'Create event'}
            </button>
          </div>
        </div>
      )}

      {/* Events grouped by day */}
      {connected && grouped.map(([dateStr, dayEvents]) => {
        const { label, sub } = formatDayHeader(dateStr);
        const isToday = label === 'Today';
        return (
          <div key={dateStr} style={{ marginBottom: 20 }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text)' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</span>
              <span style={{ fontSize: 11, color: 'var(--hint)', marginLeft: 'auto' }}>{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Event cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayEvents.map(ev => {
                const color    = getEventColor(ev);
                const dur      = getDuration(ev);
                const isPast   = ev.end && new Date(ev.end) < now;
                const isSoon   = ev.start && (new Date(ev.start) - now) < 15 * 60 * 1000 && new Date(ev.start) > now;
                const isNow    = ev.start && ev.end && new Date(ev.start) <= now && new Date(ev.end) >= now;

                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'stretch', gap: 0,
                    background: 'var(--surface)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    opacity: isPast ? 0.45 : 1,
                  }}>
                    {/* Color bar */}
                    <div style={{ width: 3, background: color, flexShrink: 0 }} />

                    {/* Time column */}
                    <div style={{ width: 72, padding: '10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', borderRight: '0.5px solid var(--border)', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: isNow ? color : 'var(--text)', whiteSpace: 'nowrap' }}>{formatTime(ev.start)}</span>
                      {dur && <span style={{ fontSize: 10, color: 'var(--hint)', marginTop: 2 }}>{dur}</span>}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{ev.title}</span>
                        {isNow  && <span className="tag tag-success">Now</span>}
                        {isSoon && <span className="tag tag-info">Soon</span>}
                        {(ev.title?.toLowerCase().includes('focus') || ev.title?.toLowerCase().includes('deep work')) &&
                          <span className="tag tag-info">Focus</span>}
                      </div>
                      {ev.attendees?.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                          {ev.attendees.slice(0, 3).join(' · ')}{ev.attendees.length > 3 ? ` +${ev.attendees.length - 3} more` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!loading && events.length === 0 && connected && (
        <div style={{ textAlign: 'center', paddingTop: 48, color: 'var(--muted)', fontSize: 13 }}>
          No upcoming events
        </div>
      )}
    </div>
  );
}
