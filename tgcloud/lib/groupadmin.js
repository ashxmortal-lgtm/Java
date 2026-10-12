import { api, db, BotApiError } from 'sdk';
import { eq, and, lt } from 'sdk/db';
import { groupAdmins as GA, adminConfirmations as AC, groupSettings as GS } from '../schema.js';
import { OWNER_ID } from './config.js';
import { sendWelcome } from './welcome_ui.js';

// ---------- constants ----------
export const ECO_LOCKED_TEXT = 'All economy commands are locked for this group.';
const CONFIRM_TTL = 600; // seconds a pending /imfrozen confirmation stays valid
const GROUP_TYPES = ['group', 'supergroup'];

// ---------- rich helpers (same block shapes as topic.js / compose.js) ----------
const bold = (text) => ({ type: 'bold', text });
const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const rich = (blocks) => ({ blocks, skip_entity_detection: true });
const nowSec = () => Math.floor(Date.now() / 1000);

export const isGroupChat = (chat) => !!chat && GROUP_TYPES.includes(chat.type);

// Send rich; if Telegram refuses the blocks, fall back to plain text.
async function say(chatId, blocks, plain, extra = {}) {
  try {
    return await api.sendRichMessage({ chat_id: chatId, rich_message: rich(blocks), ...extra });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    console.error('rich send failed:', e.description);
    return api.sendMessage({ chat_id: chatId, text: plain, ...extra });
  }
}

// Edit the confirmation message in the DM. "Not modified" and similar 400s are ignored.
async function editTo(msg, blocks) {
  if (!msg) return;
  try {
    await api.editMessageText({
      chat_id: msg.chat.id, message_id: msg.message_id, rich_message: rich(blocks),
    });
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
  }
}

let ME = null;
async function me() {
  if (!ME) ME = await api.getMe();
  return ME;
}

// "/cmd@otherbot" is meant for another bot in the group: ignore it.
export async function commandIsForMe(message) {
  const first = String(message.text || '').trim().split(/\s+/)[0];
  const at = first.indexOf('@');
  if (at === -1) return true;
  const target = first.slice(at + 1).toLowerCase();
  return target === String((await me()).username || '').toLowerCase();
}

// ---------- admin checks ----------
// true / false, or null when Telegram could not tell us (bot not in the chat, not admin, ...).
async function liveAdmin(chatId, userId) {
  try {
    const m = await api.getChatMember({ chat_id: chatId, user_id: userId });
    return m.status === 'creator' || m.status === 'administrator';
  } catch (e) {
    if (e instanceof BotApiError) {
      console.error('getChatMember failed:', chatId, e.description);
      return null;
    }
    throw e;
  }
}

// Registered for THIS group AND still a Telegram admin of it right now.
export async function isRegisteredAdmin(chatId, userId) {
  const reg = await db.select().from(GA)
    .where(and(eq(GA.chatId, chatId), eq(GA.userId, userId))).get();
  if (!reg) return false;
  const live = await liveAdmin(chatId, userId);
  if (live === false) {
    // demoted or left: the registration no longer counts
    await db.delete(GA).where(and(eq(GA.chatId, chatId), eq(GA.userId, userId))).run();
    return false;
  }
  return live === true;
}

// Bot owner, or a registered admin of this specific group.
export async function canManageGroup(chatId, userId) {
  if (userId === OWNER_ID) return true;
  return isRegisteredAdmin(chatId, userId);
}

export async function economyLocked(chatId) {
  const s = await db.select().from(GS).where(eq(GS.chatId, chatId)).get();
  return !!s && s.economyEnabled === 0;
}

// Anonymous admins / channel posts have no real user to verify.
const anonymous = (message) => !message.from || message.from.is_bot || !!message.sender_chat;

