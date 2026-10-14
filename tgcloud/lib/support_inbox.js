import { db } from 'sdk';
import { eq, and } from 'sdk/db';
import { supportConversations, supportMessageLinks } from '../schema.js';
import { api } from './message_api.js';
import { ADMIN_IDS, SUPPORT_GROUP_ID, SUPPORT_USERS_TOPIC_ID } from './topic_config.js';
import { escapeHtml } from './texts.js';

const CONFIRMATION = 'Your message has been forwarded to 𝑨𝒘𝒘 𒉭 𝒔𝒉𝒆𝒆𝒔𝒉. Please wait for a reply.';
const isAuthorized = (userId) => ADMIN_IDS.includes(Number(userId));
const nowSec = () => Math.floor(Date.now() / 1000);
const UNBAN_COOLDOWN = 24 * 60 * 60;
const UNBAN_PROMPT_TTL = 10 * 60;

function supportReady() {
  return Number.isSafeInteger(SUPPORT_GROUP_ID) && SUPPORT_GROUP_ID < 0;
}

function ownerTopicReady() {
  return supportReady() && Number.isSafeInteger(SUPPORT_USERS_TOPIC_ID) && SUPPORT_USERS_TOPIC_ID > 0;
}

function displayNameOf(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'User';
}

function topicNameOf(displayName, username) {
  return `${displayName}${username ? ` @${username}` : ''}`.slice(0, 128);
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp || nowSec()) * 1000);
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

async function getConversation(userId) {
  return db.select().from(supportConversations)
    .where(eq(supportConversations.userId, userId)).get();
}

function banControlHtml(userId, isBanned) {
  const label = isBanned ? '✅ Unban' : '🚫 Ban';
  const action = isBanned ? 'unban' : 'ban';
  const style = isBanned ? 'success' : 'danger';
  return `<tg-button-row align="center"><tg-button type="callback_data" style="${style}" data="si:${action}:${userId}">${label}</tg-button></tg-button-row>`;
}

function topicIntroHtml(userId, displayName, username, createdAt, isBanned) {
  const name = escapeHtml(displayName || 'User');
  const handle = username ? `@${escapeHtml(username)}` : '';
  const stamp = Number(createdAt || nowSec());
  return `<p><b>#newmsg</b></p><p><b>User:</b> <a href="tg://user?id=${userId}">${name}</a></p><p><b>Username:</b> ${handle}</p><p><b>User ID:</b> <code>${userId}</code></p><p><b>Date:</b> <tg-time unix="${stamp}" format="wDT">${escapeHtml(formatDate(stamp))}</tg-time></p>${banControlHtml(userId, !!isBanned)}`;
}

async function ensureTopicIntro(userId, convo) {
  if (!convo?.threadId || !supportReady() || convo.introMessageId) return convo;

  // -1 is a short-lived reservation: Telegram message IDs are always positive.
  const reserved = await db.run(
    'UPDATE support_conversations SET intro_message_id = -1 WHERE user_id = :user AND thread_id = :thread AND intro_message_id IS NULL',
    { ':user': userId, ':thread': convo.threadId },
  );
  if (!reserved.rowsAffected) return getConversation(userId);

  try {
    const sent = await api.sendRichMessage({
      chat_id: SUPPORT_GROUP_ID,
      message_thread_id: convo.threadId,
      rich_message: {
        html: topicIntroHtml(userId, convo.displayName, convo.username, convo.createdAt, convo.isBanned),
      },
    });
    if (!sent?.message_id) throw new Error('Telegram did not return the new-message control ID.');
    await db.update(supportConversations).set({ introMessageId: sent.message_id, updatedAt: nowSec() })
      .where(eq(supportConversations.userId, userId)).run();
  } catch (error) {
    await db.update(supportConversations).set({ introMessageId: null })
      .where(eq(supportConversations.userId, userId)).run();
    console.error('Support topic introduction failed:', error?.description || error?.message || 'unknown error');
  }
  return getConversation(userId);
}

