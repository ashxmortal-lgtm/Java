import { handleSuggestCallback, handleSuggestReply, handleAdmingrpCmd } from './suggest.js';
import { handleComposeCallback, handleComposeText, handleAdddest } from './compose.js';
import { db, BotApiError } from 'sdk';
import { api } from './message_api.js';
import { eq, asc } from 'sdk/db';
import { quizTopicSuggestions as T, topicEditSessions as S, groupAdmins as GA } from '../schema.js';
import { ADMIN_IDS, DEFAULT_QUIZ_TIME, USE_STORED_DATE, EDIT_SESSION_TTL } from './topic_config.js';
import { OWNER_ID } from './config.js';

// ---------- rich helpers ----------
const bold = (text) => ({ type: 'bold', text });
const code = (text) => ({ type: 'code', text });
const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const divider = { type: 'divider' };
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const rich = (blocks) => ({ blocks, skip_entity_detection: true });

// ---------- IST helpers ----------
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const istNow = () => new Date(Date.now() + 19800000);
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]}`;
const dateLine = (d) => `${fmtDate(d)} ${d.getUTCFullYear()} · ${DAYS[d.getUTCDay()]}`;

function parseDate(s) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})$/.exec(s.trim());
  if (!m) return null;
  const mi = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mi < 0) return null;
  const day = Number(m[1]);
  const dim = new Date(Date.UTC(istNow().getUTCFullYear(), mi + 1, 0)).getUTCDate();
  if (day < 1 || day > dim) return null;
  return `${pad(day)} ${MON[mi]}`;
}
function parseTime(s) {
  const m = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h < 1 || h > 12) return null;
  return `${h}:${m[2]} ${m[3].toUpperCase()}`;
}
function emojiFor(topic) {
  const t = (topic || '').toLowerCase();
  if (t.includes('bio')) return '🫁';
  if (t.includes('chem')) return '⚗️';
  if (t.includes('phys')) return '⚡';
  return '🧠';
}

async function isAdmin(id) {
  if (id === OWNER_ID || ADMIN_IDS.includes(id)) return true;
  // Any registered group admin (via /imfrozen) may use /topic
  const reg = await db.select().from(GA).where(eq(GA.userId, id)).get();
  return !!reg;
}
const PAGE = 5;
const TBL = 'quiz_topic_suggestions';

// ---------- renderers (return rich blocks) ----------
const mainMenu = () => [
  head('📌 TOPIC ADMIN'),
  para('Choose an option:'),
  divider,
  row(cb('📅 Scheduled Quiz', 'topic_admin:scheduled'), cb('📢 Quiz Update', 'topic_admin:compose')),
];

const composeNotice = () => [
  head('📢 QUIZ UPDATE'),
  para('⚠️ The manual Quiz Update composer is not ported yet.'),
  row(cb('⬅️ Back', 'topic_admin:home')),
];

async function renderScheduled(notice) {
  const d = await db.$count(T, eq(T.status, 'decided'));
  const n = await db.$count(T, eq(T.status, 'noted'));
  const b = [head('📅 SCHEDULED QUIZ')];
  if (notice) b.push(para(notice));
  b.push(divider, para('✅ Decided: ', bold(String(d))), para('📝 Noted: ', bold(String(n))), divider);
  b.push(row(cb(`✅ Decided (${d})`, 'topic_admin:decided:0'), cb(`📝 Noted (${n})`, 'topic_admin:future:0')));
  b.push(row(cb('⬅️ Back', 'topic_admin:home')));
  return b;
}

async function listPage(status, page) {
  const total = await db.$count(T, eq(T.status, status));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(page, 0), pages - 1);
  const rows = await db.select().from(T).where(eq(T.status, status))
    .orderBy(asc(T.suggestionId)).limit(PAGE).offset(p * PAGE).all();
  return { total, pages, p, rows };
}

const detail = (t) => para(`📅 ${t.scheduledDate || 'Not set'}  ·  🕘 ${t.scheduledTime || 'Not set'}`);
const navRow = (kind, p, pages) => {
  const btns = [];
  if (p > 0) btns.push(cb('◀️ Prev', `topic_admin:${kind}:${p - 1}`));
  if (p < pages - 1) btns.push(cb('Next ▶️', `topic_admin:${kind}:${p + 1}`));
  return btns.length ? row(...btns) : null;
};

async function renderDecided(page, notice) {
  const { total, pages, p, rows } = await listPage('decided', page);
  const b = [head('✅ DECIDED TOPICS')];
  if (notice) b.push(para(notice));
  b.push(para(`Total: ${total} · Page ${p + 1}/${pages}`), divider);
  if (!rows.length) b.push(para('No decided topics.'));
  rows.forEach((t, i) => {
    b.push(para(bold(`${p * PAGE + i + 1}. ${emojiFor(t.topicText)} `), t.topicText));
    b.push(detail(t));
    b.push(row(
      cb('📤 Send', `topic_send:${t.suggestionId}`, 'success'),
      cb('🕘 Date/Time', `topic_edit_time:${t.suggestionId}`),
      cb('🗑 Delete', `topic_delete:${t.suggestionId}`, 'danger'),
    ));
  });
  const nav = navRow('decided', p, pages);
  if (nav) b.push(nav);
  b.push(row(cb('⬅️ Back', 'topic_admin:scheduled')));
  return b;
}

async function renderNoted(page, notice) {
  const { total, pages, p, rows } = await listPage('noted', page);
  const b = [head('📝 NOTED TOPICS')];
  if (notice) b.push(para(notice));
  b.push(para(`Total: ${total} · Page ${p + 1}/${pages}`), divider);
  if (!rows.length) b.push(para('No noted topics.'));
  rows.forEach((t, i) => {
    b.push(para(bold(`${p * PAGE + i + 1}. ${emojiFor(t.topicText)} `), t.topicText));
    b.push(row(cb('✅ Use', `topic_use:${t.suggestionId}`, 'success')));
  });
  const nav = navRow('future', p, pages);
  if (nav) b.push(nav);
  b.push(row(cb('⬅️ Back', 'topic_admin:scheduled')));
  return b;
}

function announcement(t) {
  const today = istNow();
  const dateText = USE_STORED_DATE && t.scheduledDate ? t.scheduledDate : dateLine(today);
  const b = [
    { type: 'blockquote', blocks: [para('📢 ', bold('QUIZ UPDATE'))] },
    para('📅 ', bold('DATE:'), ' ' + dateText),
    para('⚡ ', bold('TOPIC:'), ` ${emojiFor(t.topicText)} ${t.topicText}`),
    para('🕘 ', bold('TIME:'), ' ' + (t.scheduledTime || DEFAULT_QUIZ_TIME)),
  ];
  if (t.showTag && (t.username || t.firstName)) {
    const who = t.username
      ? { type: 'url', text: '@' + t.username, url: 'https://t.me/' + t.username }
      : { type: 'url', text: t.firstName, url: 'tg://user?id=' + t.userId };
    b.push(para('Topic suggested by: ', who));
  }
  b.push(divider);
  b.push(row(cb('💡 Suggest Quiz Topic', 'topic_suggest_open', 'primary')));
  return b;
}

// ---------- telegram helpers ----------
async function show(cq, blocks) {
  try {
    await api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      rich_message: rich(blocks),
    });
  } catch (e) {
    if (e instanceof BotApiError && e.code === 400) console.warn('edit skipped:', e.description);
    else throw e;
  }
}
const sendRich = (chat_id, blocks) => api.sendRichMessage({ chat_id, rich_message: rich(blocks) });

// ---------- /topic command ----------
export async function handleTopicCommand(message) {
  if (((message.text || '').split(/[\s@]/)[0]).toLowerCase() === '/addadmingrp') return handleAdmingrpCmd(message);
  if (((message.text || '').split(/[\s@]/)[0]).toLowerCase() === '/qu') return handleAdddest(message);
  const chat = message.chat;
  if (chat.type !== 'private') {
    const me = await api.getMe();
    await sendRich(chat.id, [
      head('📌 TOPIC'),
      para('Admins: open a private chat with the bot and send ', code('/topic'), ' there.'),
      row({ text: '💬 Open private chat', url: 'https://t.me/' + me.username, style: 'primary' }),
    ]);
    return;
  }
  if (!message.from || !(await isAdmin(message.from.id))) {
    await sendRich(chat.id, [para('⛔ You are not authorized to use this command.')]);
    return;
  }
  await db.delete(S).where(eq(S.userId, message.from.id)).run();
  await sendRich(chat.id, mainMenu());
}

// ---------- callbacks ----------
const TOPIC_PREFIXES = ['topic_admin', 'topic_send', 'topic_edit_time', 'topic_delete', 'topic_use'];
const QT = { qtopic_approve: 'decided', qtopic_reject: 'disapproved', qtopic_note: 'noted' };

export async function handleTopicCallback(cq) {
  if (await handleSuggestCallback(cq)) return true;
  if (await handleComposeCallback(cq)) return true;
  const data = cq.data || '';
  const [action, a, b] = data.split(':');
  const isQt = action in QT;
  if (!isQt && !TOPIC_PREFIXES.includes(action)) return false;

  if (!(await isAdmin(cq.from.id))) {
    await api.answerCallbackQuery({ callback_query_id: cq.id, text: '⛔ Not authorized.', show_alert: true });
    return true;
  }
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  const msg = cq.message;
  if (!msg) return true;
  if (!isQt && msg.chat.type !== 'private') return true;

  const id = Number.parseInt(a, 10);

  if (action === 'topic_admin') {
    const page = Number.parseInt(b, 10) || 0;
    if (a === 'scheduled') return (await show(cq, await renderScheduled()), true);
    if (a === 'decided') return (await show(cq, await renderDecided(page)), true);
    if (a === 'future') return (await show(cq, await renderNoted(page)), true);
    if (a === 'compose') return (await show(cq, composeNotice()), true);
    await db.delete(S).where(eq(S.userId, cq.from.id)).run();
    await show(cq, mainMenu());
    return true;
  }

  if (!Number.isInteger(id)) return true;

  if (isQt) {
    const status = QT[action];
    const now = istNow();
    const r = status === 'decided'
      ? await db.run(`UPDATE ${TBL} SET status='decided', scheduled_time=:tm, scheduled_date=:dt WHERE suggestion_id=:id AND status='pending'`,
          { ':tm': DEFAULT_QUIZ_TIME, ':dt': fmtDate(now), ':id': id })
      : await db.run(`UPDATE ${TBL} SET status=:st WHERE suggestion_id=:id AND status='pending'`, { ':st': status, ':id': id });
    await show(cq, [head('📝 TOPIC DECISION'),
      para(r.rowsAffected ? `✅ Marked as ${status}.` : '⚠️ Already decided or unavailable.')]);
    return true;
  }

  if (action === 'topic_use') {
    const r = await db.run(
      `UPDATE ${TBL} SET status='decided', scheduled_time=:tm, scheduled_date=:dt, sent_at=NULL WHERE suggestion_id=:id AND status='noted'`,
      { ':tm': DEFAULT_QUIZ_TIME, ':dt': fmtDate(istNow()), ':id': id });
    await show(cq, await renderNoted(0, r.rowsAffected ? '✅ Moved to decided.' : '⚠️ Topic not available.'));
    return true;
  }

  if (action === 'topic_delete') {
    const t = await db.select().from(T).where(eq(T.suggestionId, id)).get();
    if (t) {
      await db.delete(T).where(eq(T.suggestionId, id)).run();
      await db.delete(S).where(eq(S.suggestionId, id)).run();
    }
    await show(cq, await renderDecided(0, t ? '🗑 Topic deleted.' : '⚠️ Topic already removed.'));
    return true;
  }

  if (action === 'topic_edit_time') {
    const t = await db.select().from(T).where(eq(T.suggestionId, id)).get();
    if (!t || t.status !== 'decided') {
      await show(cq, await renderDecided(0, '⚠️ Topic not available for editing.'));
      return true;
    }
    const ts = Math.floor(Date.now() / 1000);
    await db.insert(S).values({ userId: cq.from.id, suggestionId: id, createdAt: ts })
      .onConflictDoUpdate({ target: S.userId, set: { suggestionId: id, createdAt: ts } }).run();
    await show(cq, [
      head('🕘 EDIT DATE / TIME'),
      para(bold('Topic: '), t.topicText),
      divider,
      para('Send one of these formats:'),
      para(code('10:30 PM')),
      para(code('28 Sep | 8:30 PM')),
      para('Time only uses today\'s date (IST).'),
      row(cb('✖️ Cancel', 'topic_admin:decided:0')),
    ]);
    return true;
  }

  if (action === 'topic_send') {
    await show(cq, await sendTopic(cq, id));
    return true;
  }
  return true;
}

async function sendTopic(cq, id) {
  // atomic claim: only one invocation can move decided -> sending
  const claim = await db.run(`UPDATE ${TBL} SET status='sending' WHERE suggestion_id=:id AND status='decided'`, { ':id': id });
  if (!claim.rowsAffected) return renderDecided(0, '⚠️ Topic not available (already sent or removed).');

  const t = await db.select().from(T).where(eq(T.suggestionId, id)).get();
  const dest = t.chatId ?? cq.message.chat.id;
  let sent;
  try {
    sent = await sendRich(dest, announcement(t));
  } catch (e) {
    await db.run(`UPDATE ${TBL} SET status='decided' WHERE suggestion_id=:id AND status='sending'`, { ':id': id });
    return renderDecided(0, `❌ Send failed: ${e.description || e.message}`);
  }
  let pinNote = '📌 Pinned.';
  try {
    await api.pinChatMessage({ chat_id: dest, message_id: sent.message_id });
  } catch (e) {
    pinNote = `⚠️ Sent, but could not pin: ${e.description || e.message}`;
  }
  await db.run(`UPDATE ${TBL} SET status='sent', sent_at=:ts WHERE suggestion_id=:id`, { ':ts': new Date().toISOString(), ':id': id });
  return renderDecided(0, `✅ Quiz Update sent. ${pinNote}`);
}

// ---------- date/time input (plain text in private chat) ----------
export async function handleTopicText(message) {
  if (await handleSuggestReply(message)) return true;
  if (await handleComposeText(message)) return true;
  if (message.chat.type !== 'private' || !message.from || !message.text) return false;
  if (message.text.startsWith('/')) return false;
  const uid = message.from.id;
  const s = await db.select().from(S).where(eq(S.userId, uid)).get();
  if (!s) return false;
  if (!(await isAdmin(uid)) || Math.floor(Date.now() / 1000) - s.createdAt > EDIT_SESSION_TTL) {
    await db.delete(S).where(eq(S.userId, uid)).run();
    return false;
  }

  const raw = message.text.trim();
  let date, time;
  if (raw.includes('|')) {
    const i = raw.indexOf('|');
    date = parseDate(raw.slice(0, i));
    time = parseTime(raw.slice(i + 1));
  } else {
    date = fmtDate(istNow());
    time = parseTime(raw);
  }
  if (!date || !time) {
    await sendRich(message.chat.id, [
      para('❌ Invalid format. Try ', code('10:30 PM'), ' or ', code('28 Sep | 8:30 PM')),
      row(cb('✖️ Cancel', 'topic_admin:decided:0')),
    ]);
    return true;
  }
  const r = await db.run(
    `UPDATE ${TBL} SET scheduled_date=:dt, scheduled_time=:tm WHERE suggestion_id=:id AND status='decided'`,
    { ':dt': date, ':tm': time, ':id': s.suggestionId });
  await db.delete(S).where(eq(S.userId, uid)).run();
  await sendRich(message.chat.id, await renderDecided(0,
    r.rowsAffected ? `✅ Updated to ${date} · ${time}` : '⚠️ Topic no longer available.'));
  return true;
}



