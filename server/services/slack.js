// server/services/slack.js
import { WebClient } from '@slack/web-api';

function getClient(creds = {}) {
  return new WebClient(creds.SLACK_BOT_TOKEN);
}

function getUserId(creds = {}) {
  return creds.SLACK_USER_ID;
}

function isConfigured(creds = {}) {
  return !!(creds.SLACK_BOT_TOKEN) && !!getUserId(creds);
}

// ─── Send plain text DM ───────────────────────────────────────────────────────

export async function sendDM(text, creds = {}) {
  if (!isConfigured(creds)) {
    console.log('[slack] not configured — skipping DM');
    return null;
  }
  try {
    const res = await getClient(creds).chat.postMessage({ channel: getUserId(creds), text });
    return res.ts;
  } catch (err) {
    const code = err.data?.error ?? err.code ?? '';
    console.error(`[slack] sendDM failed${code ? ' (' + code + ')' : ''}: ${err.message}`);
    if (err.data) console.error('[slack] sendDM response:', JSON.stringify(err.data));
    return null;
  }
}

// ─── Send rich Block Kit digest ───────────────────────────────────────────────

export async function sendDigest(digest, creds = {}) {
  if (!isConfigured(creds)) {
    console.log('[slack] not configured — digest not sent');
    return null;
  }

  const { comms, calendar, tasks, content } = digest;
  const userId = getUserId(creds);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `DevOS Morning Digest — ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })}` },
    },
    { type: 'divider' },
  ];

  if (comms?.pending?.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Comms* — ${comms.pending.length} items need attention` },
    });
    comms.pending.slice(0, 3).forEach(e => {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `${e.priority === 'P1' ? ':red_circle:' : ':yellow_circle:'} *${e.subject}*\nFrom: ${e.from}\n${e.intent ?? ''}` },
      });
    });
    blocks.push({ type: 'divider' });
  }

  if (calendar?.conflicts?.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:warning: *${calendar.conflicts.length} calendar conflict(s)* — reschedule drafts ready` },
    });
  }
  if (calendar?.events?.length) {
    const nextEvent = calendar.events[0];
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:calendar: Next: *${nextEvent.title}* at ${new Date(nextEvent.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` },
    });
    blocks.push({ type: 'divider' });
  }

  if (tasks?.blockers?.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:octagonal_sign: *${tasks.blockers.length} blocker(s)* — ${tasks.blockers.map(b => b.title).join(', ')}` },
    });
    blocks.push({ type: 'divider' });
  }

  if (content?.drafts?.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:pencil: *${content.drafts.length} content draft(s) ready* — ${content.drafts.map(d => d.type).join(', ')}` },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `DevOS Agent · ${new Date().toLocaleTimeString()}` }],
  });

  try {
    const res = await getClient(creds).chat.postMessage({ channel: userId, blocks, text: 'DevOS Morning Digest' });
    return res.ts;
  } catch (err) {
    const code = err.data?.error ?? err.code ?? '';
    console.error(`[slack] sendDigest failed${code ? ' (' + code + ')' : ''}: ${err.message}`);
    if (err.data) console.error('[slack] sendDigest response:', JSON.stringify(err.data));
    return null;
  }
}

// ─── P1 alert ─────────────────────────────────────────────────────────────────

export async function sendAlert(title, body, urgency = 'normal', creds = {}) {
  const icon = urgency === 'high' ? ':rotating_light:' : ':bell:';
  return sendDM(`${icon} *${title}*\n${body}`, creds);
}

export default { sendDM, sendDigest, sendAlert };