async function refreshTopicIntro(userId, convo) {
  if (!convo?.introMessageId || convo.introMessageId < 1 || !convo.threadId) return;
  try {
    await api.editMessageText({
      chat_id: SUPPORT_GROUP_ID,
      message_id: convo.introMessageId,
      rich_message: {
        html: topicIntroHtml(userId, convo.displayName, convo.username, convo.createdAt, convo.isBanned),
      },
    });
  } catch (error) {
    console.error('Support topic control refresh failed:', error?.description || error?.message || 'unknown error');
  }
}

function supportMenuHtml(userId, convo) {
  if (convo?.isBanned) {
    return `<p><b>💬 Contact owner</b></p><p>🚫 Your support access is currently blocked.</p><p>You can submit one unban request every 24 hours.</p><tg-button-row align="center"><tg-button type="callback_data" style="primary" data="si:request_unban:${userId}">📝 Request unban</tg-button></tg-button-row>`;
  }
  const status = convo?.status === 'active' ? '🟢 Active' : convo?.status === 'paused' ? '⏸ Paused' : '⚪ Not started';
  const start = `<tg-button type="callback_data" style="success" data="si:start:${userId}">📨 Start / Resume</tg-button>`;
  const pause = `<tg-button type="callback_data" style="danger" data="si:pause:${userId}">⏸ Pause</tg-button>`;
  return `<p><b>💬 Contact owner</b></p><p>Conversation status: ${status}</p><p>Choose an action:</p><tg-button-row align="center">${start}${pause}</tg-button-row>`;
}

async function sendSupportMenu(userId, user) {
  const convo = await getConversation(userId);
  return api.sendRichMessage({
    chat_id: userId,
    rich_message: { html: supportMenuHtml(userId, convo) },
  });
}

async function updateSupportMenuMessage(cq, userId) {
  if (!cq.message?.message_id) return;
  try {
    const convo = await getConversation(userId);
    await api.editMessageText({
      chat_id: userId,
      message_id: cq.message.message_id,
      rich_message: { html: supportMenuHtml(userId, convo) },
    });
  } catch (_) {}
}

async function sendBanNotice(userId) {
  return api.sendRichMessage({
    chat_id: userId,
    rich_message: {
      html: `<p><b>🚫 Your support access has been blocked by the owner.</b></p><p>You cannot send messages to support while this restriction is active. You may request a review once every 24 hours.</p><tg-button-row align="center"><tg-button type="callback_data" style="primary" data="si:request_unban:${userId}">📝 Request unban</tg-button></tg-button-row>`,
    },
  });
}

