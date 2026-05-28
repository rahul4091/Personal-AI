import { useState, useEffect } from 'react';
import { useCache } from '../hooks/useCache.js';
import { apiFetch } from '../api.js';
import NotConnected from './NotConnected.jsx';

const TTL_5MIN = 5 * 60 * 1000;

// Dot color by Todoist priority (1=normal … 4=urgent)
function priorityDot(priority, status) {
  if (status === 'Done') return 'var(--success)';
  if (priority === 4) return '#EF4444';
  if (priority === 3) return '#F59E0B';
  if (priority === 2) return '#3B82F6';
  return null;
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function toYMD(date) {
  return date.toISOString().slice(0, 10);
}

export default function TaskPanel({ refreshKey, onGoToSettings }) {
  const [notionTasks,  setNotionTasks]  = useState([]);
  const [todoistTasks, setTodoistTasks] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [fetchError,   setFetchError]   = useState(false);
  const [newTask,      setNewTask]      = useState('');
  const cache = useCache('devos_tasks', TTL_5MIN);

  useEffect(() => {
    if (refreshKey > 0) { load(true); return; }
    const cached = cache.get();
    // Ignore a cached empty result — always re-fetch if cache has no tasks
    if (cached && (cached.notion?.length > 0 || cached.todoist?.length > 0)) {
      setNotionTasks(cached.notion   ?? []);
      setTodoistTasks(cached.todoist ?? []);
      return;
    }
    load();
  }, [refreshKey]);

  async function load(bust = false) {
    setLoading(true);
    setFetchError(false);
    if (bust) cache.clear();
    try {
      const r = await apiFetch('/api/tasks');
      if (!r.ok) { setFetchError(true); return; }
      const t       = await r.json();
      const notion  = Array.isArray(t.notion)  ? t.notion  : [];
      const todoist = Array.isArray(t.todoist) ? t.todoist : [];
      // Only cache when we got real data — never cache an empty failure
      if (notion.length > 0 || todoist.length > 0) cache.set({ notion, todoist });
      setNotionTasks(notion);
      setTodoistTasks(todoist);
    } catch {
      // Network error (e.g. backend restarting) — keep existing state, don't overwrite
      setFetchError(true);
    } finally { setLoading(false); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    const r = await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: newTask.trim() }),
    });
    if (!r.ok) { const err = await r.json(); alert('Failed: ' + err.error); return; }
    setNewTask('');
    load(true);
  }

  async function toggleDone(id, status, source) {
    const next = status === 'Done' ? 'Not started' : 'Done';
    await apiFetch('/api/task/update', {
      method: 'POST',
      body: JSON.stringify({ id, status: next, source }),
    });
    const update = tasks => tasks.map(x => x.id === id ? { ...x, status: next } : x);
    if (source === 'todoist') setTodoistTasks(update);
    else                      setNotionTasks(update);
  }

  const allTasks = [
    ...todoistTasks.map(t => ({ ...t, source: 'todoist' })),
    ...notionTasks.map(t  => ({ ...t, source: 'notion'  })),
  ];

  const today    = new Date(); today.setHours(0, 0, 0, 0);
  // Show Mon–Sun of the current week (7 columns)
  const dow      = today.getDay();
  const monday   = addDays(today, dow === 0 ? -6 : 1 - dow);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Split: tasks with a due date this week → top grid; rest → bottom groups
  const weekYMDs = new Set(weekDays.map(toYMD));

  const weekTasks  = allTasks.filter(t => t.due && weekYMDs.has(t.due));
  const otherTasks = allTasks.filter(t => !t.due || !weekYMDs.has(t.due));

  // Group others by source label
  const groups = {};
  otherTasks.forEach(t => {
    const key = t.source === 'todoist' ? 'Todoist' : 'Notion';
    (groups[key] = groups[key] ?? []).push(t);
  });

  const empty = allTasks.length === 0 && !loading && !fetchError;

  if (fetchError && allTasks.length === 0) return (
    <div>
      <AddBar newTask={newTask} setNewTask={setNewTask} addTask={addTask} />
      <div style={{ textAlign: 'center', paddingTop: 40 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          Could not load tasks — server may be restarting.
        </p>
        <button onClick={() => load(true)} style={{ fontSize: 12 }}>Retry</button>
      </div>
    </div>
  );

  if (empty) return (
    <div>
      <AddBar newTask={newTask} setNewTask={setNewTask} addTask={addTask} />
      <NotConnected
        title="No task integrations connected"
        description="Connect Todoist or Notion in Settings to sync your tasks here."
        primaryLabel="Go to Settings"
        onPrimary={onGoToSettings}
      />
    </div>
  );

  return (
    <div>
      <AddBar newTask={newTask} setNewTask={setNewTask} addTask={addTask} />

      {loading && <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>Loading…</p>}

      {/* ── Day columns — always visible ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 28 }}>
        {weekDays.map((day, i) => {
          const ymd     = toYMD(day);
          const isToday = ymd === toYMD(today);
          const dayEvs  = weekTasks.filter(t => t.due === ymd);
          const dayName = day.toLocaleDateString('en-US', { weekday: 'long' });
          const dateStr = day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

          return (
            <div key={i} style={{ paddingRight: 16, borderRight: i < 6 ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 16 : 0 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600,
                  textDecoration: isToday ? 'underline' : 'none',
                  color: 'var(--text)', marginBottom: 2,
                }}>
                  {dayName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{dateStr}</div>
              </div>
              {dayEvs.map(t => (
                <TaskItem key={t.id} task={t} onToggle={toggleDone} />
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Tasks without a due date — grouped by source ─────────────── */}
      {Object.keys(groups).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Object.keys(groups).length, 3)}, 1fr)`, gap: 0 }}>
          {Object.entries(groups).map(([label, tasks]) => (
            <div key={label} style={{ paddingRight: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{label}</div>
              {tasks.map(t => (
                <TaskItem key={t.id} task={t} onToggle={toggleDone} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskItem({ task, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <CircleCheck
        priority={task.priority ?? 1}
        status={task.status}
        onClick={() => onToggle(task.id, task.status, task.source)}
      />
      <span style={{
        fontSize: 13, color: task.status === 'Done' ? 'var(--hint)' : 'var(--text)',
        textDecoration: task.status === 'Done' ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {task.title}
      </span>
    </div>
  );
}

function AddBar({ newTask, setNewTask, addTask }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      <input
        placeholder="Add a task…"
        value={newTask}
        onChange={e => setNewTask(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && addTask()}
      />
      <button className="primary" onClick={addTask} style={{ whiteSpace: 'nowrap' }}>Add task</button>
    </div>
  );
}

function CircleCheck({ priority, status, onClick }) {
  const [hovered, setHovered] = useState(false);
  const fill = priorityDot(priority, status);
  const done = status === 'Done';
  const borderColor = fill ?? '#000';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={done ? 'Mark not started' : 'Mark done'}
      style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, padding: 0,
        border: `1.5px solid ${borderColor}`,
        background: hovered && !fill ? 'rgba(0,0,0,0.08)' : (fill ?? 'transparent'),
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}
    >
      {(done || hovered) && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke={done ? '#fff' : '#000'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
