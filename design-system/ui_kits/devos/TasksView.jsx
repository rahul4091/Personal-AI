/* global React */
// Tasks — Notion + Todoist + GitHub PRs + Trello, unified.

const SAMPLE_NOTION = [
  { id: "n1", title: "Q3 OKR draft", status: "In progress", source: "notion", url: "#" },
  { id: "n2", title: "Refactor auth refresh logic", status: "Not started", source: "notion", url: "#" },
  { id: "n3", title: "Write changelog for v0.7", status: "Done", source: "notion" },
];
const SAMPLE_TODOIST = [
  { id: "t1", title: "Reply to Alex re Q3 deck", status: "Not started", source: "todoist", url: "#" },
  { id: "t2", title: "Renew domain (ends Apr 20)", status: "In progress", source: "todoist" },
];
const SAMPLE_PRS = [
  { id: 847, title: "auth: refresh token rotation", url: "#", daysStale: 3 },
  { id: 851, title: "calendar: handle DST edges", url: "#", daysStale: 1 },
];
const SAMPLE_CARDS = [
  { id: "c1", title: "Design review — new digest layout", url: "#", daysStale: 6 },
  { id: "c2", title: "QA — Trello sync polling", url: "#", daysStale: 2 },
];

function TasksView() {
  const [notion,  setNotion]  = React.useState(SAMPLE_NOTION);
  const [todoist, setTodoist] = React.useState(SAMPLE_TODOIST);
  const [prs]                 = React.useState(SAMPLE_PRS);
  const [cards]               = React.useState(SAMPLE_CARDS);
  const [newTask, setNewTask] = React.useState("");

  function addTask() {
    if (!newTask.trim()) return;
    setNotion(n => [...n, { id: "n" + Date.now(), title: newTask.trim(), status: "Not started", source: "notion" }]);
    setNewTask("");
  }
  function updateStatus(id, status, source) {
    if (source === "todoist") setTodoist(t => t.map(x => x.id === id ? { ...x, status } : x));
    else setNotion(t => t.map(x => x.id === id ? { ...x, status } : x));
  }

  const statusDot = s => (
    <span style={{
      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
      background: s === "Done" ? "var(--success)" : s === "In progress" ? "var(--info)" : "var(--hint)",
    }} />
  );

  function TaskRow({ task }) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--surface)", border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 6,
      }}>
        {statusDot(task.status)}
        <span style={{ flex: 1, fontSize: 13 }}>{task.title}</span>
        <select
          value={task.status}
          onChange={e => updateStatus(task.id, e.target.value, task.source)}
          style={{
            fontSize: 11, border: "0.5px solid var(--border)", borderRadius: 4,
            padding: "2px 6px", background: "var(--bg)", fontFamily: "inherit", color: "var(--text)",
          }}>
          <option>Not started</option>
          <option>In progress</option>
          <option>Done</option>
        </select>
        {task.url && <a href={task.url} style={{ fontSize: 11, color: "var(--info)" }}>↗</a>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Tasks</h2>
        <Button>Refresh</Button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Input placeholder="Add a task…" value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()} />
        <Button variant="primary" onClick={addTask} style={{ whiteSpace: "nowrap" }}>Add task</Button>
      </div>

      <Eyebrow style={{ marginTop: 14 }}>Notion</Eyebrow>
      {notion.map(t => <TaskRow key={t.id} task={t} />)}

      <Eyebrow style={{ marginTop: 14 }}>Todoist</Eyebrow>
      {todoist.map(t => <TaskRow key={t.id} task={t} />)}

      <Eyebrow style={{ marginTop: 14 }}>GitHub PRs</Eyebrow>
      {prs.map(pr => (
        <div key={pr.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--surface)", border: "0.5px solid var(--border)",
          borderLeft: pr.daysStale >= 3 ? "3px solid var(--danger)" : undefined,
          borderRadius: pr.daysStale >= 3 ? "0 var(--radius) var(--radius) 0" : "var(--radius)",
          padding: "8px 12px", marginBottom: 6,
        }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>#{pr.id}</span>
          <span style={{ flex: 1, fontSize: 13 }}>{pr.title}</span>
          {pr.daysStale >= 3 && <Tag variant="danger">{pr.daysStale}d stale</Tag>}
          <a href={pr.url} style={{ fontSize: 11, color: "var(--info)" }}>View ↗</a>
        </div>
      ))}

      <Eyebrow style={{ marginTop: 14 }}>Trello cards</Eyebrow>
      {cards.map(card => (
        <div key={card.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--surface)", border: "0.5px solid var(--border)",
          borderLeft: card.daysStale >= 5 ? "3px solid var(--danger)" : undefined,
          borderRadius: card.daysStale >= 5 ? "0 var(--radius) var(--radius) 0" : "var(--radius)",
          padding: "8px 12px", marginBottom: 6,
        }}>
          <span style={{ flex: 1, fontSize: 13 }}>{card.title}</span>
          {card.daysStale >= 5 && <Tag variant="danger">{card.daysStale}d stale</Tag>}
          <a href={card.url} style={{ fontSize: 11, color: "var(--info)" }}>View ↗</a>
        </div>
      ))}
    </div>
  );
}

window.TasksView = TasksView;