async function createOrGetTopic(user) {
  if (!supportReady()) throw new Error('Support group is not configured.');
  const userId = user.id;
  let existing = await getConversation(userId);
  if (existing?.threadId) return ensureTopicIntro(userId, existing);

  const now = nowSec();
  const displayName = displayNameOf(user);
  const username = user.username || null;
  if (existing?.status === 'creating' && now - existing.updatedAt < 300) {
    throw new Error('Your support topic is still being created. Please try again shortly.');
  }
  if (existing) {
    await db.update(supportConversations).set({ status: 'creating', updatedAt: now })
      .where(eq(supportConversations.userId, userId)).run();
  } else {
    const reservation = await db.insert(supportConversations).values({
      userId,
      threadId: null,
      status: 'creating',
      displayName,
      username,
      isBanned: 0,
      introMessageId: null,
      unbanPromptAt: 0,
      unbanRequestAt: 0,
      lastConfirmationMessageId: null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing({ target: supportConversations.userId }).run();
    if (!reservation.rowsAffected) {
      existing = await getConversation(userId);
      if (existing?.threadId) return ensureTopicIntro(userId, existing);
      throw new Error('Your support topic is already being created. Please try again shortly.');
    }
  }

  let topic;
  try {
    const chat = await api.getChat({ chat_id: SUPPORT_GROUP_ID });
    if (chat.type !== 'supergroup' || chat.is_forum !== true) {
      throw new Error('The configured support chat must be a supergroup with Topics enabled.');
    }
    topic = await api.createForumTopic({
      chat_id: SUPPORT_GROUP_ID,
      name: topicNameOf(displayName, username),
    });
  } catch (error) {
    try {
      await db.update(supportConversations).set({ threadId: null, status: 'stopped', updatedAt: nowSec() })
        .where(eq(supportConversations.userId, userId)).run();
    } catch (_) {}
    throw error;
  }

  await db.update(supportConversations).set({
    threadId: topic.message_thread_id,
    status: 'active',
    displayName,
    username,
    updatedAt: nowSec(),
  }).where(eq(supportConversations.userId, userId)).run();
  const convo = await getConversation(userId);
  return ensureTopicIntro(userId, convo);
}

async function ensureConversation(user) {
  const userId = user.id;
  const displayName = displayNameOf(user);
  const username = user.username || null;
  const existing = await getConversation(userId);
  if (existing?.isBanned) throw new Error('This account is blocked from contacting support.');

  if (existing?.threadId) {
    const renamed = existing.displayName !== displayName || (existing.username || null) !== username;
    let renameSucceeded = true;
    if (renamed) {
      try {
        await api.editForumTopic({
          chat_id: SUPPORT_GROUP_ID,
          message_thread_id: existing.threadId,
          name: topicNameOf(displayName, username),
        });
      } catch (error) {
        renameSucceeded = false;
        console.error('Support topic rename failed:', error?.description || error?.message || 'unknown error');
      }
    }
    await db.update(supportConversations).set({
      status: 'active',
      ...(renameSucceeded ? { displayName, username } : {}),
      updatedAt: nowSec(),
    }).where(eq(supportConversations.userId, userId)).run();
    const refreshed = await ensureTopicIntro(userId, await getConversation(userId));
    await refreshTopicIntro(userId, refreshed);
    return refreshed;
  }
  return createOrGetTopic(user);
}

async function refreshConversationProfile(user) {
  const existing = await getConversation(user.id);
  if (!existing?.threadId) return existing;
  const displayName = displayNameOf(user);
  const username = user.username || null;
  if (existing.displayName !== displayName || (existing.username || null) !== username) {
    let renameSucceeded = true;
    try {
      await api.editForumTopic({
        chat_id: SUPPORT_GROUP_ID,
        message_thread_id: existing.threadId,
        name: topicNameOf(displayName, username),
      });
    } catch (error) {
      renameSucceeded = false;
      console.error('Support topic rename failed:', error?.description || error?.message || 'unknown error');
    }
    if (renameSucceeded) {
      await db.update(supportConversations).set({ displayName, username, updatedAt: nowSec() })
        .where(eq(supportConversations.userId, user.id)).run();
    }
  }
  const refreshed = await ensureTopicIntro(user.id, await getConversation(user.id));
  await refreshTopicIntro(user.id, refreshed);
  return refreshed;
}

export async function handleSupportCommand(message) {
  const text = String(message.text || '').trim();
  const command = text.split(/[\s@]/)[0].toLowerCase();
  if (command !== '/awwsheesh') return false;
  // Intentionally swallow the command in groups; /awwsheesh remains silent there.
  if (message.chat?.type !== 'private') return true;
  if (!message.from || message.from.is_bot) return true;
  try {
    const convo = await refreshConversationProfile(message.from);
    if (convo?.isBanned) await sendBanNotice(message.from.id);
    else await sendSupportMenu(message.from.id, message.from);
  } catch (error) {
    console.error('Support menu failed:', error?.description || error?.message || 'unknown error');
    try { await api.sendMessage({ chat_id: message.chat.id, text: 'Support is temporarily unavailable. Please try again later.' }); } catch (_) {}
  }
  return true;
}

async function answer(cq, text, showAlert = false) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: cq.id,
      ...(text ? { text, show_alert: !!showAlert } : {}),
    });
  } catch (_) {}
}

