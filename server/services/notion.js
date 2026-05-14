// server/services/notion.js
import { Client } from '@notionhq/client';

if (!process.env.NOTION_API_KEY) console.warn('[notion] NOTION_API_KEY is not set');
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const TASKS_DB = process.env.NOTION_TASKS_DB_ID;
const NOTES_DB = process.env.NOTION_NOTES_DB_ID;

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasks() {
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
        res = await query(false); // Status property doesn't exist — fetch all
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

export async function createTask(title, status = 'Not started') {
  try {
    const page = await notion.pages.create({
      parent: { database_id: TASKS_DB },
      properties: {
        Name:   { title: [{ text: { content: title } }] },
        Status: { select: { name: status } },
      },
    });
    return { id: page.id, title, status, url: page.url };
  } catch (err) {
    if (err.code === 'unauthorized') throw new Error('Notion API token is invalid or expired — update NOTION_API_KEY in .env');
    console.error('[notion] createTask:', err.message);
    throw err;
  }
}

export async function updateTaskStatus(pageId, status) {
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

export async function getNotes() {
  try {
    const res = await notion.databases.query({
      database_id: NOTES_DB,
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

export async function createNote(title, body = '') {
  try {
    const page = await notion.pages.create({
      parent: { database_id: NOTES_DB },
      properties: {
        Name: { title: [{ text: { content: title } }] },
      },
      children: body
        ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: body } }] } }]
        : [],
    });
    return { id: page.id, title, url: page.url };
  } catch (err) {
    if (err.code === 'unauthorized') throw new Error('Notion API token is invalid or expired — update NOTION_API_KEY in .env');
    console.error('[notion] createNote:', err.message);
    throw err;
  }
}

export async function updateTask(pageId, patches = {}) {
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

export async function deleteTask(pageId) {
  // Notion doesn't permanently delete pages — archives them
  try {
    await notion.pages.update({ page_id: pageId, archived: true });
    return { deleted: true, id: pageId };
  } catch (err) {
    console.error('[notion] deleteTask:', err.message);
    throw err;
  }
}

export default { getTasks, createTask, updateTaskStatus, updateTask, deleteTask, getNotes, createNote };
