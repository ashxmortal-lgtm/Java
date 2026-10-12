import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { quizTopicSuggestions as Q, quizSuggestionSessions as SS, topicSettings as ST } from '../schema.js';
import { ADMIN_IDS, STORAGE_CHAT_ID, SUGGEST_TTL } from './topic_config.js';

// ---------- rich helpers ----------
const bold = (text) => ({ type: 'bold', text });
const code = (text) => ({ type: 'code', text });
const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const divider = { type: 'divider' };
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const rich = (blocks) => ({ blocks, skip_entity_detection: true });
const sendRich = (chat_id, blocks, extra = {}) =>
  api.sendRichMessage({ chat_id, rich_message: rich(blocks), ...extra });

const isAdmin = (id) => ADMIN_IDS.includes(id);
const nowSec = () => Math.floor(Date.now() / 1000);
const errText = (e) => (e && (e.description || e.message)) || 'unknown error';
const GROUP_KEY = 'admin_group';

const userLink = (u) => {
  const name = u.first_name || 'User';
  return u.username
    ? { type: 'url', text: '@' + u.username, url: 'https://t.me/' + u.username }
    : { type: 'url', text: name, url: 'tg://user?id=' + u.id };
};

// ---------- admin group registration ----------
async function getAdminGroup() {
  const r = await db.select().from(ST).where(eq(ST.settingKey, GROUP_KEY)).get();
  if (!r) return null;
  try { return JSON.parse(r.settingValue); } catch { return null; }
}
async function saveAdminGroup(id, title) {
  const v = JSON.stringify({ id, title });
  await db.insert(ST).values({ settingKey: GROUP_KEY, settingValue: v })
    .onConflictDoUpdate({ target: ST.settingKey, set: { settingValue: v } }).run();
}

