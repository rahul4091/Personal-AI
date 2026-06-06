// server/services/notion.js
import { Client } from '@notionhq/client';

function getClient(creds = {}) {
  return new Client({ auth: creds.NOTION_API_KEY });
}

// Fall back to notes DB if tasks DB isn't set — user may use one DB for everything
function tasksDb(creds = {}) { return creds.NOTION_TASKS_DB_ID ?? creds.NOTION_NOTES_DB_ID; }
function notesDb(creds = {}) { return creds.NOTION_NOTES_DB_ID ?? creds.NOTION_TASKS_DB_ID; }

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasks(creds = {}) {
  const notion = getClient(creds);
  const TASKS_DB = tasksDb(creds);

  async function query(withFilter) {
    return notion.databases.query({
      database_id: TASKS_DB,
      ...(withFilter && {
        filter: { property: 'Status', select: { does_not_equal: 'Done' } },
      }),
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 20,
    });
  }

  try {
    let res;
    try {
      res = await query(true);
    } catch (filterErr) {
      if (filterErr.code === 'validation_error') {
        res = await query(false);
      } else {
        throw filterErr;
      }
    }
    return res.results.map(page => ({
      id:     page.id,
      title:  page.properties.Name?.title?.[0]?.plain_text ?? 'Untitled',
      status: page.properties.Status?.select?.name ?? 'Not started',
      url:    page.url,
      source: 'notion',
    }));
  } catch (err) {
    const hint = err.code === 'unauthorized' ? ' (check NOTION_API_KEY)' : '';
    console.error('[notion] getTasks:', err.message + hint);
    return [];
  }
}

export async function createTask(title, status = 'Not started', creds = {}) {
  const notion = getClient(creds);
  try {
    const page = await notion.pages.create({
      parent: { database_id: tasksDb(creds) },
      properties: {
        Name:   { title: [{ text: { content: title } }] },
        Status: { select: { name: status } },
      },
    });
    return { id: page.id, title, status, url: page.url };
  } catch (err) {
    if (err.code === 'unauthorized') throw new Error('Notion API token is invalid or expired — update it in Settings → Notion');
    console.error('[notion] createTask:', err.message);
    throw err;
  }
}

export async function updateTaskStatus(pageId, status, creds = {}) {
  const notion = getClient(creds);
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: { Status: { select: { name: status } } },
    });
    return { id: pageId, status };
  } catch (err) {
    console.error('[notion] updateTaskStatus:', err.message);
    throw err;
  }
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function getNotes(creds = {}) {
  const notion = getClient(creds);
  try {
    const res = await notion.databases.query({
      database_id: notesDb(creds),
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 10,
    });

    return res.results.map(page => ({
      id:    page.id,
      title: page.properties.Name?.title?.[0]?.plain_text ?? 'Untitled',
      url:   page.url,
    }));
  } catch (err) {
    const hint = err.code === 'unauthorized' ? ' (check NOTION_API_KEY)' : '';
    console.error('[notion] getNotes:', err.message + hint);
    return [];
  }
}

export async function createNote(title, body = '', creds = {}) {
  const notion = getClient(creds);
  try {
    const page = await notion.pages.create({
      parent: { database_id: notesDb(creds) },
      properties: {
        Name: { title: [{ text: { content: title } }] },
      },
      children: body
        ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: body } }] } }]
        : [],
    });
    return { id: page.id, title, url: page.url };
  } catch (err) {
    if (err.code === 'unauthorized') throw new Error('Notion API token is invalid or expired — update it in Settings → Notion');
    console.error('[notion] createNote:', err.message);
    throw err;
  }
}

export async function updateTask(pageId, patches = {}, creds = {}) {
  const notion = getClient(creds);
  try {
    const properties = {};
    if (patches.title)  properties.Name   = { title: [{ text: { content: patches.title } }] };
    if (patches.status) properties.Status = { select: { name: patches.status } };
    await notion.pages.update({ page_id: pageId, properties });
    return { id: pageId, ...patches };
  } catch (err) {
    console.error('[notion] updateTask:', err.message);
    throw err;
  }
}

export async function deleteTask(pageId, creds = {}) {
  const notion = getClient(creds);
  try {
    await notion.pages.update({ page_id: pageId, archived: true });
    return { deleted: true, id: pageId };
  } catch (err) {
    console.error('[notion] deleteTask:', err.message);
    throw err;
  }
}

// ─── Markdown export ─────────────────────────────────────────────────────────

function richTextToMd(richText = []) {
  return richText.map(t => {
    let s = t.plain_text ?? '';
    if (t.annotations?.bold)          s = `**${s}**`;
    if (t.annotations?.italic)        s = `*${s}*`;
    if (t.annotations?.code)          s = `\`${s}\``;
    if (t.annotations?.strikethrough) s = `~~${s}~~`;
    if (t.href)                        s = `[${s}](${t.href})`;
    return s;
  }).join('');
}

function blockToMd(block, counters = {}) {
  const type = block.type;
  const b    = block[type] ?? {};
  const text = richTextToMd(b.rich_text ?? []);

  switch (type) {
    case 'heading_1':         return `# ${text}`;
    case 'heading_2':         return `## ${text}`;
    case 'heading_3':         return `### ${text}`;
    case 'paragraph':         return text || '';
    case 'bulleted_list_item':return `- ${text}`;
    case 'numbered_list_item':{
      counters[type] = (counters[type] ?? 0) + 1;
      return `${counters[type]}. ${text}`;
    }
    case 'to_do':             return `- [${b.checked ? 'x' : ' '}] ${text}`;
    case 'quote':             return `> ${text}`;
    case 'code':              return `\`\`\`${b.language ?? ''}\n${text}\n\`\`\``;
    case 'divider':           return '---';
    case 'callout':           return `> **${richTextToMd(b.icon ? [] : [])}** ${text}`;
    case 'toggle':            return `- ${text}`;
    case 'image': {
      const url = b.type === 'external' ? b.external?.url : b.file?.url;
      return url ? `![image](${url})` : '';
    }
    default: return text || '';
  }
}

async function getPageBlocks(pageId, notion) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

export async function exportNotesAsMarkdown(creds = {}) {
  const n = getClient(creds);
  const notes = await getNotes(creds);
  const files = [];

  for (const note of notes) {
    try {
      const blocks  = await getPageBlocks(note.id, n);
      const counters = {};
      const body    = blocks.map(b => blockToMd(b, counters)).filter(Boolean).join('\n\n');
      const md      = `# ${note.title}\n\n> Source: ${note.url}\n\n${body}`;
      const slug    = note.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60) || note.id;
      files.push({ name: `${slug}.md`, content: md });
    } catch (err) {
      console.error(`[notion] export failed for "${note.title}":`, err.message);
      files.push({ name: `${note.id}.md`, content: `# ${note.title}\n\n*Export failed: ${err.message}*` });
    }
  }
  return files;
}

export default { getTasks, createTask, updateTaskStatus, updateTask, deleteTask, getNotes, createNote, exportNotesAsMarkdown };
