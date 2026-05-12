// server/services/gmail.js
import { google } from 'googleapis';
import { getAuthClient } from './auth.js';
import llm from './llm.js';

function gmail() {
  return google.gmail({ version: 'v1', auth: getAuthClient() });
}

// ─── Read inbox ───────────────────────────────────────────────────────────────

export async function getInbox(maxResults = 10) {
  try {
    const res = await gmail().users.messages.list({
      userId: 'me',
      maxResults,
      q: 'is:unread in:inbox',
    });

    const messages = res.data.messages ?? [];
    const emails   = await Promise.all(
      messages.map(m => getEmail(m.id))
    );
    return emails.filter(Boolean);
  } catch (err) {
    console.error('[gmail] getInbox:', err.message);
    return [];
  }
}

export async function getEmail(messageId) {
  try {
    const res     = await gmail().users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const headers = res.data.payload?.headers ?? [];
    const get     = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const bodyPart = res.data.payload?.parts?.find(p => p.mimeType === 'text/plain')
                  ?? res.data.payload;
    const body = bodyPart?.body?.data
      ? Buffer.from(bodyPart.body.data, 'base64').toString('utf8').slice(0, 500)
      : '';

    return {
      id:        messageId,
      threadId:  res.data.threadId,
      from:      get('From'),
      to:        get('To'),
      subject:   get('Subject'),
      date:      get('Date'),
      snippet:   res.data.snippet ?? '',
      body,
    };
  } catch (err) {
    console.error('[gmail] getEmail:', err.message);
    return null;
  }
}

// ─── Triage — batch all emails in ONE LLM call ───────────────────────────────

export async function triageInbox(maxResults = 15) {
  const emails = await getInbox(maxResults);
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
      .sort((a, b) => b.urgencyScore - a.urgencyScore);
  } catch (err) {
    console.error('[gmail] triageInbox batch:', err.message);
    return emails.map(e => ({ ...e, priority: 'P2', urgencyScore: 5, intent: '', draftReply: null }));
  }
}

// ─── Draft + Send ─────────────────────────────────────────────────────────────

export async function createDraft(to, subject, body) {
  try {
    const raw     = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    const res     = await gmail().users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
    return { id: res.data.id, to, subject };
  } catch (err) {
    console.error('[gmail] createDraft:', err.message);
    throw err;
  }
}

export async function sendEmail(to, subject, body) {
  try {
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    await gmail().users.messages.send({ userId: 'me', requestBody: { raw } });
    return { sent: true, to, subject };
  } catch (err) {
    console.error('[gmail] sendEmail:', err.message);
    throw err;
  }
}

export async function archiveEmail(messageId) {
  try {
    await gmail().users.messages.modify({
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

export default { getInbox, getEmail, triageInbox, createDraft, sendEmail, archiveEmail };
