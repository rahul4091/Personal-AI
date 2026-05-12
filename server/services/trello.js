// server/services/trello.js
// Trello REST API — no SDK needed

const BASE  = 'https://api.trello.com/1';
const KEY   = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD = process.env.TRELLO_BOARD_ID;

function auth() {
  return `key=${KEY}&token=${TOKEN}`;
}

async function trelloFetch(path, method = 'GET', body = null) {
  if (!KEY || !TOKEN) return null;
  try {
    const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}${auth()}`, {
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

export async function getLists() {
  if (!BOARD) return [];
  const data = await trelloFetch(`/boards/${BOARD}/lists`);
  return data ?? [];
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export async function getCards() {
  if (!BOARD) return [];
  const data = await trelloFetch(`/boards/${BOARD}/cards?fields=id,name,idList,dateLastActivity,due,desc,url,idMembers`);
  if (!data) return [];

  return data.map(card => ({
    id:           card.id,
    title:        card.name,
    listId:       card.idList,
    url:          card.url,
    desc:         card.desc,
    due:          card.due,
    updatedAt:    card.dateLastActivity,
    daysStale:    Math.floor((Date.now() - new Date(card.dateLastActivity)) / 86400000),
  }));
}

export async function createCard(title, listId, desc = '') {
  const data = await trelloFetch('/cards', 'POST', { name: title, idList: listId, desc });
  if (!data) throw new Error('Failed to create Trello card');
  return { id: data.id, title: data.name, url: data.url };
}

export async function moveCard(cardId, targetListId) {
  const data = await trelloFetch(`/cards/${cardId}`, 'PUT', { idList: targetListId });
  return data ? { id: cardId, listId: targetListId } : null;
}

export async function updateCard(cardId, fields = {}) {
  return trelloFetch(`/cards/${cardId}`, 'PUT', fields);
}

// ─── Staleness scan ───────────────────────────────────────────────────────────

export async function scanStaleCards(thresholdDays = 5) {
  const cards = await getCards();
  return cards.filter(c => c.daysStale >= thresholdDays);
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

// Find a card linked to a GitHub PR by branch naming convention:
// branch name should contain "CARD-{trelloCardShortId}" or card title matches PR title
export async function findCardForPR(prTitle) {
  const cards = await getCards();
  return cards.find(c =>
    prTitle.toLowerCase().includes(c.title.toLowerCase().slice(0, 20)) ||
    c.desc?.includes(prTitle)
  ) ?? null;
}

export default { getLists, getCards, createCard, moveCard, updateCard, scanStaleCards, findCardForPR };