async function handleOwnerSupportAction(cq, action, userId) {
  if (!isAuthorized(cq.from?.id)) {
    await answer(cq, 'Only the owner can use this control.', true);
    return true;
  }
  if (!supportReady() || cq.message?.chat?.id !== SUPPORT_GROUP_ID || cq.message?.chat?.type !== 'supergroup') {
    await answer(cq, 'This control is only available in the support group.', true);
    return true;
  }

  const convo = await getConversation(userId);
  if (!convo) {
    await answer(cq, 'Support record not found.', true);
    return true;
  }
  if ((action === 'ban' || action === 'unban') && cq.message.message_thread_id !== convo.threadId) {
    await answer(cq, 'This control belongs to a different user topic.', true);
    return true;
  }
  if (action === 'unbanreq' && (!ownerTopicReady() || cq.message.message_thread_id !== SUPPORT_USERS_TOPIC_ID)) {
    await answer(cq, 'Unban requests can only be handled in the users topic.', true);
    return true;
  }

  if (action === 'unbanreq') {
    await db.update(supportConversations).set({ isBanned: 0, status: 'stopped', updatedAt: nowSec() })
      .where(eq(supportConversations.userId, userId)).run();
    const updated = await getConversation(userId);
    await refreshTopicIntro(userId, updated);
    try {
      await api.sendRichMessage({
        chat_id: userId,
        rich_message: {
          html: '<p><b>✅ The owner has restored your support access.</b></p><p>Use /awwsheesh or Contact Owner to start a new conversation.</p>',
        },
      });
    } catch (error) {
      console.error('Unban notification failed:', error?.description || error?.message || 'unknown error');
    }
    try {
      await api.editMessageText({
        chat_id: SUPPORT_GROUP_ID,
        message_id: cq.message.message_id,
        rich_message: {
          html: `<p><b>#unbanreq · resolved</b></p><p>User ID: <code>${userId}</code></p><tg-button-row align="center"><tg-button type="disabled" style="success">✅ Unbanned</tg-button></tg-button-row>`,
        },
      });
    } catch (_) {}
    await answer(cq, 'User unbanned.');
    return true;
  }

  const banned = action === 'ban';
  await db.update(supportConversations).set({
    isBanned: banned ? 1 : 0,
    status: 'stopped',
    unbanPromptAt: 0,
    updatedAt: nowSec(),
  }).where(eq(supportConversations.userId, userId)).run();
  const updated = await getConversation(userId);
  await refreshTopicIntro(userId, updated);

  try {
    await api.sendRichMessage({
      chat_id: userId,
      rich_message: {
        html: banned
          ? `<p><b>🚫 The owner has blocked your access to support.</b></p><p>While blocked, your messages will not be forwarded. You may request a review once every 24 hours.</p><tg-button-row align="center"><tg-button type="callback_data" style="primary" data="si:request_unban:${userId}">📝 Request unban</tg-button></tg-button-row>`
          : '<p><b>✅ The owner has restored your support access.</b></p><p>Use /awwsheesh or Contact Owner to start a conversation.</p>',
      },
    });
  } catch (error) {
    console.error('Support access notice failed:', error?.description || error?.message || 'unknown error');
  }
  await answer(cq, banned ? 'User banned.' : 'User unbanned.');
  return true;
}

async function openUnbanPrompt(cq, userId) {
  if (!cq.message || cq.message.chat?.type !== 'private' || cq.message.chat.id !== userId || cq.from?.id !== userId) {
    await answer(cq, 'This control is not yours.', true);
    return true;
  }
  const convo = await getConversation(userId);
  if (!convo?.isBanned) {
    await answer(cq, 'Your support access is already available.');
    return true;
  }
  const now = nowSec();
  const lastRequest = Number(convo.unbanRequestAt || 0);
  if (lastRequest && now - lastRequest < UNBAN_COOLDOWN) {
    const hours = Math.ceil((UNBAN_COOLDOWN - (now - lastRequest)) / 3600);
    await answer(cq, `You can request unban again in about ${hours} hour(s).`, true);
    return true;
  }
  if (convo.unbanPromptAt && now - convo.unbanPromptAt < UNBAN_PROMPT_TTL) {
    await answer(cq, 'Your unban request window is already open. Reply to the prompt.');
    return true;
  }

  await db.update(supportConversations).set({ unbanPromptAt: now, updatedAt: now })
    .where(eq(supportConversations.userId, userId)).run();
  await answer(cq, 'Unban request opened.');
  try {
    await api.sendRichMessage({
      chat_id: userId,
      rich_message: { html: '<p><b>📝 Unban request</b></p><p>Reply to this message with a short explanation for the owner.</p>' },
      reply_markup: { force_reply: true, input_field_placeholder: 'Why should access be restored?' },
    });
  } catch (error) {
    await db.update(supportConversations).set({ unbanPromptAt: 0 })
      .where(eq(supportConversations.userId, userId)).run();
    console.error('Unban prompt failed:', error?.description || error?.message || 'unknown error');
    try { await api.sendMessage({ chat_id: userId, text: 'Could not open the request window. Please try again later.' }); } catch (_) {}
  }
  return true;
}

