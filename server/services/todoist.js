// server/services/todoist.js
// Todoist API v1

const BASE = 'https://api.todoist.com/api/v1';

function headers() {
  return {
    Authorization: `Bearer ${process.env.TODOIST_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function isConfigured() {
  return !!process.env.TODOIST_API_KEY;
}

function formatTask(t) {
  return {
    id:     t.id,
    title:  t.content,
    status: t.checked ? 'Done' : 'Not started',
    source: 'todoist',
  };
}

export async function createTask(title, dueDateString = 'today') {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${BASE}/tasks`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify({ content: title, due_string: dueDateString }),
    });
    if (!res.ok) throw new Error(`Todoist ${res.status}: ${await res.text()}`);
    return formatTask(await res.json());
  } catch (err) {
    console.error('[todoist] createTask:', err.message);
    return null;
  }
}

export async function getTasks(filter = 'today | overdue') {
  if (!isConfigured()) return [];
  try {
    const res = await fetch(`${BASE}/tasks?filter=${encodeURIComponent(filter)}`, { headers: headers() });
    if (!res.ok) throw new Error(`Todoist ${res.status}`);
    const data = await res.json();
    // v1 returns { results: [...], next_cursor }
    const tasks = Array.isArray(data) ? data : (data.results ?? []);
    return tasks.map(formatTask);
  } catch (err) {
    console.error('[todoist] getTasks:', err.message);
    return [];
  }
}

export async function updateTaskStatus(taskId, status) {
  if (!isConfigured()) return null;
  try {
    const endpoint = status === 'Done'
      ? `${BASE}/tasks/${taskId}/close`
      : `${BASE}/tasks/${taskId}/reopen`;
    const res = await fetch(endpoint, { method: 'POST', headers: headers() });
    if (!res.ok) throw new Error(`Todoist ${res.status}`);
    return { id: taskId, status };
  } catch (err) {
    console.error('[todoist] updateTaskStatus:', err.message);
    throw err;
  }
}

export default { createTask, getTasks, updateTaskStatus, isConfigured };
