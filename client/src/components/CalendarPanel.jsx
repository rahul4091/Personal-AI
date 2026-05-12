import { useState, useEffect } from 'react';

export default function CalendarPanel({ connected }) {
  const [events,    setEvents]    = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [form,      setForm]      = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return { title: '', date: d.toISOString().slice(0, 16), duration: 60 };
  });
  const [creating,  setCreating]  = useState(false);

  useEffect(() => { if (connected) load(); }, [connected]);

  async function load() {
    setLoading(true);
    try {
      const ev = await fetch('/api/calendar').then(r => r.json());
      setEvents(Array.isArray(ev) ? ev : []);
    } finally { setLoading(false); }
  }

  async function createEvent() {
    setCreating(true);
    try {
      const r = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, date: form.date, duration: form.duration }),
      });
      if (!r.ok) {
        const err = await r.json();
        alert('Failed to create event: ' + err.error);
        return;
      }
      const next = new Date(); next.setHours(next.getHours() + 1, 0, 0, 0);
      setForm({ title: '', date: next.toISOString().slice(0, 16), duration: 60 });
      await load();
    } finally { setCreating(false); }
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Calendar</h2>
        <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {!connected && <p style={{ color: 'var(--muted)' }}>Connect Google to load your calendar.</p>}

      {/* Create event form */}
      {connected && (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>Create event</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Event title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ flex: 2, minWidth: 140 }} />
            <input type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ flex: 2, minWidth: 140 }} />
            <input type="number" placeholder="Duration (min)" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} style={{ flex: 1, minWidth: 80 }} />
            <button
              className="primary"
              onClick={createEvent}
              disabled={creating || !form.title.trim() || !form.date}
              style={{ opacity: (creating || !form.title.trim() || !form.date) ? 0.4 : 1, cursor: (creating || !form.title.trim() || !form.date) ? 'not-allowed' : 'pointer' }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      {events.map(event => {
        const soon = event.start && (new Date(event.start) - Date.now()) < 15 * 60 * 1000 && new Date(event.start) > Date.now();
        return (
          <div key={event.id} style={{
            background: 'var(--surface)', border: `0.5px solid var(--border)`,
            borderLeft: soon ? '3px solid var(--success)' : undefined,
            borderRadius: soon ? '0 var(--radius) var(--radius) 0' : 'var(--radius)',
            padding: '10px 14px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              {soon && <span className="tag tag-success">Starting soon</span>}
              {event.title?.toLowerCase().includes('focus') && <span className="tag tag-info">Focus block</span>}
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{formatTime(event.start)}</span>
            </div>
            <div style={{ fontWeight: 500 }}>{event.title}</div>
            {event.attendees?.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                {event.attendees.slice(0, 3).join(', ')}{event.attendees.length > 3 ? ` +${event.attendees.length - 3}` : ''}
              </div>
            )}
          </div>
        );
      })}

      {!loading && events.length === 0 && connected && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', paddingTop: 40 }}>No upcoming events</p>
      )}
    </div>
  );
}
