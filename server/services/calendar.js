// server/services/calendar.js
import { google } from 'googleapis';
import { getAuthClient } from './auth.js';
import llm from './llm.js';

function cal() {
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}

// ─── Read events ──────────────────────────────────────────────────────────────

export async function getUpcoming(maxResults = 10) {
  try {
    const res = await cal().events.list({
      calendarId: 'primary',
      timeMin:    new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy:    'startTime',
    });

    return (res.data.items ?? []).map(formatEvent);
  } catch (err) {
    console.error('[calendar] getUpcoming:', err.message);
    return [];
  }
}

export async function getWeekEvents() {
  try {
    const now  = new Date();
    const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const res  = await cal().events.list({
      calendarId:   'primary',
      timeMin:      now.toISOString(),
      timeMax:      week.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   50,
    });
    return (res.data.items ?? []).map(formatEvent);
  } catch (err) {
    console.error('[calendar] getWeekEvents:', err.message);
    return [];
  }
}

function formatEvent(e) {
  return {
    id:          e.id,
    title:       e.summary ?? 'Untitled',
    start:       e.start?.dateTime ?? e.start?.date,
    end:         e.end?.dateTime   ?? e.end?.date,
    attendees:   (e.attendees ?? []).map(a => a.email),
    description: e.description ?? '',
    location:    e.location ?? '',
    htmlLink:    e.htmlLink,
  };
}

// ─── Create event ─────────────────────────────────────────────────────────────

export async function createEvent(title, startISO, durationMinutes = 60, description = '') {
  try {
    const start = new Date(startISO);
    const end   = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const tz    = process.env.USER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    const res = await cal().events.insert({
      calendarId: 'primary',
      requestBody: {
        summary:     title,
        description,
        start: { dateTime: start.toISOString(), timeZone: tz },
        end:   { dateTime: end.toISOString(),   timeZone: tz },
      },
    });
    return formatEvent(res.data);
  } catch (err) {
    console.error('[calendar] createEvent:', err.message);
    throw err;
  }
}

// ─── Create recurring event ───────────────────────────────────────────────────
// days: array of ISO weekday numbers 1=Mon … 7=Sun
// time: "HH:MM" (24-hour, local time)

const RRULE_DAY = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };
const ISO_TO_JS  = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 }; // JS getDay() uses 0=Sun

export async function createRecurringEvent(title, days, time, durationMinutes = 60, description = '') {
  if (!days?.length) throw new Error('At least one day is required');
  if (!/^\d{1,2}:\d{2}$/.test(time)) throw new Error('time must be HH:MM');

  const [hh, mm]  = time.split(':').map(Number);
  const tz        = process.env.USER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const byDay     = days.map(d => RRULE_DAY[d]).join(',');
  const jsDays    = days.map(d => ISO_TO_JS[d]);

  // Find the next calendar day that matches one of the selected weekdays
  const start = new Date();
  start.setHours(hh, mm, 0, 0);
  if (start <= new Date()) start.setDate(start.getDate() + 1); // already passed today → tomorrow

  let tries = 0;
  while (!jsDays.includes(start.getDay()) && tries++ < 7) {
    start.setDate(start.getDate() + 1);
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  try {
    const res = await cal().events.insert({
      calendarId: 'primary',
      requestBody: {
        summary:    title,
        description,
        start:      { dateTime: start.toISOString(), timeZone: tz },
        end:        { dateTime: end.toISOString(),   timeZone: tz },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
      },
    });
    return formatEvent(res.data);
  } catch (err) {
    console.error('[calendar] createRecurringEvent:', err.message);
    throw err;
  }
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export async function scanConflicts() {
  const events    = await getWeekEvents();
  const conflicts = [];

  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (!a.start || !a.end || !b.start) continue;

    const aEnd   = new Date(a.end).getTime();
    const bStart = new Date(b.start).getTime();
    const gapMin = (bStart - aEnd) / 60000;

    if (gapMin < 0) {
      conflicts.push({ type: 'overlap',      eventA: a, eventB: b, overlapMin: Math.abs(gapMin) });
    } else if (gapMin < 10) {
      conflicts.push({ type: 'back_to_back', eventA: a, eventB: b, gapMin });
    }
  }

  return conflicts;
}

// ─── Focus block protection ───────────────────────────────────────────────────

export async function blockFocusTime(projectName = 'Deep work', minBlockMinutes = 90) {
  const events   = await getWeekEvents();
  const blocks   = [];
  const timezone = process.env.USER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  for (let i = 0; i < events.length - 1; i++) {
    const gapStart = new Date(events[i].end);
    const gapEnd   = new Date(events[i + 1].start);
    const gapMin   = (gapEnd - gapStart) / 60000;
    const hour     = parseInt(gapStart.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }), 10);

    // Only block during working hours (9-18) and gaps big enough
    if (gapMin >= minBlockMinutes && hour >= 9 && hour <= 16) {
      const created = await createEvent(
        `Focus — ${projectName}`,
        gapStart.toISOString(),
        Math.min(gapMin, 120),
        'Auto-blocked by DevOS Agent. Marked busy.'
      );
      blocks.push(created);
      break; // one focus block per run
    }
  }

  return blocks;
}