async function submitUnbanRequest(message, convo) {
  const userId = message.from.id;
  const now = nowSec();
  if (!convo.unbanPromptAt || now - convo.unbanPromptAt > UNBAN_PROMPT_TTL) {
    await db.update(supportConversations).set({ unbanPromptAt: 0 })
      .where(eq(supportConversations.userId, userId)).run();
    return false;
  }
  const requestText = String(message.text || message.caption || '').trim();
  if (!requestText) {
    try { await api.sendMessage({ chat_id: userId, text: 'Please send a text explanation for your unban request.' }); } catch (_) {}
    return true;
  }
  if (!ownerTopicReady()) {
    try { await api.sendMessage({ chat_id: userId, text: 'The owner request inbox is temporarily unavailable. Please try again later.' }); } catch (_) {}
    return true;
  }

  const previousRequestAt = Number(convo.unbanRequestAt || 0);
  const reserved = await db.run(
    'UPDATE support_conversations SET unban_prompt_at = 0, unban_request_at = :now, updated_at = :now WHERE user_id = :user AND unban_prompt_at = :prompt AND unban_request_at = :previous',
    { ':now': now, ':user': userId, ':prompt': convo.unbanPromptAt, ':previous': previousRequestAt },
  );
  if (!reserved.rowsAffected) return true;

  const mention = `<a href="tg://user?id=${userId}">${escapeHtml(displayNameOf(message.from))}</a>`;
  const html = `<p><b>#unbanreq</b></p><p><b>User:</b> ${mention}</p><p><b>Username:</b> ${message.from.username ? `@${escapeHtml(message.from.username)}` : ''}</p><p><b>User ID:</b> <code>${userId}</code></p><p><b>Date:</b> <tg-time unix="${now}" format="wDT">${escapeHtml(formatDate(now))}</tg-time></p><p><b>Request:</b></p><blockquote>${escapeHtml(requestText)}</blockquote><tg-button-row align="center"><tg-button type="callback_data" style="success" data="si:unbanreq:${userId}">✅ Unban</tg-button></tg-button-row>`;

  try {
    await api.sendRichMessage({
      chat_id: SUPPORT_GROUP_ID,
      message_thread_id: SUPPORT_USERS_TOPIC_ID,
      rich_message: { html },
    });
  } catch (error) {
    await db.update(supportConversations).set({ unbanPromptAt: now, unbanRequestAt: previousRequestAt })
      .where(eq(supportConversations.userId, userId)).run();
    console.error('Unban request delivery failed:', error?.description || error?.message || 'unknown error');
    try { await api.sendMessage({ chat_id: userId, text: 'Your request could not be delivered. Please try again later.' }); } catch (_) {}
    return true;
  }

  try {
    await api.sendRichMessage({
      chat_id: userId,
      rich_message: { html: '<p>✅ Your unban request has been sent to the owner. You can submit another request after 24 hours.</p>' },
    });
  } catch (_) {}
  return true;
}

