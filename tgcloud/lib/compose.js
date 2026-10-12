import { api, db, BotApiError } from 'sdk';
import { eq, asc } from 'sdk/db';
import { quizDestinations as D, quizComposeTopics as CT, quizComposeSessions as CS, groupAdmins as GA } from '../schema.js';
import { ADMIN_IDS, DEFAULT_QUIZ_TIME, EDIT_SESSION_TTL } from './topic_config.js';
import { OWNER_ID } from './config.js';
import { canManageGroup, commandIsForMe } from './groupadmin.js';

// ---------- rich helpers ----------
const bold = (text) => ({ type: 'bold', text });
const code = (text) => ({ type: 'code', text });
const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const divider = { type: 'divider' };
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const rich = (blocks) => ({ blocks, skip_entity_detection: true });

// ---------- misc helpers ----------
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const istNow = () => new Date(Date.now() + 19800000);
const pad = (n) => String(n).padStart(2, '0');
const dateLine = (d) => `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${DAYS[d.getUTCDay()]}`;
const nowSec = () => Math.floor(Date.now() / 1000);
async function isAdmin(id) {
  if (id === OWNER_ID || ADMIN_IDS.includes(id)) return true;
  const reg = await db.select().from(GA).where(eq(GA.userId, id)).get();
  return !!reg;
}
const errText = (e) => (e && (e.description || e.message)) || 'unknown error';
const SES = 'quiz_compose_sessions';
const MAX_TOPICS = 10;
const MAX_LEN = 200;

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
function parseLine(line) {
  const i = line.indexOf('|');
  const topic = (i === -1 ? line : line.slice(0, i)).trim();
  const rawTime = i === -1 ? '' : line.slice(i + 1).trim();
  if (!topic) return { error: 'empty topic' };
  if (topic.length > MAX_LEN) return { error: `topic too long (max ${MAX_LEN})` };
  const time = rawTime ? parseTime(rawTime) : DEFAULT_QUIZ_TIME;
  if (!time) return { error: `invalid time "${rawTime}"` };
  return { topic, time };
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

// ---------- session helpers ----------
async function clearSession(uid) {
  await db.delete(CT).where(eq(CT.userId, uid)).run();
  await db.delete(CS).where(eq(CS.userId, uid)).run();
}
async function startSession(uid) {
  await db.delete(CT).where(eq(CT.userId, uid)).run();
  await db.insert(CS).values({ userId: uid, state: 'topics', createdAt: nowSec() })
    .onConflictDoUpdate({ target: CS.userId, set: { state: 'topics', createdAt: nowSec() } }).run();
}
async function setState(uid, state) {
  await db.run(`UPDATE ${SES} SET state=:s, created_at=:t WHERE user_id=:u`,
    { ':s': state, ':t': nowSec(), ':u': uid });
}
async function getSession(uid) {
  const s = await db.select().from(CS).where(eq(CS.userId, uid)).get();
  if (!s) return null;
  if (nowSec() - s.createdAt > EDIT_SESSION_TTL) { await clearSession(uid); return null; }
  return s;
}
const loadTopics = (uid) => db.select().from(CT).where(eq(CT.userId, uid)).orderBy(asc(CT.id)).all();

// ---------- renderers ----------
const backRow = row(cb('⬅️ Back', 'topic_admin:home'));

const promptBlocks = (count, notice) => {
  const b = [head('📢 QUIZ UPDATE')];
  if (notice) b.push(para(notice));
  b.push(
    para('Send topic(s), one per line:'),
    para(code('Topic name | 9:00 PM')),
    para('Time is optional (default ' + DEFAULT_QUIZ_TIME + ').'),
  );
  if (count) b.push(para(`Topics added so far: ${count}`));
  b.push(row(cb('✖️ Cancel', 'quiz_cancel', 'danger')));
  return b;
};

const expiredBlocks = () => [head('📢 QUIZ UPDATE'), para('⚠️ Session expired. Start again from /topic.'), backRow];

function previewBlocks(topics, notice) {
  const b = [head('📢 QUIZ UPDATE · PREVIEW')];
  if (notice) b.push(para(notice));
  b.push(divider);
  topics.forEach((t, i) => {
    b.push(para(bold(`${i + 1}. `), `${emojiFor(t.topic)} ${t.topic}`));
    b.push(para(`🕘 ${t.scheduledTime}`));
  });
  b.push(divider);
  b.push(row(cb('➕ Add topic', 'quiz_add'), cb('📤 Send', 'quiz_send', 'success')));
  b.push(row(cb('✖️ Cancel', 'quiz_cancel', 'danger')));
  return b;
}

async function destinationBlocks(notice) {
  const dests = await db.select().from(D).orderBy(asc(D.title)).all();
  const b = [head('📍 CHOOSE DESTINATION')];
  if (notice) b.push(para(notice));
  if (!dests.length) {
    b.push(
      para('No destinations registered yet.'),
      para('Group: send ', code('/qu@YOUR_BOT'), ' there as a registered admin.'),
      para('Channel: send ', code('/qu -100xxxxxxxxxx'), ' here in DM.'),
    );
  } else {
    dests.forEach((d) => {
      const icon = d.kind === 'channel' ? '📢' : '👥';
      b.push(row(cb(`${icon} ${d.title || d.chatId}`, `quiz_dest:${d.kind}:${d.chatId}`)));
    });
  }
  b.push(row(cb('⬅️ Back', 'quiz_back')));
  return b;
}

function announcement(topics) {
  const b = [
    { type: 'blockquote', blocks: [para('📢 ', bold('QUIZ UPDATE'))] },
    para('📅 ', bold('DATE:'), ' ' + dateLine(istNow())),
  ];
  topics.forEach((t) => {
    b.push(para('⚡ ', bold('TOPIC:'), ` ${emojiFor(t.topic)} ${t.topic}`));
    b.push(para('🕘 ', bold('TIME:'), ' ' + t.scheduledTime));
  });
  b.push(divider);
  b.push(row(cb('💡 Suggest Quiz Topic', 'topic_suggest_open', 'primary')));
  return b;
}

// ---------- /qu (was /adddest) ----------
export async function handleAdddest(message) {
  const chat = message.chat;
  const from = message.from;
  // DM: bot owner only (as before). Group: bot owner or a registered admin of THIS group.
  if (chat.type !== 'private' && !(await commandIsForMe(message))) return;
  const allowed = !!from && !from.is_bot && !message.sender_chat
    && (chat.type === 'private' ? (await isAdmin(from.id)) : await canManageGroup(chat.id, from.id));
  if (!allowed) {
    await sendRich(chat.id, [para(chat.type === 'private'
      ? '⛔ You are not authorized to use this command.'
      : '⛔ Only registered admins of this group can use /qu. Admins: send /imfrozen first.')]);
    return;
  }

  if (chat.type !== 'private') {
    const title = chat.title || String(chat.id);
    await db.insert(D).values({ chatId: chat.id, title, kind: 'group' })
      .onConflictDoUpdate({ target: D.chatId, set: { title, kind: 'group' } }).run();
    await sendRich(chat.id, [head('✅ DESTINATION ADDED'), para(bold(title))]);
    return;
  }

  const args = (message.text || '').trim().split(/\s+/).slice(1);

  if (args[0] === 'remove' && /^-?\d+$/.test(args[1] || '')) {
    await db.delete(D).where(eq(D.chatId, Number(args[1]))).run();
    await sendRich(chat.id, [para('🗑 Destination removed (if it existed).')]);
    return;
  }

  if (!/^-?\d+$/.test(args[0] || '')) {
    const dests = await db.select().from(D).orderBy(asc(D.title)).all();
    const b = [
      head('📍 DESTINATIONS'),
      para('Add a channel: ', code('/qu -100xxxxxxxxxx')),
      para('Add a group: send ', code('/qu@YOUR_BOT'), ' inside it.'),
      para('Remove: ', code('/qu remove <chat_id>')),
      divider,
    ];
    if (!dests.length) b.push(para('None registered yet.'));
    dests.forEach((d) => b.push(para(`${d.kind === 'channel' ? '📢' : '👥'} ${d.title || ''} `, code(String(d.chatId)))));
    await sendRich(chat.id, b);
    return;
  }

  const chatId = Number(args[0]);
  let info;
  try {
    info = await api.getChat({ chat_id: chatId });
  } catch (e) {
    await sendRich(chat.id, [para('❌ Could not access that chat: ' + errText(e)), para('Make sure the bot is added there.')]);
    return;
  }
  const kind = info.type === 'channel' ? 'channel' : 'group';
  const title = info.title || args.slice(1).join(' ') || String(chatId);
  await db.insert(D).values({ chatId, title, kind })
    .onConflictDoUpdate({ target: D.chatId, set: { title, kind } }).run();
  await sendRich(chat.id, [head('✅ DESTINATION ADDED'), para(bold(title), ` (${kind})`)]);
}

// ---------- callbacks ----------
const PREFIX = ['quiz_add', 'quiz_send', 'quiz_back', 'quiz_cancel', 'quiz_dest'];

export async function handleComposeCallback(cq) {
  const [action, a, b] = (cq.data || '').split(':');
  const isCompose = action === 'topic_admin' && a === 'compose';
  const isHome = action === 'topic_admin' && a === 'home';

  if (isHome) {
    if (await isAdmin(cq.from.id)) await clearSession(cq.from.id);
    return false; // topic.js shows the main menu
  }
  if (!isCompose && !PREFIX.includes(action)) return false;

  if (!(await isAdmin(cq.from.id))) {
    await api.answerCallbackQuery({ callback_query_id: cq.id, text: '⛔ Not authorized.', show_alert: true });
    return true;
  }
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  const msg = cq.message;
  if (!msg || msg.chat.type !== 'private') return true;
  const uid = cq.from.id;

  if (isCompose) {
    await startSession(uid);
    await show(cq, promptBlocks(0));
    return true;
  }

  if (action === 'quiz_cancel') {
    await clearSession(uid);
    await show(cq, [head('📢 QUIZ UPDATE'), para('✖️ Cancelled.'), backRow]);
    return true;
  }

  const s = await getSession(uid);
  if (!s) { await show(cq, expiredBlocks()); return true; }

  if (action === 'quiz_add') {
    const topics = await loadTopics(uid);
    if (topics.length >= MAX_TOPICS) {
      await show(cq, previewBlocks(topics, `⚠️ Max ${MAX_TOPICS} topics per update.`));
      return true;
    }
    await setState(uid, 'topics');
    await show(cq, promptBlocks(topics.length));
    return true;
  }

  if (action === 'quiz_back') {
    const topics = await loadTopics(uid);
    await setState(uid, 'preview');
    await show(cq, topics.length ? previewBlocks(topics) : promptBlocks(0));
    return true;
  }

  if (action === 'quiz_send') {
    const topics = await loadTopics(uid);
    if (!topics.length) { await setState(uid, 'topics'); await show(cq, promptBlocks(0)); return true; }
    await setState(uid, 'preview');
    await show(cq, await destinationBlocks());
    return true;
  }

  if (action === 'quiz_dest') {
    const chatId = Number.parseInt(b, 10);
    const dest = Number.isInteger(chatId)
      ? await db.select().from(D).where(eq(D.chatId, chatId)).get() : null;
    if (!dest) { await show(cq, await destinationBlocks('⚠️ Destination not found.')); return true; }

    // atomic claim: only one invocation can move preview -> sending
    const claim = await db.run(`UPDATE ${SES} SET state='sending' WHERE user_id=:u AND state='preview'`, { ':u': uid });
    if (!claim.rowsAffected) {
      await show(cq, [head('📢 QUIZ UPDATE'), para('⚠️ Already sent or session changed.'), backRow]);
      return true;
    }
    const topics = await loadTopics(uid);
    if (!topics.length) { await setState(uid, 'topics'); await show(cq, promptBlocks(0)); return true; }

    let sent;
    try {
      sent = await sendRich(dest.chatId, announcement(topics));
    } catch (e) {
      await setState(uid, 'preview');
      await show(cq, previewBlocks(topics, `❌ Send failed: ${errText(e)}`));
      return true;
    }
    let pinNote = '📌 Pinned.';
    try {
      await api.pinChatMessage({ chat_id: dest.chatId, message_id: sent.message_id });
    } catch (e) {
      pinNote = `⚠️ Sent, but could not pin: ${errText(e)}`;
    }
    await clearSession(uid);
    await show(cq, [
      head('📢 QUIZ UPDATE'),
      para('✅ Sent to ', bold(dest.title || String(dest.chatId))),
      para(pinNote),
      backRow,
    ]);
    return true;
  }
  return true;
}

// ---------- topic text input ----------
export async function handleComposeText(message) {
  if (message.chat.type !== 'private' || !message.from || !message.text) return false;
  if (message.text.startsWith('/')) return false;
  const uid = message.from.id;
  const s = await getSession(uid);
  if (!s || s.state !== 'topics') return false;
  if (!(await isAdmin(uid))) { await clearSession(uid); return false; }

  const lines = message.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const existing = await loadTopics(uid);
  if (existing.length + lines.length > MAX_TOPICS) {
    await sendRich(message.chat.id, promptBlocks(existing.length, `❌ Max ${MAX_TOPICS} topics per update.`));
    return true;
  }
  const parsed = [];
  for (const line of lines) {
    const r = parseLine(line);
    if (r.error) {
      await sendRich(message.chat.id, promptBlocks(existing.length, `❌ "${line.slice(0, 40)}": ${r.error}`));
      return true;
    }
    parsed.push(r);
  }
  for (const r of parsed) {
    await db.insert(CT).values({ userId: uid, topic: r.topic, scheduledTime: r.time }).run();
  }
  await setState(uid, 'preview');
  await sendRich(message.chat.id, previewBlocks(await loadTopics(uid)));
  return true;
}