export async function handleAdmingrpCmd(message) {
  const chat = message.chat;
  const from = message.from;
  if (!from || !isAdmin(from.id)) {
    if (chat.type === 'private') await sendRich(chat.id, [para('⛔ You are not authorized to use this command.')]);
    return;
  }

  if (chat.type !== 'private') {
    const title = chat.title || String(chat.id);
    await saveAdminGroup(chat.id, title);
    await sendRich(chat.id, [
      head('✅ ADMIN GROUP REGISTERED'),
      para(bold(title)),
      para('New topic suggestions will be sent here as well.'),
    ]);
    return;
  }

  const args = (message.text || '').trim().split(/\s+/).slice(1);

  if (args[0] === 'remove') {
    await db.delete(ST).where(eq(ST.settingKey, GROUP_KEY)).run();
    await sendRich(chat.id, [para('🗑 Admin group removed. Suggestions go to the storage channel only.')]);
    return;
  }

  if (!/^-?\d+$/.test(args[0] || '')) {
    const g = await getAdminGroup();
    await sendRich(chat.id, [
      head('🛡 ADMIN GROUP'),
      para('Register: send ', code('/addadmingrp@YOUR_BOT'), ' inside the group.'),
      para('Or here: ', code('/addadmingrp -100xxxxxxxxxx')),
      para('Remove: ', code('/addadmingrp remove')),
      divider,
      g ? para('Current: ', bold(g.title || String(g.id)), ' ', code(String(g.id))) : para('Current: none (storage channel only)'),
    ]);
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
  const title = info.title || String(chatId);
  await saveAdminGroup(chatId, title);
  await sendRich(chat.id, [head('✅ ADMIN GROUP REGISTERED'), para(bold(title))]);
}

// ---------- suggestion button callbacks ----------
export async function handleSuggestCallback(cq) {
  const data = cq.data || '';
  if (data !== 'topic_suggest_open' && data !== 'topic_suggest_cancel') return false;

  const msg = cq.message;
  if (!msg || msg.chat.type === 'private' || msg.chat.type === 'channel') {
    await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Suggestions work inside groups only.', show_alert: true });
    return true;
  }
  const uid = cq.from.id;

  if (data === 'topic_suggest_cancel') {
    const s = await db.select().from(SS).where(eq(SS.userId, uid)).get();
    if (!s || s.promptMessageId !== msg.message_id) {
      await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Only the person who opened this can cancel it.', show_alert: true });
      return true;
    }
    await db.delete(SS).where(eq(SS.userId, uid)).run();
    await api.answerCallbackQuery({ callback_query_id: cq.id });
    try { await api.deleteMessage({ chat_id: msg.chat.id, message_id: msg.message_id }); } catch (e) { /* ignore */ }
    return true;
  }

  // open
  const old = await db.select().from(SS).where(eq(SS.userId, uid)).get();
  if (old) {
    try { await api.deleteMessage({ chat_id: old.chatId, message_id: old.promptMessageId }); } catch (e) { /* ignore */ }
  }
  let sent;
  try {
    sent = await sendRich(msg.chat.id, [
      para(userLink(cq.from), ' send your quiz topic by ', bold('replying to this message'), '.'),
      para('⏳ Expires in ' + Math.round(SUGGEST_TTL / 60) + ' min.'),
      row(cb('✖️ Cancel', 'topic_suggest_cancel')),
    ], {
      reply_parameters: { message_id: msg.message_id },
      ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
    });
  } catch (e) {
    await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Could not open: ' + errText(e), show_alert: true });
    return true;
  }
  const ts = nowSec();
  await db.insert(SS).values({ userId: uid, chatId: msg.chat.id, promptMessageId: sent.message_id, createdAt: ts })
    .onConflictDoUpdate({ target: SS.userId, set: { chatId: msg.chat.id, promptMessageId: sent.message_id, createdAt: ts } }).run();
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  return true;
}

// ---------- reply capture ----------
const card = (id, topic, from, chatTitle) => [
  head('💡 NEW QUIZ TOPIC'),
  para(bold('Topic: '), topic),
  para(bold('From: '), userLink(from)),
  para(bold('Group: '), chatTitle),
  divider,
  row(
    cb('✅ Approve', `qtopic_approve:${id}`, 'success'),
    cb('📝 Note', `qtopic_note:${id}`),
    cb('❌ Reject', `qtopic_reject:${id}`, 'danger'),
  ),
];

export async function handleSuggestReply(message) {
  if (message.chat.type === 'private' || message.chat.type === 'channel') return false;
  if (!message.reply_to_message || !message.text || !message.from) return false;
  if (message.text.startsWith('/')) return false;

  const uid = message.from.id;
  const s = await db.select().from(SS).where(eq(SS.userId, uid)).get();
  if (!s || s.chatId !== message.chat.id || s.promptMessageId !== message.reply_to_message.message_id) return false;

  const replyTo = { reply_parameters: { message_id: message.message_id } };

  // expired?
  if (nowSec() - s.createdAt > SUGGEST_TTL) {
    await db.delete(SS).where(eq(SS.userId, uid)).run();
    try { await api.deleteMessage({ chat_id: s.chatId, message_id: s.promptMessageId }); } catch (e) { /* ignore */ }
    await sendRich(message.chat.id, [para('⏳ That prompt expired. Tap ', bold('Suggest Quiz Topic'), ' again.')], replyTo);
    return true;
  }

  const topic = message.text.trim();
  if (topic.length < 3 || topic.length > 200) {
    await sendRich(message.chat.id, [para('❌ Topic must be 3 to 200 characters. Reply again.')], replyTo);
    return true;
  }

  // atomic claim: only one invocation proceeds
  const claim = await db.run(
    'DELETE FROM quiz_suggestion_sessions WHERE user_id=:u AND prompt_message_id=:p',
    { ':u': uid, ':p': s.promptMessageId });
  if (!claim.rowsAffected) return true;

  const [rec] = await db.insert(Q).values({
    chatId: message.chat.id,
    userId: uid,
    username: message.from.username || null,
    firstName: message.from.first_name || null,
    suggestionMessageId: message.message_id,
    topicText: topic,
    status: 'pending',
    showTag: 1,
  }).returning().run();
  const id = rec.suggestionId;

  try { await api.deleteMessage({ chat_id: s.chatId, message_id: s.promptMessageId }); } catch (e) { /* ignore */ }

  // admin cards
  const blocks = card(id, topic, message.from, message.chat.title || String(message.chat.id));
  let delivered = 0;

  try {
    const m = await sendRich(STORAGE_CHAT_ID, blocks);
    await db.update(Q).set({ storageMessageId: m.message_id }).where(eq(Q.suggestionId, id)).run();
    delivered++;
  } catch (e) {
    console.error('storage send failed:', errText(e));
  }

  const g = await getAdminGroup();
  if (g && g.id !== STORAGE_CHAT_ID) {
    try {
      const m = await sendRich(g.id, blocks);
      await db.update(Q).set({ awwdminMessageId: m.message_id }).where(eq(Q.suggestionId, id)).run();
      delivered++;
    } catch (e) {
      console.error('admin group send failed:', errText(e));
    }
  }

  await sendRich(message.chat.id, [
    delivered
      ? para('✅ Thanks! Your topic was submitted for review.')
      : para('⚠️ Topic saved, but admins could not be notified right now.'),
  ], replyTo);
  return true;
}