// ---------- /imfrozen ----------
async function handleImfrozen(message) {
  const chat = message.chat;
  const from = message.from;

  if (!isGroupChat(chat)) {
    await say(chat.id, [para('Send /imfrozen inside the group you administer.')],
      'Send /imfrozen inside the group you administer.');
    return;
  }
  if (anonymous(message)) {
    await say(chat.id, [para('⚠️ I cannot verify anonymous admins. Turn off "Remain anonymous" and send /imfrozen again.')],
      'I cannot verify anonymous admins. Turn off "Remain anonymous" and send /imfrozen again.');
    return;
  }

  const live = await liveAdmin(chat.id, from.id);
  if (live === null) {
    await say(chat.id, [para('⚠️ I could not check admin status. Make sure I am an admin of this group, then try again.')],
      'I could not check admin status. Make sure I am an admin of this group, then try again.');
    return;
  }
  if (!live) {
    await say(chat.id, [para('⛔ Only group admins can use this command.')],
      'Only group admins can use this command.');
    return;
  }

  const already = await db.select().from(GA)
    .where(and(eq(GA.chatId, chat.id), eq(GA.userId, from.id))).get();
  if (already) {
    await say(chat.id, [para('✅ You are already registered as an admin of this group.')],
      'You are already registered as an admin of this group.');
    return;
  }

  // Housekeeping: expired confirmations, and any older pending one for this user+group.
  await db.delete(AC).where(lt(AC.expiresAt, nowSec())).run();
  await db.delete(AC).where(and(eq(AC.userId, from.id), eq(AC.chatId, chat.id))).run();

  const title = chat.title || String(chat.id);
  const [pending] = await db.insert(AC)
    .values({ chatId: chat.id, userId: from.id, chatTitle: title, expiresAt: nowSec() + CONFIRM_TTL, used: 0 })
    .returning().run();

  const button = { text: 'Confirm ✅', callback_data: `imf:ok:${pending.id}`, style: 'success' };
  const blocks = [
    head('🛡 CONFIRM ADMIN'),
    para('Group: ', bold(title)),
    para('Press Confirm to register yourself as a bot admin of this group only.'),
    para('This request expires in 10 minutes.'),
    row(button),
  ];

  let started = true;
  try {
    await api.sendRichMessage({ chat_id: from.id, rich_message: rich(blocks) });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    if (e.code === 403) {
      started = false;
    } else {
      try { // rich refused for another reason: classic message with the same button
        await api.sendMessage({
          chat_id: from.id,
          text: `CONFIRM ADMIN\n\nGroup: ${title}\nPress Confirm to register yourself as a bot admin of this group only.\nThis request expires in 10 minutes.`,
          reply_markup: { inline_keyboard: [[{ text: button.text, callback_data: button.callback_data }]] },
        });
      } catch (e2) {
        if (!(e2 instanceof BotApiError)) throw e2;
        started = false;
        console.error('confirm DM failed:', e2.description);
      }
    }
  }

  if (!started) {
    await db.delete(AC).where(eq(AC.id, pending.id)).run();
    const botName = (await me()).username;
    await say(chat.id, [
      head('⚠️ START THE BOT FIRST'),
      para('I could not message you privately. Open the bot, press Start, then send /imfrozen again.'),
      row({ text: '💬 Open bot', url: 'https://t.me/' + botName, style: 'primary' }),
    ], `I could not message you privately. Open @${botName}, press Start, then send /imfrozen again.`);
    return;
  }

  await say(chat.id, [para('📩 Check your private chat with me and press Confirm to finish.')],
    'Check your private chat with me and press Confirm to finish.');
}

// ---------- /eco on | off ----------
async function handleEco(message) {
  const chat = message.chat;
  const from = message.from;

  if (!isGroupChat(chat)) {
    await say(chat.id, [para('/eco works in groups only.')], '/eco works in groups only.');
    return;
  }

  const arg = (String(message.text || '').trim().split(/\s+/)[1] || '').toLowerCase();
  if (arg !== 'on' && arg !== 'off') {
    const locked = await economyLocked(chat.id);
    await say(chat.id, [
      head('💰 ECONOMY'),
      para('Status: ', bold(locked ? 'OFF 🔒' : 'ON ✅')),
      para('Registered admins: /eco on  ·  /eco off'),
    ], `Economy: ${locked ? 'OFF' : 'ON'}\nRegistered admins: /eco on | /eco off`);
    return;
  }

  if (anonymous(message)) {
    await say(chat.id, [para('⚠️ I cannot verify anonymous admins. Turn off "Remain anonymous" and try again.')],
      'I cannot verify anonymous admins. Turn off "Remain anonymous" and try again.');
    return;
  }
  if (!(await canManageGroup(chat.id, from.id))) {
    await say(chat.id, [para('⛔ Only registered admins of this group can change this. Admins: send /imfrozen first.')],
      'Only registered admins of this group can change this. Admins: send /imfrozen first.');
    return;
  }

  const enabled = arg === 'on' ? 1 : 0;
  await db.insert(GS)
    .values({ chatId: chat.id, economyEnabled: enabled, updatedBy: from.id, updatedAt: nowSec() })
    .onConflictDoUpdate({
      target: GS.chatId,
      set: { economyEnabled: enabled, updatedBy: from.id, updatedAt: nowSec() },
    }).run();

  if (enabled) {
    await say(chat.id, [para('✅ Economy is ON for this group.')], 'Economy is ON for this group.');
  } else {
    await say(chat.id, [
      para('🔒 Economy is OFF for this group.'),
      para('Balances, inventory and rewards are kept. Use /eco on to bring it back.'),
    ], 'Economy is OFF for this group. Balances, inventory and rewards are kept. Use /eco on to bring it back.');
  }
}

