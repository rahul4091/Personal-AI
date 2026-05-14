/* global React */
// Calendar — agenda grouped by day, with conflict / focus tags.

function todayAt(h, m = 0) {
  const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString();
}
function tomorrowAt(h, m = 0) {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d.toISOString();
}
function plus(iso, mins) {
  return new Date(new Date(iso).getTime() + mins * 60000).toISOString();
}

const SAMPLE_EVENTS = [
  { id: "1", title: "Standup",            start: todayAt(10, 0),  end: todayAt(10, 15), attendees: ["jane", "alex", "sam", "you", "kate"] },
  { id: "2", title: "Sprint planning",    start: todayAt(11, 30), end: todayAt(12, 30) },
  { id: "3", title: "1:1 w/ Alex",        start: todayAt(11, 45), end: todayAt(12, 30), attendees: ["alex"] },
  { id: "4", title: "Lunch",              start: todayAt(13, 0),  end: todayAt(13, 45) },
  { id: "5", title: "Focus block",        start: todayAt(14, 0),  end: todayAt(16, 0) },
  { id: "6", title: "Sprint sync",        start: todayAt(16, 30), end: todayAt(17, 0),  attendees: ["jane", "sam", "alex"] },
  { id: "7", title: "DSA study",          start: todayAt(20, 0),  end: todayAt(21, 0) },
  { id: "8", title: "Standup",            start: tomorrowAt(10, 0),  end: tomorrowAt(10, 15) },
  { id: "9", title: "Deep work",          start: tomorrowAt(10, 30), end: tomorrowAt(12, 30) },
];

function getEventColor(ev) {
  const t = (ev.title || "").toLowerCase();
  if (t.includes("focus") || t.includes("deep work")) return "var(--info)";
  if (t.includes("lunch") || t.includes("break")) return "var(--warning)";
  if (t.includes("standup") || t.includes("sync")) return "var(--accent)";
  if (t.includes("class") || t.includes("study") || t.includes("dsa")) return "#8B5CF6";
  return "var(--hint)";
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function fmtDur(ev) {
  const mins = Math.round((new Date(ev.end) - new Date(ev.start)) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins === 60) return "1h";
  return `${Math.floor(mins / 60)}h ${mins % 60 ? mins % 60 + "m" : ""}`.trim();
}

function CalendarView() {
  const [events] = React.useState(SAMPLE_EVENTS);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", recurring: false, days: [], time: "14:00", duration: 60 });

  const grouped = React.useMemo(() => {
    const m = new Map();
    events.forEach(e => {
      const k = new Date(e.start).toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    });
    return [...m.entries()];
  }, [events]);

  function dayHeader(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    if (d.toDateString() === today.toDateString())
      return { label: "Today", sub: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
    if (d.toDateString() === tom.toDateString())
      return { label: "Tomorrow", sub: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
    return { label: d.toLocaleDateString("en-US", { weekday: "long" }), sub: d.toLocaleDateString("en-US", { month: "long", day: "numeric" }) };
  }

  const now = Date.now();
  const todayEvents = events.filter(e => new Date(e.start).toDateString() === new Date().toDateString());
  const upcomingToday = todayEvents.filter(e => new Date(e.start) > now);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Calendar</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => setShowForm(f => !f)}>{showForm ? "Cancel" : "+ New Event"}</Button>
          <Button>Refresh</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Today's events", value: todayEvents.length },
          { label: "Coming up today", value: upcomingToday.length },
          { label: "Days ahead", value: grouped.length },
        ].map(s => (
          <div key={s.label}
            style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["Single", "Recurring"].map(mode => {
              const active = (mode === "Recurring") === form.recurring;
              return (
                <button key={mode}
                  onClick={() => setForm(f => ({ ...f, recurring: mode === "Recurring" }))}
                  style={{
                    fontSize: 11, padding: "3px 12px", borderRadius: "var(--radius)", cursor: "pointer",
                    fontFamily: "inherit",
                    background: active ? "var(--text)" : "var(--surface)",
                    color: active ? "var(--bg)" : "var(--muted)",
                    border: `0.5px solid ${active ? "var(--text)" : "var(--border)"}`,
                  }}>{mode}</button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="Event title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            {form.recurring && (
              <>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Days of week</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {DAYS.map((label, i) => {
                    const num = i + 1;
                    const on = form.days.includes(num);
                    return (
                      <button key={num}
                        onClick={() => setForm(f => ({ ...f, days: on ? f.days.filter(d => d !== num) : [...f.days, num] }))}
                        style={{
                          fontSize: 11, padding: "4px 10px", borderRadius: "var(--radius)", cursor: "pointer",
                          fontFamily: "inherit",
                          background: on ? "var(--accent)" : "var(--surface)",
                          color: on ? "#fff" : "var(--muted)",
                          border: `0.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                        }}>{label}</button>
                    );
                  })}
                </div>
              </>
            )}
            <Button variant="primary" style={{ alignSelf: "flex-end" }}
              onClick={() => { setShowForm(false); setForm({ title: "", recurring: false, days: [], time: "14:00", duration: 60 }); }}>
              {form.recurring ? "Create recurring event" : "Create event"}
            </Button>
          </div>
        </div>
      )}

      {grouped.map(([dateStr, dayEvents]) => {
        const { label, sub } = dayHeader(dateStr);
        const isToday = label === "Today";
        return (
          <div key={dateStr} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? "var(--accent)" : "var(--text)" }}>{label}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</span>
              <span style={{ fontSize: 11, color: "var(--hint)", marginLeft: "auto" }}>{dayEvents.length} events</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dayEvents.map(ev => {
                const color = getEventColor(ev);
                const isPast = new Date(ev.end) < now;
                const isSoon = (new Date(ev.start) - now) < 15 * 60 * 1000 && new Date(ev.start) > now;
                const isNow = new Date(ev.start) <= now && new Date(ev.end) >= now;
                return (
                  <div key={ev.id}
                    style={{
                      display: "flex", alignItems: "stretch",
                      background: "var(--surface)",
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius)",
                      overflow: "hidden",
                      opacity: isPast ? 0.45 : 1,
                    }}>
                    <div style={{ width: 3, background: color, flexShrink: 0 }} />
                    <div style={{ width: 72, padding: "10px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", borderRight: "0.5px solid var(--border)", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: isNow ? color : "var(--text)" }}>{fmtTime(ev.start)}</span>
                      <span style={{ fontSize: 10, color: "var(--hint)", marginTop: 2 }}>{fmtDur(ev)}</span>
                    </div>
                    <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{ev.title}</span>
                        {isNow && <Tag variant="success">Now</Tag>}
                        {isSoon && <Tag variant="info">Soon</Tag>}
                        {(ev.title.toLowerCase().includes("focus") || ev.title.toLowerCase().includes("deep work")) && <Tag variant="info">Focus</Tag>}
                      </div>
                      {ev.attendees?.length > 0 && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                          {ev.attendees.slice(0, 3).join(" · ")}
                          {ev.attendees.length > 3 ? ` +${ev.attendees.length - 3} more` : ""}
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
    </div>
  );
}

window.CalendarView = CalendarView;
