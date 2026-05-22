// server/services/trello.js
// Trello REST API — no SDK needed

const BASE  = 'https://api.trello.com/1';

function getKey(creds = {})   { return creds.TRELLO_API_KEY; }
function getToken(creds = {}) { return creds.TRELLO_TOKEN; }
function getBoard(creds = {}) { return creds.TRELLO_BOARD_ID; }

function auth(creds = {}) {
  return `key=${getKey(creds)}&token=${getToken(creds)}`;
}

async function trelloFetch(path, method = 'GET', body = null, creds = {}) {
  if (!getKey(creds) || !getToken(creds)) return null;
  try {
    const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}${auth(creds)}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Trello ${res.status}: ${path}`);
    return res.json();
  } catch (err) {
    console.error('[trello]', err.message);
    return null;
  }
}

// ─── Lists (columns) ──────────────────────────────────────────────────────────

export async function getLists(creds = {}) {
  const board = getBoard(creds);
  if (!board) return [];
  const data = await trelloFetch(`/boards/${board}/lists`, 'GET', null, creds);
  return data ?? [];
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export async function getCards(creds = {}) {
  const board = getBoard(creds);
  if (!board) return [];
  const data = await trelloFetch(`/boards/${board}/cards?fields=id,name,idList,dateLastActivity,due,desc,url,idMembers`, 'GET', null, creds);
  if (!data) return [];

  return data.map(card => ({
    id:        card.id,
    title:     card.name,
    listId:    card.idList,
    url:       card.url,
    desc:      card.desc,
    due:       card.due,
    updatedAt: card.dateLastActivity,
    daysStale: Math.floor((Date.now() - new Date(card.dateLastActivity)) / 86400000),
  }));
}

export async function createCard(title, listId, desc = '', creds = {}) {
  const data = await trelloFetch('/cards', 'POST', { name: title, idList: listId, desc }, creds);
  if (!data) throw new Error('Failed to create Trello card');
  return { id: data.id, title: data.name, url: data.url };
}

export async function moveCard(cardId, targetListId, creds = {}) {
  const data = await trelloFetch(`/cards/${cardId}`, 'PUT', { idList: targetListId }, creds);
  return data ? { id: cardId, listId: targetListId } : null;
}

export async function updateCard(cardId, fields = {}, creds = {}) {
  return trelloFetch(`/cards/${cardId}`, 'PUT', fields, creds);
}

// ─── Staleness scan ───────────────────────────────────────────────────────────

export async function scanStaleCards(thresholdDays = 5, creds = {}) {
  const cards = await getCards(creds);
  return cards.filter(c => c.daysStale >= thresholdDays);
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

export async function findCardForPR(prTitle, creds = {}) {
  const cards = await getCards(creds);
  return cards.find(c =>
    prTitle.toLowerCase().includes(c.title.toLowerCase().slice(0, 20)) ||
    c.desc?.includes(prTitle)
  ) ?? null;
}

export default { getLists, getCards, createCard, moveCard, updateCard, scanStaleCards, findCardForPR };