// ---------- command router (message.js hook) ----------
// Returns true when the message was one of our commands.
export async function handleGroupAdminCommand(message) {
  const text = message.text || '';
  if (!text.startsWith('/')) return false;
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  if (cmd !== '/imfrozen' && cmd !== '/eco') return false;
  if (!(await commandIsForMe(message))) return true; // addressed to another bot: swallow
  if (cmd === '/imfrozen') await handleImfrozen(message);
  else await handleEco(message);
  return true;
}

// ---------- callback (callback_query.js hook) ----------
export async function handleGroupAdminCallback(cq) {
  const [kind, action, idRaw] = String(cq.data || '').split(':');
  if (kind !== 'imf' || action !== 'ok') return false;

  const alert = (text) => api.answerCallbackQuery({ callback_query_id: cq.id, text, show_alert: true });
  const msg = cq.message;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) { await alert('Invalid request.'); return true; }

  const p = await db.select().from(AC).where(eq(AC.id, id)).get();
  if (!p) {
    await alert('This confirmation is invalid or has expired.');
    return true;
  }
  // The button must be pressed by the user who made the request.
  if (cq.from.id !== p.userId) {
    await alert('This button is not for you.');
    return true;
  }
  if (p.used) {
    await alert('This confirmation was already used.');
    return true;
  }
  if (p.expiresAt < nowSec()) {
    await db.delete(AC).where(eq(AC.id, p.id)).run();
    await alert('This confirmation has expired. Send /imfrozen in the group again.');
    await editTo(msg, [head('⌛ EXPIRED'), para('Send /imfrozen in the group again.')]);
    return true;
  }

  // Re-check admin status in the ORIGINAL group.
  const live = await liveAdmin(p.chatId, p.userId);
  if (live === null) {
    await alert('I could not verify your admin status. Make sure I am an admin of the group and try again.');
    return true;
  }
  if (!live) {
    await db.delete(AC).where(eq(AC.id, p.id)).run();
    await alert('You are no longer an admin of that group.');
    await editTo(msg, [head('⛔ NOT AN ADMIN'), para('You are no longer an admin of ', bold(p.chatTitle || 'that group'), '.')]);
    return true;
  }

  // Claim the confirmation exactly once (safe for duplicate callbacks).
  const claim = await db.update(AC).set({ used: 1 })
    .where(and(eq(AC.id, p.id), eq(AC.used, 0))).run();
  if (!claim.rowsAffected) {
    await alert('This confirmation was already used.');
    return true;
  }

  const exists = await db.select().from(GA)
    .where(and(eq(GA.chatId, p.chatId), eq(GA.userId, p.userId))).get();
  if (!exists) {
    await db.insert(GA).values({ chatId: p.chatId, userId: p.userId, registeredAt: nowSec() }).run();
  }

  await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Registered ✅' });
  await editTo(msg, [
    head('✅ REGISTERED'),
    para('You are now a bot admin of ', bold(p.chatTitle || 'that group'), ' (this group only).'),
    para('Use /eco on or /eco off there.'),
  ]);
  try {
    await sendWelcome(cq.from.id, cq.from);
  } catch (e) { console.error('admin welcome failed', e); }
  return true;
}
