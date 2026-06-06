// server/services/gmail.js
import { google } from 'googleapis';
import { getAuthClient } from './auth.js';
import llm from './llm.js';

async function gmail(userId) {
  return google.gmail({ version: 'v1', auth: await getAuthClient(userId) });
}

// ─── Read inbox ───────────────────────────────────────────────────────────────

export async function getInbox(userId, maxResults = 10) {
  try {
    const g   = await gmail(userId);
    const res = await g.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'is:unread in:inbox',
    });

    const messages = res.data.messages ?? [];
    const emails   = await Promise.all(
      messages.map(m => getEmail(userId, m.id))
    );
    return emails.filter(Boolean);
  } catch (err) {
    if (err.code === 401 || err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
      const authErr = new Error('Google authentication required');
      authErr.code = 'GOOGLE_AUTH_REQUIRED';
      throw authErr;
    }
    console.error('[gmail] getInbox:', err.message);
    return [];
  }
}

export async function getEmail(userId, messageId) {
  try {
    const g   = await gmail(userId);
    const res = await g.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const headers = res.data.payload?.headers ?? [];
    const get     = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const { text, html } = extractBody(res.data.payload);

    return {
      id:       messageId,
      threadId: res.data.threadId,
      from:     get('From'),
      to:       get('To'),
      subject:  get('Subject'),
      date:     get('Date'),
      snippet:  res.data.snippet ?? '',
      body:     text,
      htmlBody: html,
    };
  } catch (err) {
    console.error('[gmail] getEmail:', err.message);
    return null;
  }
}

function extractBody(payload) {
  if (!payload) return { text: '', html: null };

  // Simple non-multipart email
  if (payload.body?.data) {
    const raw = decode64(payload.body.data);
    const isHtml = payload.mimeType === 'text/html';
    return { text: isHtml ? stripHtml(raw) : raw, html: isHtml ? raw : null };
  }

  // Multipart — collect both text/plain and text/html
  if (payload.parts?.length) {
    const plainPart = findPart(payload.parts, 'text/plain');
    const htmlPart  = findPart(payload.parts, 'text/html');

    const html = htmlPart?.body?.data  ? decode64(htmlPart.body.data)  : null;
    const text = plainPart?.body?.data ? decode64(plainPart.body.data)
               : html                  ? stripHtml(html)
               : '';

    return { text, html };
  }

  return { text: payload.snippet ?? '', html: null };
}

function findPart(parts, mimeType) {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part;
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function decode64(data) {
  return Buffer.from(data, 'base64').toString('utf8');
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Triage — batch all emails in ONE LLM call ───────────────────────────────

export async function triageInbox(userId, maxResults = 15) {
  // Let GOOGLE_AUTH_REQUIRED propagate — callers handle it
  const emails = await getInbox(userId, maxResults);
  if (!emails.length) return [];

  // Build a compact numbered list — less tokens than JSON
  const list = emails.map((e, i) =>
    `${i}. From:${e.from} Sub:${e.subject} Body:${(e.body ?? e.snippet ?? '').slice(0, 150)}`
  ).join('\n');

  const schema = `Return a JSON array (one object per email, same order):
[{"i":0,"priority":"P1|P2|P3","urgencyScore":1-10,"intent":"one sentence","draftReply":"short reply or null if P3"}]`;

  try {
    const results = await llm.classify(`Triage these emails:\n${list}`, schema);
    const arr = Array.isArray(results) ? results : (results.emails ?? results.result ?? []);
    return emails
      .map((e, i) => ({ ...e, ...(arr.find(r => r.i === i) ?? { priority: 'P2', urgencyScore: 5, intent: '', draftReply: null }) }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (err) {
    console.error('[gmail] triageInbox batch:', err.message);
    return emails
      .map(e => ({ ...e, priority: 'P2', urgencyScore: 5, intent: '', draftReply: null }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

// ─── Draft + Send ─────────────────────────────────────────────────────────────

export async function createDraft(userId, to, subject, body) {
  try {
    const g   = await gmail(userId);
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    const res = await g.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
    return { id: res.data.id, to, subject };
  } catch (err) {
    console.error('[gmail] createDraft:', err.message);
    throw err;
  }
}

export async function sendEmail(userId, to, subject, body) {
  try {
    const g   = await gmail(userId);
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    await g.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { sent: true, to, subject };
  } catch (err) {
    console.error('[gmail] sendEmail:', err.message);
    throw err;
  }
}

export async function archiveEmail(userId, messageId) {
  try {
    const g = await gmail(userId);
    await g.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['INBOX', 'UNREAD'] },
    });
    return { archived: true, id: messageId };
  } catch (err) {
    console.error('[gmail] archiveEmail:', err.message);
    throw err;
  }
}

// ─── Emails by date range ─────────────────────────────────────────────────────

export async function getEmailsByDateRange(userId, startDate, endDate, maxResults = 30) {
  try {
    const after  = toGmailDate(startDate);
    const before = endDate ? toGmailDate(endDate) : null;
    const q      = `in:inbox after:${after}${before ? ` before:${before}` : ''}`;

    const g        = await gmail(userId);
    const res      = await g.users.messages.list({ userId: 'me', maxResults, q });
    const messages = res.data.messages ?? [];
    const emails   = await Promise.all(messages.map(m => getEmail(userId, m.id)));
    return emails.filter(Boolean);
  } catch (err) {
    console.error('[gmail] getEmailsByDateRange:', err.message);
    return [];
  }
}

function toGmailDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr; // already formatted or relative
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}/${mo}/${dd}`;
}

export default { getInbox, getEmail, getEmailsByDateRange, triageInbox, createDraft, sendEmail, archiveEmail };