export async function handleSupportCallback(cq) {
  const data = String(cq.data || '');
  if (!data.startsWith('si:')) return false;
  const parts = data.split(':');
  const action = parts[1];
  const userId = Number(parts[2]);
  if (!Number.isSafeInteger(userId) || userId <= 0 || parts.length !== 3) {
    await answer(cq, 'Invalid support control.', true);
    return true;
  }

  try {
    if (action === 'ban' || action === 'unban' || action === 'unbanreq') {
      return await handleOwnerSupportAction(cq, action, userId);
    }
    if (action === 'request_unban') return await openUnbanPrompt(cq, userId);

    const privateMessage = cq.message?.chat?.type === 'private';
    if (!Number.isSafeInteger(cq.from?.id) || cq.from.id !== userId || !privateMessage || cq.message.chat.id !== userId) {
      await answer(cq, 'This control is not yours.', true);
      return true;
    }
    if (action === 'menu') {
      await answer(cq);
      await refreshConversationProfile(cq.from);
      await sendSupportMenu(userId, cq.from);
      return true;
    }
    if (action === 'start') {
      const existing = await getConversation(userId);
      if (existing?.isBanned) {
        await answer(cq, 'Your access is blocked.');
        await sendBanNotice(userId);
        return true;
      }
      const convo = await ensureConversation(cq.from);
      if (!convo?.threadId) throw new Error('Support topic is not available.');
      await answer(cq, 'Conversation started.');
      await updateSupportMenuMessage(cq, userId);
      await api.sendRichMessage({
        chat_id: userId,
        rich_message: { html: '<p>💬 Your support conversation is active. Send a message here whenever you need help.</p>' },
      });
      return true;
    }
    if (action === 'pause' || action === 'pause_msg' || action === 'stop') {
      const existing = await getConversation(userId);
      if (existing?.isBanned) {
        await answer(cq, 'Your access is blocked.', true);
        await sendBanNotice(userId);
        return true;
      }
      const paused = action !== 'stop';
      const status = paused ? 'paused' : 'stopped';
      await db.update(supportConversations).set({ status, updatedAt: nowSec() })
        .where(eq(supportConversations.userId, userId)).run();
      await answer(cq, paused ? 'Conversation paused.' : 'Conversation stopped.');
      if (action === 'pause') await updateSupportMenuMessage(cq, userId);
      await api.sendRichMessage({
        chat_id: userId,
        rich_message: { html: paused
          ? '<p>⏸ Your support conversation is paused. Resume with /awwsheesh or Contact Owner.</p>'
          : '<p>🛑 Your support conversation is stopped. Restart with /awwsheesh or Contact Owner.</p>' },
      });
      return true;
    }
    await answer(cq, 'Invalid support control.', true);
    return true;
  } catch (error) {
    console.error('Support callback failed:', error?.description || error?.message || 'unknown error');
    await answer(cq, 'Support is temporarily unavailable. Please try again.', true);
    return true;
  }
}

export async function handleSupportMessage(message) {
  if (message.chat?.type !== 'private' || !message.from || message.from.is_bot) return false;

  let convo;
  try {
    convo = await getConversation(message.from.id);
  } catch (error) {
    console.error('Support conversation lookup failed:', error?.description || error?.message || 'unknown error');
    return false;
  }

  if (convo?.isBanned) {
    if (convo.unbanPromptAt) {
      const submitted = await submitUnbanRequest(message, convo);
      if (submitted) return true;
    }
    if (String(message.text || '').startsWith('/')) return false;
    try { await sendBanNotice(message.from.id); } catch (_) {}
    return true;
  }

  // Keep existing bot commands available; /awwsheesh is handled above.
  if (String(message.text || '').startsWith('/')) return false;
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
    try { await api.sendMessage({ chat_id: message.chat.id, text: 'I could not send that message to support. Please try again later.' }); } catch (_) {}
    return true;
  }

  try {
    const newConfirmation = await api.sendRichMessage({
      chat_id: message.chat.id,
      rich_message: {
        html: `<p>${escapeHtml(CONFIRMATION)}</p><tg-button-row align="center"><tg-button type="callback_data" style="danger" data="si:pause_msg:${message.from.id}">⏸ Pause conversation</tg-button></tg-button-row>`,
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
      await api.sendRichMessage({
        chat_id: SUPPORT_GROUP_ID,
        message_thread_id: convo.threadId,
        rich_message: { html: `<p>Support conversation ${status}. The user can reopen it with /awwsheesh → Start / Resume.</p>` },
      });
      return true;
    }
    if (convo.isBanned || convo.status !== 'active') return true;

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
