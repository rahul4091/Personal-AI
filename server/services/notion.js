// server/services/notion.js
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const TASKS_DB = process.env.NOTION_TASKS_DB_ID;
const NOTES_DB = process.env.NOTION_NOTES_DB_ID;

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasks() {
  try {
    const res = await notion.databases.query({
      database_id: TASKS_DB,
      filter: {
        property: 'Status',
        select: { does_not_equal: 'Done' },
      },
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 20,
    });

    return res.results.map(page => ({
      id:     page.id,
      title:  page.properties.Name?.title?.[0]?.plain_text ?? 'Untitled',
      status: page.properties.Status?.select?.name ?? 'Not started',
      url:    page.url,
    }));
  } catch (err) {
    console.error('[notion] getTasks:', err.message);
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
    console.error('[notion] getNotes:', err.message);
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
    console.error('[notion] createNote:', err.message);
    throw err;
  }
}

export default { getTasks, createTask, updateTaskStatus, getNotes, createNote };
