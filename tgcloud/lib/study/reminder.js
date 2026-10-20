// /reminder — quick timed reminders.
// Flow: /reminder → send reminder text (or image) → pick a time → bot reminds at that time.
// The user's message is copied to the storage channel (same as /todo).
// Times are IST (UTC+5:30), same as the rest of the study module.
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { api } from '../message_api.js';
import {
  mention, userTag, nowIso, istNow, sendBlocks, editBlocks, rp,
  head, para, bold, divider, quoteText, code, row, btn, fmt12, parseTime,
} from './common.js';
import { STORAGE_CHAT_ID } from './todo.js';

const DRAFT_MINUTES = 15;
const MAX_DELAY_SEC = 7 * 24 * 3600;
const nowSec = () => Math.floor(Date.now() / 1000);

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.run(`CREATE TABLE IF NOT EXISTS study_reminders (
    reminder_id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT,
    storage_chat_id INTEGER,
    storage_message_id INTEGER,
    content_type TEXT,
    content_text TEXT,
    due_at INTEGER,
    status TEXT NOT NULL DEFAULT 'collecting',
    created_at TEXT,
    updated_at TEXT
  )`);
  tableReady = true;
}

const DRAFT = "('collecting','choosing','custom')";

async function getDraft(chatId, userId, onlyInput = false) {
  await ensureTable();
  if (onlyInput) {
    return db.get(sql`SELECT * FROM study_reminders WHERE chat_id = ${chatId} AND user_id = ${userId} AND status IN ('collecting','custom') ORDER BY reminder_id DESC LIMIT 1`);
  }
  return db.get(sql`SELECT * FROM study_reminders WHERE chat_id = ${chatId} AND user_id = ${userId} AND status IN ('collecting','choosing','custom') ORDER BY reminder_id DESC LIMIT 1`);
}

async function expireDrafts() {
  await ensureTable();
  const cutoff = new Date(Date.now() - DRAFT_MINUTES * 60000).toISOString();
  await db.run(`DELETE FROM study_reminders WHERE status IN ${DRAFT} AND created_at < :c`, { ':c': cutoff });
}

const cancelRow = row(btn('❌ Cancel', 'rem_cancel', 'danger'));
const timeRows = [
  row(
    btn('⏱ 10 min', 'rem_in:600', 'primary'),
    btn('⏱ 30 min', 'rem_in:1800', 'primary'),
    btn('⏱ 1 hour', 'rem_in:3600', 'primary'),
  ),
  row(
    btn('⏱ 2 hours', 'rem_in:7200', 'primary'),
    btn('⏱ 3 hours', 'rem_in:10800', 'primary'),
  ),
  row(btn('✏️ Custom Time', 'rem_custom')),
  cancelRow,
];

const askBlocks = () => [
  head('⏰ NEW REMINDER'),
  para('📝 What should I remind you about?'),
  para('✍️ Send the reminder as text or image.'),
  cancelRow,
];

const whenLabel = (dueSec) => {
  const t = istNow(new Date(dueSec * 1000));
  return `${fmt12(t.hour, t.minute)} IST (${t.date})`;
};