// ─── Meeting brief ─────────────────────────────────────────────────────────────

export async function generateMeetingBrief(event) {
  try {
    const prompt = `Generate a concise pre-meeting brief for this calendar event.
Event: ${event.title}
Attendees: ${event.attendees.join(', ')}
Description/Agenda: ${event.description || 'None provided'}
Time: ${event.start}

Return a JSON object:
{
  "keyPoints": ["list of 3 agenda items or goals"],
  "suggestedTalkingPoints": ["2 suggested points to raise"],
  "prepAction": "one sentence on what to review beforehand"
}`;

    const brief = await llm.call(
      [{ role: 'user', content: prompt }],
      { taskType: 'brief', json: true }
    );

    return { event, brief };
  } catch (err) {
    console.error('[calendar] generateMeetingBrief:', err.message);
    return { event, brief: null };
  }
}

// ─── Find event by title (for chat commands that don't know the ID) ───────────

async function findByTitle(title) {
  const events = await getUpcoming(30);
  const q = title.toLowerCase();
  return events.find(e => e.title.toLowerCase().includes(q)) ?? null;
}

// ─── Delete event ─────────────────────────────────────────────────────────────

export async function deleteEvent(idOrTitle) {
  try {
    let eventId = idOrTitle;
    let title   = idOrTitle;
    // Heuristic: Google event IDs are long alphanumeric strings
    if (!/^[a-zA-Z0-9_]{15,}$/.test(idOrTitle)) {
      const ev = await findByTitle(idOrTitle);
      if (!ev) throw new Error(`No upcoming event found matching "${idOrTitle}"`);
      eventId = ev.id;
      title   = ev.title;
    }
    await cal().events.delete({ calendarId: 'primary', eventId });
    return { deleted: true, id: eventId, title };
  } catch (err) {
    console.error('[calendar] deleteEvent:', err.message);
    throw err;
  }
}

// ─── Update event ─────────────────────────────────────────────────────────────
// patches: { title?, date?, duration? }

export async function updateEvent(idOrTitle, patches = {}) {
  try {
    let eventId = idOrTitle;
    let current = null;
    if (!/^[a-zA-Z0-9_]{15,}$/.test(idOrTitle)) {
      current = await findByTitle(idOrTitle);
      if (!current) throw new Error(`No upcoming event found matching "${idOrTitle}"`);
      eventId = current.id;
    }

    const tz          = process.env.USER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const requestBody = {};
    if (patches.title) requestBody.summary = patches.title;
    if (patches.date) {
      const start  = new Date(patches.date);
      const durMin = patches.duration ?? (current ? Math.round((new Date(current.end) - new Date(current.start)) / 60000) : 60);
      requestBody.start = { dateTime: start.toISOString(), timeZone: tz };
      requestBody.end   = { dateTime: new Date(start.getTime() + durMin * 60000).toISOString(), timeZone: tz };
    }

    const res = await cal().events.patch({ calendarId: 'primary', eventId, requestBody });
    return formatEvent(res.data);
  } catch (err) {
    console.error('[calendar] updateEvent:', err.message);
    throw err;
  }
}

export default { getUpcoming, getWeekEvents, createEvent, createRecurringEvent, deleteEvent, updateEvent, scanConflicts, blockFocusTime, generateMeetingBrief };
