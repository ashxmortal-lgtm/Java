import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { supportConversations, supportMessageLinks } from '../schema.js';
import { api } from './message_api.js';
import { ADMIN_IDS, SUPPORT_GROUP_ID } from './topic_config.js';

const CONFIRMATION = 'Your message has been forwarded to 𝑨𝒘𝒘 𒉭 𝒔𝒉𝒆𝒆𝒔𝒉. Please wait for a reply.';
const isAuthorized = (userId) => ADMIN_IDS.includes(userId);
const nowSec = () => Math.floor(Date.now() / 1000);

function supportReady() {
  return Number.isSafeInteger(SUPPORT_GROUP_ID) && SUPPORT_GROUP_ID < 0;
}

function menuMarkup(userId) {
  return {
    inline_keyboard: [
      [{ text: '🟢 Start convo', callback_data: `si:start:${userId}`, style: 'success' }],
      [{ text: '🔴 Stop convo', callback_data: `si:stop:${userId}`, style: 'danger' }],
    ],
  };
}

async function getConversation(userId) {
  return db.select().from(supportConversations)
    .where(eq(supportConversations.userId, userId)).get();
}

async function createOrGetTopic(user) {
  if (!supportReady()) throw new Error('Support group is not configured.');
  let existing = await getConversation(user.id);
  if (existing?.threadId) return existing;

  const now = nowSec();
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'User';
  const username = user.username ? `@${user.username}` : '';
  if (existing?.status === 'creating' && now - existing.updatedAt < 300) {
    throw new Error('Your support topic is still being created. Please press Start convo again shortly.');
  }
  if (existing) {
    await db.update(supportConversations).set({ status: 'creating', updatedAt: now })
      .where(eq(supportConversations.userId, user.id)).run();
  } else {
    const reservation = await db.insert(supportConversations).values({
      userId: user.id,
      threadId: null,
      status: 'creating',
      displayName,
      username: user.username || null,
      lastConfirmationMessageId: null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing({ target: supportConversations.userId }).run();
    if (!reservation.rowsAffected) {
      existing = await getConversation(user.id);
      if (existing?.threadId) return existing;
      throw new Error('Your support topic is already being created. Please try again shortly.');
    }
  }

  try {
    const chat = await api.getChat({ chat_id: SUPPORT_GROUP_ID });
    if (chat.type !== 'supergroup' || chat.is_forum !== true) {
      throw new Error('The configured support chat must be a supergroup with Topics enabled.');
    }
    const topic = await api.createForumTopic({
      chat_id: SUPPORT_GROUP_ID,
      name: `${displayName}${username ? ` ${username}` : ''}`.slice(0, 128),
    });
    await db.update(supportConversations).set({
      threadId: topic.message_thread_id,
      status: 'active',
      displayName,
      username: user.username || null,
      updatedAt: nowSec(),
    }).where(eq(supportConversations.userId, user.id)).run();
    return getConversation(user.id);
  } catch (error) {
    try {
      await db.update(supportConversations).set({ threadId: null, status: 'stopped', updatedAt: nowSec() })
        .where(eq(supportConversations.userId, user.id)).run();
    } catch (_) {}
    throw error;
  }
}

async function ensureConversation(user) {
  const existing = await getConversation(user.id);
  if (existing?.threadId) {
    await db.update(supportConversations).set({
      status: 'active',
      displayName: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || existing.displayName,
      username: user.username || existing.username || null,
      updatedAt: nowSec(),
    }).where(eq(supportConversations.userId, user.id)).run();
    return getConversation(user.id);
  }
  return createOrGetTopic(user);
}

export async function handleSupportCommand(message) {
  const text = String(message.text || '').trim();
  const command = text.split(/[\s@]/)[0].toLowerCase();
  if (command !== '/awwsheesh' || message.chat?.type !== 'private' || !message.from || message.from.is_bot) return false;
  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'Choose how you want to contact support.',
    reply_markup: menuMarkup(message.from.id),
  });
  return true;
}

export async function handleSupportCallback(cq) {
  const data = String(cq.data || '');
  if (!data.startsWith('si:')) return false;

  const parts = data.split(':');
  const action = parts[1];
  const userId = Number(parts[2]);
  const privateMessage = cq.message?.chat?.type === 'private';
  if (!Number.isSafeInteger(userId) || userId <= 0 || userId !== cq.from?.id || !privateMessage || cq.message.chat.id !== userId) {
    await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'This control is not yours.', show_alert: true });
    return true;
  }

  try {
    if (action === 'start' && parts.length === 3) {
      const convo = await ensureConversation(cq.from);
      if (!convo?.threadId) throw new Error('Support topic is not available.');
      await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Conversation started.' });
      await api.sendMessage({ chat_id: userId, text: 'Your support conversation is active. Send a message here whenever you need help.' });
      return true;
    }

    if (action === 'stop' && parts.length === 3) {
      await db.update(supportConversations).set({ status: 'stopped', updatedAt: nowSec() })
        .where(eq(supportConversations.userId, userId)).run();
      await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Conversation stopped.' });
      await api.sendMessage({ chat_id: userId, text: 'Your support conversation is stopped. You can start again with /awwsheesh.' });
      return true;
    }

    if (action === 'pause' && parts.length === 3) {
      await db.update(supportConversations).set({ status: 'paused', updatedAt: nowSec() })
        .where(eq(supportConversations.userId, userId)).run();
      await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Conversation paused.' });
      await api.sendMessage({ chat_id: userId, text: 'Your support conversation is paused. Resume with /awwsheesh → Start convo.' });
      return true;
    }

    await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Invalid support control.', show_alert: true });
    return true;
  } catch (error) {
    console.error('Support callback failed:', error?.description || error?.message || 'unknown error');
    try {
      await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Support is temporarily unavailable. Please try again.', show_alert: true });
    } catch (_) {}
    return true;
  }
}

