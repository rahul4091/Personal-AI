import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLOR = { 4: '#D85A30', 3: '#BA7517', 2: '#378ADD' };

const COL_ACCENTS = [
  '#6366f1','#BA7517','#1D9E75','#D85A30',
  '#8b5cf6','#378ADD','#ec4899','#14b8a6','#f97316','#64748b',
];

const STATUS_COL = {
  'Todo': 'todo', 'Not started': 'todo',
  'In progress': 'inprogress', 'In Progress': 'inprogress',
  'Done': 'done',
  'On Hold': 'onhold',
};

const COL_STATUS = {
  todo: 'Not started', inprogress: 'In progress',
  done: 'Done', onhold: 'On Hold',
};

const BUILT_IN = [
  { id: 'todo',       name: 'To Do',       accent: '#6366f1' },
  { id: 'inprogress', name: 'In Progress', accent: '#BA7517' },
  { id: 'done',       name: 'Done',        accent: '#1D9E75' },
];

function dueFmt(iso) {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return { text: 'Today',    color: '#BA7517' };
  if (diff === 1)  return { text: 'Tomorrow', color: '#1D9E75' };
  if (diff < 0)    return { text: d.toLocaleDateString('en-US',{ month:'short', day:'numeric' }), color: '#D85A30' };
  return { text: d.toLocaleDateString('en-US',{ month:'short', day:'numeric' }), color: 'var(--muted)' };
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  const map = {
    todoist: { label: 'Todoist', bg: 'var(--tag-danger-bg)',  color: 'var(--tag-danger-fg)' },
    trello:  { label: 'Trello',  bg: 'var(--tag-info-bg)',    color: 'var(--tag-info-fg)'   },
    notion:  { label: 'Notion',  bg: 'var(--tag-gray-bg)',    color: 'var(--tag-gray-fg)'   },
  };
  const s = map[source] ?? map.notion;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 'var(--radius-sm)',
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function Card({ task, onDragStart, onToggle }) {
  const [hovered, setHov] = useState(false);
  const due    = dueFmt(task.due);
  const done   = task.status === 'Done';
  const pColor = PRIORITY_COLOR[task.priority];

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('id', task.id); onDragStart(task); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: pColor ? `3px solid ${pColor}` : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: 6,
        boxShadow: hovered ? 'var(--shadow-2)' : 'var(--shadow-1)',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'box-shadow var(--t-fast), transform var(--t-fast)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px 9px' }}>
        {/* Title */}
        <p style={{
          margin: '0 0 9px', fontSize: 'var(--fs-base)', fontWeight: 450,
          lineHeight: 'var(--lh-normal)', color: done ? 'var(--hint)' : 'var(--text)',
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {task.title}
        </p>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <SourceBadge source={task.source} />

          {due && (
            <span style={{
              fontSize: 'var(--fs-sm)', color: due.color,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"/>
              </svg>
              {due.text}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {task.source !== 'trello' && onToggle && (
            <button
              onClick={e => { e.stopPropagation(); onToggle(task.id, task.status, task.source); }}
              title={done ? 'Reopen' : 'Mark done'}
              style={{
                width: 18, height: 18, borderRadius: '50%', padding: 0,
                border: `1.5px solid ${done ? 'var(--success)' : 'var(--border)'}`,
                background: done ? 'var(--success)' : 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all var(--t-fast)',
              }}
            >
              {done && (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          )}

          {task.url && (
            <a href={task.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--hint)', textDecoration: 'none', flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
              }}
              title="Open"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({ col, cards, isDragOver, onDragOver, onDragLeave, onDrop, onToggle, onAddTask, onCardDragStart }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle]   = useState('');
  const taRef = useRef(null);

  useEffect(() => { if (adding) taRef.current?.focus(); }, [adding]);

  async function submit() {
    const t = title.trim();
    if (!t) return;
    await onAddTask(t);
    setTitle(''); setAdding(false);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      style={{
        minWidth: 272, maxWidth: 272,
        display: 'flex', flexDirection: 'column',
        // Column background — distinct from page bg
        background: isDragOver ? `${col.accent}08` : 'var(--surface)',
        border: `1px solid ${isDragOver ? col.accent : 'var(--border)'}`,
        borderTop: `3px solid ${col.accent}`,
        borderRadius: 'var(--radius-lg)',
        transition: 'border-color var(--t-fast), background var(--t-fast)',
        // Height management
        maxHeight: 'calc(100vh - 180px)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '11px 14px 10px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text)', flex: 1 }}>
          {col.name}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: col.accent, background: `${col.accent}14`,
          padding: '1px 8px', borderRadius: 'var(--radius-pill)',
          minWidth: 22, textAlign: 'center',
        }}>
          {cards.length}
        </span>
      </div>

      {/* Scrollable card list */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '10px 10px 2px',
        // Custom scrollbar
        scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent',
      }}>
        {cards.length === 0 && !adding && (
          <div style={{
            margin: '4px 0 8px', padding: '18px 12px',
            border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)',
            textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--hint)',
            transition: 'border-color var(--t-fast)',
          }}>
            {isDragOver ? 'Drop here' : 'No cards'}
          </div>
        )}
        {cards.map(c => (
          <Card key={c.id} task={c} onDragStart={onCardDragStart} onToggle={onToggle} />
        ))}
      </div>

      {/* Add card */}
      <div style={{ padding: '4px 10px 10px', flexShrink: 0 }}>
        {adding ? (
          <div>
            <textarea
              ref={taRef}
              rows={2}
              placeholder="Card title…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { setAdding(false); setTitle(''); }
              }}
              style={{
                width: '100%', fontSize: 'var(--fs-base)', resize: 'none',
                border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
                padding: '6px 8px', marginBottom: 6, fontFamily: 'inherit',
                lineHeight: 'var(--lh-normal)',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="primary" onClick={submit}
                style={{ fontSize: 'var(--fs-md)', padding: '5px 12px' }}>
                Add
              </button>
              <button onClick={() => { setAdding(false); setTitle(''); }}
                style={{ fontSize: 'var(--fs-md)', padding: '5px 10px' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 8px',
              fontSize: 'var(--fs-sm)', color: 'var(--muted)',
              background: 'transparent', borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            Add a card
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Notion Notes column ──────────────────────────────────────────────────────

function NoteCard({ note }) {
  const [hovered, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: 6,
        boxShadow: hovered ? 'var(--shadow-2)' : 'var(--shadow-1)',
        transition: 'box-shadow var(--t-fast), transform var(--t-fast)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px 9px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
        </svg>
        <span style={{
          flex: 1, fontSize: 'var(--fs-base)', fontWeight: 450, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {note.title || 'Untitled'}
        </span>
        {note.url && (
          <a href={note.url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--hint)', textDecoration: 'none', flexShrink: 0 }}
            title="Open in Notion"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
              <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

function NotionNotesColumn({ notes, onAdd }) {
  const [adding,    setAdding]    = useState(false);
  const [title,     setTitle]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [exporting, setExporting] = useState(false);
  const taRef = useRef(null);
  const ACCENT = '#8b5cf6';

  useEffect(() => { if (adding) taRef.current?.focus(); }, [adding]);

  async function exportMd() {
    setExporting(true);
    try {
      const r = await apiFetch('/api/notes/export');
      if (!r.ok) throw new Error((await r.json()).error || 'Export failed');
      const { files } = await r.json();
      if (!files?.length) { alert('No notes to export'); return; }

      // Download each file individually as .md
      for (const f of files) {
        const blob = new Blob([f.content], { type: 'text/markdown' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = f.name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        // small delay between downloads to avoid browser blocking
        await new Promise(r => setTimeout(r, 120));
      }
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  }

  async function submit() {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await onAdd(t);
      setTitle(''); setAdding(false);
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      minWidth: 272, maxWidth: 272, flexShrink: 0,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: `3px solid ${ACCENT}`, borderRadius: 'var(--radius-lg)',
      maxHeight: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 14px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text)', flex: 1 }}>
          Notion Notes
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: ACCENT,
          background: `${ACCENT}14`, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
          minWidth: 22, textAlign: 'center',
        }}>
          {notes.length}
        </span>
        <button
          onClick={exportMd}
          disabled={exporting || notes.length === 0}
          title="Export all notes as Markdown files"
          style={{
            padding: '2px 7px', fontSize: 10, fontWeight: 600,
            border: `1px solid ${ACCENT}30`, borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: ACCENT, cursor: notes.length ? 'pointer' : 'default',
            opacity: notes.length ? 1 : 0.4, display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
            <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
          </svg>
          {exporting ? '…' : 'MD'}
        </button>
      </div>

      {/* Note cards */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '10px 10px 2px',
        scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent',
      }}>
        {notes.length === 0 && !adding && (
          <div style={{
            margin: '4px 0 8px', padding: '18px 12px',
            border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)',
            textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--hint)',
          }}>
            No pages yet
          </div>
        )}
        {notes.map((n, i) => <NoteCard key={n.id ?? i} note={n} />)}
      </div>

      {/* Add page */}
      <div style={{ padding: '4px 10px 10px', flexShrink: 0 }}>
        {adding ? (
          <div>
            <textarea
              ref={taRef}
              rows={2}
              placeholder="Page title…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { setAdding(false); setTitle(''); }
              }}
              style={{
                width: '100%', fontSize: 'var(--fs-base)', resize: 'none',
                border: `1px solid ${ACCENT}`, borderRadius: 'var(--radius)',
                padding: '6px 8px', marginBottom: 6, fontFamily: 'inherit',
                lineHeight: 'var(--lh-normal)',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="primary" onClick={submit} disabled={saving}
                style={{ fontSize: 'var(--fs-md)', padding: '5px 12px' }}>
                {saving ? 'Creating…' : 'Add'}
              </button>
              <button onClick={() => { setAdding(false); setTitle(''); }}
                style={{ fontSize: 'var(--fs-md)', padding: '5px 10px' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 8px',
              fontSize: 'var(--fs-sm)', color: 'var(--muted)',
              background: 'transparent', borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            New page
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TaskPanel({ refreshKey, onGoToSettings }) {
  const [notionTasks,  setNotionTasks]  = useState([]);
  const [todoistTasks, setTodoistTasks] = useState([]);
  const [trelloLists,  setTrelloLists]  = useState([]);
  const [trelloCards,  setTrelloCards]  = useState([]);
  const [notionNotes,    setNotionNotes]    = useState([]);
  const [notionEnabled,  setNotionEnabled]  = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [newTask,      setNewTask]      = useState('');
  const [dragOver,     setDragOver]     = useState(null);
  const dragging = useRef(null);

  useEffect(() => { load(); }, [refreshKey]);

  async function load() {
    setLoading(true);
    try {
      const [tr, tsk, nt] = await Promise.all([
        apiFetch('/api/trello/board'),
        apiFetch('/api/tasks'),
        apiFetch('/api/notes'),
      ]);
      if (tr.ok)  { const d = await tr.json();  setTrelloLists(d.lists ?? []); setTrelloCards(d.cards ?? []); }
      if (tsk.ok) { const d = await tsk.json(); setNotionTasks(d.notion ?? []); setTodoistTasks(d.todoist ?? []); }
      if (nt.ok)  { const d = await nt.json();  setNotionEnabled(true); setNotionNotes(Array.isArray(d) ? d.slice(0, 10) : []); }
    } finally { setLoading(false); }
  }

  async function addTask(title) {
    const r = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) });
    if (r.ok) load();
  }

  async function addNote(title) {
    const r = await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ title }) });
    if (r.ok) {
      const note = await r.json();
      setNotionNotes(prev => [note, ...prev]);
    }
  }

  async function toggleDone(id, status, source) {
    const next = status === 'Done' ? 'Not started' : 'Done';
    await apiFetch('/api/task/update', { method: 'POST', body: JSON.stringify({ id, status: next, source }) });
    const up = ts => ts.map(x => x.id === id ? { ...x, status: next } : x);
    if (source === 'todoist') setTodoistTasks(up); else setNotionTasks(up);
  }

  function handleDragStart(card) { dragging.current = card; }

  async function handleDrop(targetColId) {
    const card = dragging.current;
    setDragOver(null);
    if (!card || card._colId === targetColId) { dragging.current = null; return; }

    if (card.source === 'trello') {
      setTrelloCards(prev => prev.map(c => c.id === card.id ? { ...c, listId: targetColId } : c));
      await apiFetch('/api/trello/move', { method: 'POST', body: JSON.stringify({ cardId: card.id, listId: targetColId }) });
    } else {
      const newStatus = COL_STATUS[targetColId] ?? 'Not started';
      const up = ts => ts.map(c => c.id === card.id ? { ...c, status: newStatus } : c);
      if (card.source === 'todoist') setTodoistTasks(up); else setNotionTasks(up);
      await apiFetch('/api/task/update', { method: 'POST', body: JSON.stringify({ id: card.id, status: newStatus, source: card.source }) });
    }
    dragging.current = null;
  }

  const hasTrello = trelloLists.length > 0;

  const columns = hasTrello
    ? trelloLists.map((l, i) => ({
        id: l.id, name: l.name, accent: COL_ACCENTS[i % COL_ACCENTS.length],
        cards: trelloCards.filter(c => c.listId === l.id).map(c => ({ ...c, source: 'trello', _colId: l.id })),
      }))
    : BUILT_IN.map(col => ({
        ...col,
        cards: [
          ...todoistTasks.map(t => ({ ...t, source: 'todoist', _colId: col.id })),
          ...notionTasks.map(t  => ({ ...t, source: 'notion',  _colId: col.id })),
        ].filter(t => (STATUS_COL[t.status] ?? 'todo') === col.id),
      }));

  const hasAny = columns.some(c => c.cards.length > 0) || notionEnabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexShrink: 0,
      }}>
        <input
          placeholder="Quick-add a task…"
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { addTask(newTask.trim()); setNewTask(''); } }}
          style={{ flex: 1, fontSize: 'var(--fs-base)' }}
        />
        <button className="primary"
          onClick={() => { if (newTask.trim()) { addTask(newTask.trim()); setNewTask(''); } }}
          style={{ fontSize: 'var(--fs-base)', whiteSpace: 'nowrap' }}
        >
          Add task
        </button>
        {loading && (
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--hint)', whiteSpace: 'nowrap' }}>
            Loading…
          </span>
        )}
      </div>

      {/* Empty */}
      {!loading && !hasAny && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
          <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--muted)', margin: 0, fontWeight: 500 }}>No tasks yet</p>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--hint)', margin: 0 }}>
            Connect Todoist, Notion, or Trello in Settings
          </p>
          <button onClick={onGoToSettings} style={{ marginTop: 4, fontSize: 'var(--fs-sm)', padding: '6px 14px' }}>
            Open Settings
          </button>
        </div>
      )}

      {/* Board */}
      {hasAny && (
        <div
          onDragEnd={() => { dragging.current = null; setDragOver(null); }}
          style={{
            display: 'flex', gap: 12, overflowX: 'auto', flex: 1,
            alignItems: 'flex-start', paddingBottom: 16,
            // Subtle scrollbar
            scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent',
          }}
        >
          {columns.map(col => (
            <Column
              key={col.id}
              col={col}
              cards={col.cards.map(c => ({ ...c, _colId: col.id }))}
              isDragOver={dragOver === col.id}
              onDragOver={() => setDragOver(col.id)}
              onDragLeave={() => setDragOver(d => d === col.id ? null : d)}
              onDrop={() => handleDrop(col.id)}
              onToggle={hasTrello ? null : toggleDone}
              onAddTask={addTask}
              onCardDragStart={handleDragStart}
            />
          ))}

          {/* Notion Notes column */}
          {notionEnabled && <NotionNotesColumn notes={notionNotes} onAdd={addNote} />}
        </div>
      )}
    </div>
  );
}
