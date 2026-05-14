import { useState, useEffect } from 'react';
import { useCache } from '../hooks/useCache.js';

const TTL_5MIN = 5 * 60 * 1000;

export default function TaskPanel({ refreshKey }) {
  const [notionTasks,   setNotionTasks]   = useState([]);
  const [todoistTasks,  setTodoistTasks]  = useState([]);
  const [prs,           setPRs]           = useState([]);
  const [cards,         setCards]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [newTask,       setNewTask]       = useState('');
  const cache = useCache('devos_tasks', TTL_5MIN);

  useEffect(() => {
    if (refreshKey > 0) { load(true); return; }
    const cached = cache.get();
    if (cached) {
      setNotionTasks(cached.notion ?? []);
      setTodoistTasks(cached.todoist ?? []);
      setPRs(cached.prs);
      setCards(cached.cards);
      return;
    }
    load();
  }, [refreshKey]);

  async function load(bust = false) {
    setLoading(true);
    if (bust) cache.clear();
    try {
      const [t, p, c] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()).catch(() => ({})),
        fetch('/api/prs').then(r => r.json()).catch(() => []),
        fetch('/api/cards').then(r => r.json()).catch(() => []),
      ]);
      const notion  = Array.isArray(t.notion)  ? t.notion  : [];
      const todoist = Array.isArray(t.todoist) ? t.todoist : [];
      const prs     = Array.isArray(p) ? p : [];
      const cards   = Array.isArray(c) ? c : [];
      cache.set({ notion, todoist, prs, cards });
      setNotionTasks(notion);
      setTodoistTasks(todoist);
      setPRs(prs);
      setCards(cards);
    } finally { setLoading(false); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTask.trim() }),
    });
    if (!r.ok) {
      const err = await r.json();
      alert('Failed to add task: ' + err.error);
      return;
    }
    setNewTask('');
    load(true);
  }

  async function updateStatus(id, status, source) {
    await fetch('/api/task/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, source }),
    });
    if (source === 'todoist') {
      setTodoistTasks(t => t.map(x => x.id === id ? { ...x, status } : x));
    } else {
      setNotionTasks(t => t.map(x => x.id === id ? { ...x, status } : x));
    }
  }

  const statusDot = s => (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: s === 'Done' ? 'var(--success)' : s === 'In progress' ? 'var(--info)' : 'var(--hint)',
    }} />
  );

  function TaskRow({ task }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', marginBottom: 6 }}>
        {statusDot(task.status)}
        <span style={{ flex: 1, fontSize: 13 }}>{task.title}</span>
        <select
          value={task.status}
          onChange={e => updateStatus(task.id, e.target.value, task.source)}
          style={{ fontSize: 11, border: '0.5px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'var(--bg)' }}
        >
          <option>Not started</option>
          <option>In progress</option>
          <option>Done</option>
        </select>
        {task.url && (
          <a href={task.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--info)' }}>↗</a>
        )}
      </div>
    );
  }

  const SectionHeader = ({ label }) => (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, marginTop: 14 }}>
      {label}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Tasks</h2>
        <button onClick={() => load(true)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {/* Add task */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Add a task…"
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
        />
        <button className="primary" onClick={addTask} style={{ whiteSpace: 'nowrap' }}>Add task</button>
      </div>

      {/* Notion tasks */}
      <SectionHeader label="Notion" />
      {notionTasks.map(task => <TaskRow key={task.id} task={task} />)}
      {!loading && notionTasks.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>No open Notion tasks</p>
      )}

      {/* Todoist tasks */}
      <SectionHeader label="Todoist" />
      {todoistTasks.map(task => <TaskRow key={task.id} task={task} />)}
      {!loading && todoistTasks.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>No open Todoist tasks</p>
      )}

      {/* GitHub PRs */}
      {prs.length > 0 && (
        <>
          <SectionHeader label="GitHub PRs" />
          {prs.map(pr => (
            <div key={pr.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)', border: '0.5px solid var(--border)',
              borderLeft: pr.daysStale >= 3 ? '3px solid var(--danger)' : undefined,
              borderRadius: pr.daysStale >= 3 ? '0 var(--radius) var(--radius) 0' : 'var(--radius)',
              padding: '8px 12px', marginBottom: 6,
            }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>#{pr.id}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{pr.title}</span>
              {pr.daysStale >= 3 && <span className="tag tag-danger">{pr.daysStale}d stale</span>}
              <a href={pr.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--info)' }}>View ↗</a>
            </div>
          ))}
        </>
      )}

      {/* Trello cards */}
      {cards.length > 0 && (
        <>
          <SectionHeader label="Trello cards" />
          {cards.slice(0, 8).map(card => (
            <div key={card.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)', border: '0.5px solid var(--border)',
              borderLeft: card.daysStale >= 5 ? '3px solid var(--danger)' : undefined,
              borderRadius: card.daysStale >= 5 ? '0 var(--radius) var(--radius) 0' : 'var(--radius)',
              padding: '8px 12px', marginBottom: 6,
            }}>
              <span style={{ flex: 1, fontSize: 13 }}>{card.title}</span>
              {card.daysStale >= 5 && <span className="tag tag-danger">{card.daysStale}d stale</span>}
              <a href={card.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--info)' }}>View ↗</a>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