export async function handleSupportMessage(message) {
  if (message.chat?.type !== 'private' || !message.from || message.from.is_bot) return false;
  // Keep existing bot commands available; /awwsheesh is handled above.
  if (String(message.text || '').startsWith('/')) return false;

  let convo;
  try {
    convo = await getConversation(message.from.id);
  } catch (error) {
    console.error('Support conversation lookup failed:', error?.description || error?.message || 'unknown error');
    return false;
  }
  if (!convo || convo.status !== 'active' || !convo.threadId) return false;

  let copied;
  try {
    copied = await api.copyMessage({
      chat_id: SUPPORT_GROUP_ID,
      message_thread_id: convo.threadId,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
    });
  } catch (error) {
    console.error('Support message forwarding failed:', error?.description || error?.message || 'unknown error');
    try {
      await api.sendMessage({ chat_id: message.chat.id, text: 'I could not send that message to support. Please try again later.' });
    } catch (_) {}
    return true;
  }

  try {
    const newConfirmation = await api.sendMessage({
      chat_id: message.chat.id,
      text: CONFIRMATION,
      reply_markup: {
        inline_keyboard: [[{
          text: '🔴 Pause convo',
          callback_data: `si:pause:${message.from.id}`,
          style: 'danger',
        }]],
      },
    });
    const previousId = convo.lastConfirmationMessageId;
    await db.update(supportConversations).set({
      lastConfirmationMessageId: newConfirmation.message_id,
      updatedAt: nowSec(),
    }).where(eq(supportConversations.userId, message.from.id)).run();
    if (previousId) {
      try { await api.deleteMessage({ chat_id: message.chat.id, message_id: previousId }); } catch (_) {}
    }
  } catch (error) {
    console.error('Support delivery receipt update failed:', error?.description || error?.message || 'unknown error');
  }

  try {
    await db.run(
      'INSERT OR IGNORE INTO support_message_links (user_id, thread_id, support_message_id, user_message_id, created_at) VALUES (:user, :thread, :support, :original, :created)',
      {
        ':user': message.from.id,
        ':thread': convo.threadId,
        ':support': copied.message_id,
        ':original': message.message_id,
        ':created': nowSec(),
      },
    );
  } catch (error) {
    console.error('Support reply mapping save failed:', error?.description || error?.message || 'unknown error');
  }
  return true;
}

export async function handleSupportAdminReply(message) {
  if (!supportReady() || message.chat?.id !== SUPPORT_GROUP_ID || message.chat?.type !== 'supergroup') return false;
  if (!message.message_thread_id) return false;

  try {
    const convo = await db.select().from(supportConversations)
      .where(eq(supportConversations.threadId, message.message_thread_id)).get();
    if (!convo) return false;
    if (!message.from || message.from.is_bot || !isAuthorized(message.from.id)) return true;

    const adminCommand = String(message.text || '').trim().split(/[\s@]/)[0].toLowerCase();
    if (adminCommand === '/support_pause' || adminCommand === '/support_stop') {
      const status = adminCommand === '/support_pause' ? 'paused' : 'stopped';
      await db.update(supportConversations).set({ status, updatedAt: nowSec() })
        .where(eq(supportConversations.userId, convo.userId)).run();
      await api.sendMessage({
        chat_id: SUPPORT_GROUP_ID,
        message_thread_id: convo.threadId,
        text: `Support conversation ${status}. The user can reopen it with /awwsheesh → Start convo.`,
      });
      return true;
    }

    let replyToMessageId;
    const repliedToId = message.reply_to_message?.message_id;
    if (repliedToId) {
      const link = await db.select().from(supportMessageLinks)
        .where(and(
          eq(supportMessageLinks.threadId, message.message_thread_id),
          eq(supportMessageLinks.supportMessageId, repliedToId),
        )).get();
      if (link) replyToMessageId = link.userMessageId;
    }

    const result = await api.copyMessage({
      chat_id: convo.userId,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    });
    if (result?.message_id) {
      await db.run(
        'INSERT OR IGNORE INTO support_message_links (user_id, thread_id, support_message_id, user_message_id, created_at) VALUES (:user, :thread, :support, :original, :created)',
        {
          ':user': convo.userId,
          ':thread': convo.threadId,
          ':support': message.message_id,
          ':original': result.message_id,
          ':created': nowSec(),
        },
      );
    }
  } catch (error) {
    console.error('Support admin reply failed:', error?.description || error?.message || 'unknown error');
    if (message.from && isAuthorized(message.from.id)) {
      try { await api.sendMessage({ chat_id: SUPPORT_GROUP_ID, message_thread_id: message.message_thread_id, text: 'Could not deliver that reply. The user may have blocked the bot or the message type may not be copyable.' }); } catch (_) {}
    }
  }
  return true;
}