// "30m", "1h", "1h 30m", "in 45 min" → seconds
export function parseDuration(s) {
  const m = String(s || '').trim().toLowerCase().replace(/^in\s+/, '')
    .match(/^(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? +m[1] * 3600 : 0) + (m[2] ? +m[2] * 60 : 0);
}

// Next occurrence of an IST wall-clock time.
function nextIstOccurrence(hour, minute) {
  const [y, mo, d] = istNow().date.split('-').map(Number);
  let ms = Date.UTC(y, mo - 1, d, hour, minute) - 330 * 60000;
  if (ms <= Date.now() + 5000) ms += 24 * 3600 * 1000;
  return Math.floor(ms / 1000);
}

// ---------- scheduling / delivery ----------
const armed = new Set();

function arm(id, dueSec) {
  const delayMs = (dueSec - nowSec()) * 1000;
  if (armed.has(id) || delayMs > 24 * 3600 * 1000) return;
  armed.add(id);
  setTimeout(() => {
    armed.delete(id);
    processReminders(true).catch((e) => console.error('reminder timer', e && (e.description || e.message)));
  }, Math.max(delayMs, 0) + 250);
}

function reminderBlocks(r) {
  const who = userTag(r.user_id, r.username, r.first_name);
  const blocks = [head('⏰ REMINDER'), para('🥷 ', who), divider];
  if (r.content_text) blocks.push(quoteText(r.content_text));
  else blocks.push(para('🖼️ Image reminder'));
  return blocks;
}

async function deliver(r) {
  if (r.content_type === 'photo' && r.storage_message_id) {
    try { await api.copyMessage({ chat_id: r.chat_id, from_chat_id: r.storage_chat_id, message_id: r.storage_message_id }); }
    catch (e) { console.error('reminder photo copy failed', e && (e.description || e.message)); }
  }
  await sendBlocks(r.chat_id, reminderBlocks(r), { skipEntities: false });
}

let lastSweep = 0;
let sweeping = false;
// Idempotent: each reminder is claimed with a conditional UPDATE, so parallel runs never double-send.
export async function processReminders(force = false) {
  if (sweeping || (!force && Date.now() - lastSweep < 3000)) return;
  sweeping = true;
  lastSweep = Date.now();
  try {
    await ensureTable();
    const now = nowSec();
    const rows = await db.all(sql`SELECT * FROM study_reminders WHERE status = 'scheduled' AND due_at <= ${now} ORDER BY due_at LIMIT 50`);
    for (const r of rows || []) {
      const c = await db.run("UPDATE study_reminders SET status='sent', updated_at=:n WHERE reminder_id=:id AND status='scheduled'", { ':n': nowIso(), ':id': r.reminder_id });
      if (!c.rowsAffected) continue;
      try { await deliver(r); }
      catch (e) {
        console.error('reminder send failed', e && (e.description || e.message));
        await db.run("UPDATE study_reminders SET status='scheduled' WHERE reminder_id=:id AND status='sent'", { ':id': r.reminder_id });
      }
    }
    const horizon = now + 24 * 3600;
    const soon = await db.all(sql`SELECT reminder_id, due_at FROM study_reminders WHERE status = 'scheduled' AND due_at <= ${horizon}`);
    for (const r of soon || []) arm(r.reminder_id, r.due_at);
  } finally {
    sweeping = false;
  }
}

async function schedule(draft, dueSec) {
  const r = await db.run(
    "UPDATE study_reminders SET status='scheduled', due_at=:d, updated_at=:n WHERE reminder_id=:id AND status IN ('choosing','custom')",
    { ':d': dueSec, ':n': nowIso(), ':id': draft.reminder_id },
  );
  if (r.rowsAffected > 0) arm(draft.reminder_id, dueSec);
  return r.rowsAffected > 0;
}

const setBlocks = (dueSec) => [
  head('✅ REMINDER SET'),
  para('⏰ I\'ll remind you at ', bold(whenLabel(dueSec)), '.'),
];

// ---------- handlers ----------
export async function handleReminder(message) {
  await ensureTable();
  await expireDrafts();
  const c = message.chat.id, u = message.from.id;
  // A new /reminder replaces any unfinished draft.
  await db.run(`DELETE FROM study_reminders WHERE chat_id=:c AND user_id=:u AND status IN ${DRAFT}`, { ':c': c, ':u': u });
  const n = nowIso();
  await db.run(
    "INSERT INTO study_reminders (chat_id, user_id, username, first_name, status, created_at, updated_at) VALUES (:c,:u,:un,:fn,'collecting',:n,:n)",
    { ':c': c, ':u': u, ':un': message.from.username || null, ':fn': message.from.first_name || null, ':n': n },
  );
  await sendBlocks(c, askBlocks(), rp(message.message_id));
}

export async function handleReminderInput(message) {
  const raw = message.text || '';
  if (raw.startsWith('/')) return false;
  const photo = message.photo && message.photo.length;
  if (!raw && !photo) return false;
  const c = message.chat.id, u = message.from.id;
  await ensureTable();
  const d = await getDraft(c, u, true);
  if (!d) return false;
  if (d.created_at < new Date(Date.now() - DRAFT_MINUTES * 60000).toISOString()) { await expireDrafts(); return false; }

  if (d.status === 'custom') {
    const dur = parseDuration(raw);
    const clock = dur == null ? parseTime(raw) : null;
    let dueSec = null;
    if (dur != null) { if (dur > 0 && dur <= MAX_DELAY_SEC) dueSec = nowSec() + dur; }
    else if (clock) dueSec = nextIstOccurrence(clock.hour, clock.minute);
    if (!dueSec) {
      await sendBlocks(c, [
        para('⚠️ Time samajh nahi aaya.'),
        para('Examples: ', code('9:45 PM'), ', ', code('21:45'), ', ', code('30m'), ' or ', code('1h 30m'), ' (max 7 days).'),
      ], rp(message.message_id));
      return true;
    }
    if (await schedule(d, dueSec)) await sendBlocks(c, setBlocks(dueSec), rp(message.message_id));
    return true;
  }

  const text = photo ? (message.caption || '') : raw;
  if (text.length > 3500) {
    await sendBlocks(c, [para('⚠️ Reminder bahut lamba hai. Chhota karke bhejo.')], rp(message.message_id));
    return true;
  }
  let sid = null;
  try { const r = await api.copyMessage({ chat_id: STORAGE_CHAT_ID, from_chat_id: c, message_id: message.message_id }); sid = r.message_id; }
  catch (e) { console.error('reminder storage copy failed', e && (e.description || e.message)); }
  if (photo && !sid) {
    await db.run('DELETE FROM study_reminders WHERE reminder_id=:id', { ':id': d.reminder_id });
    await sendBlocks(c, [para('⚠️ Image storage chat mein save nahi hui (bot ko storage chat mein add/admin karo). /reminder dobara try karo.')], rp(message.message_id));
    return true;
  }
  const r = await db.run(
    "UPDATE study_reminders SET status='choosing', content_type=:ct, content_text=:tx, storage_chat_id=:sc, storage_message_id=:sm, updated_at=:n WHERE reminder_id=:id AND status='collecting'",
    { ':ct': photo ? 'photo' : 'text', ':tx': text, ':sc': sid ? STORAGE_CHAT_ID : null, ':sm': sid, ':n': nowIso(), ':id': d.reminder_id },
  );
  if (r.rowsAffected) {
    await sendBlocks(c, [
      head('⏰ NEW REMINDER'),
      para('✅ Reminder received!'),
      divider,
      para(bold('🕐 When should I remind you?')),
      para('Pick a time, or choose Custom (IST).'),
      ...timeRows,
    ], rp(message.message_id));
  }
  return true;
}

export async function handleReminderCb(cq) {
  const data = cq.data || '';
  if (!/^rem_(in:\d+|custom|cancel)$/.test(data)) return false;
  const ans = (text) => api.answerCallbackQuery({ callback_query_id: cq.id, ...(text ? { text } : {}) });
  const msg = cq.message;
  if (!msg) { await ans(); return true; }
  const c = msg.chat.id, u = cq.from.id;
  const d = await getDraft(c, u);
  if (!d) { await ans('Ye reminder setup expire ho gaya ya tumhara nahi hai. /reminder se dobara shuru karo.'); return true; }
  const edit = (blocks) => editBlocks(c, msg.message_id, blocks);

  if (data === 'rem_cancel') {
    await db.run(`DELETE FROM study_reminders WHERE reminder_id=:id AND status IN ${DRAFT}`, { ':id': d.reminder_id });
    await ans(); await edit([head('❌ CANCELLED'), para('Reminder cancelled.')]); return true;
  }
  if (d.status !== 'choosing') { await ans('Pehle reminder content bhejo.'); return true; }
  if (data === 'rem_custom') {
    const r = await db.run("UPDATE study_reminders SET status='custom', updated_at=:n WHERE reminder_id=:id AND status='choosing'", { ':n': nowIso(), ':id': d.reminder_id });
    await ans();
    if (r.rowsAffected) await edit([
      head('✏️ CUSTOM TIME'),
      para('Send the time (IST) or how long from now.'),
      para('Examples: ', code('9:45 PM'), ', ', code('21:45'), ', ', code('45m'), ' or ', code('1h 30m')),
      cancelRow,
    ]);
    return true;
  }
  const secs = +data.split(':')[1];
  if (!(secs > 0 && secs <= MAX_DELAY_SEC)) { await ans('Invalid time.'); return true; }
  const dueSec = nowSec() + secs;
  const ok = await schedule(d, dueSec);
  await ans();
  if (ok) await edit(setBlocks(dueSec));
  return true;
}
