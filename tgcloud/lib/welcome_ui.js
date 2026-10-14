import { BotApiError, db } from 'sdk';
import { api } from './message_api.js';
import { eq } from 'sdk/db';
import { OWNER_ID } from './config.js';
import { listCommands } from './command_registry.js';
import { groupAdmins as GA } from '../schema.js';

const bold = (text) => ({ type: 'bold', text });
const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const divider = { type: 'divider' };
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const urlBtn = (text, url, style) => (style ? { text, url, style } : { text, url });
const rich = (blocks) => ({ blocks });
const mention = (u) => ({
  type: 'text_mention',
  text: (u && u.first_name) || 'User',
  user: {
    id: u.id,
    is_bot: !!(u && u.is_bot),
    first_name: (u && u.first_name) || 'User',
    last_name: u && u.last_name,
    username: u && u.username,
  },
});

async function botUsername() {
  try {
    const me = await api.getMe();
    return me.username || 'exfrozen_bot';
  } catch (_) {
    return 'exfrozen_bot';
  }
}

async function primaryButtons(userId) {
  const uname = await botUsername();
  return row(
    urlBtn('➕ Add to Group', `https://t.me/${uname}?startgroup=true&admin=delete_messages+restrict_members+invite_users+pin_messages+manage_video_chats+change_info+manage_topics+promote_members&admin=delete_messages+restrict_members+invite_users+pin_messages+manage_video_chats+change_info+manage_topics+promote_members`, 'success'),
    cb('📚 Help', 'wel:help', 'primary'),
    cb('💬 Contact Owner', `si:menu:${userId}`, 'primary'),
  );
}

export async function isRegisteredAdminAny(userId) {
  if (userId === OWNER_ID) return true;
  try {
    const r = await db.select().from(GA).where(eq(GA.userId, userId)).get();
    return !!r;
  } catch (_) {
    return false;
  }
}

function ownerCmdLines() {
  return listCommands('owner')
    .filter((c) => c.access === 'owner')
    .map((c) => para(`${c.cmd}  —  ${c.desc}`));
}

function userHelpLines() {
  return listCommands('user').map((c) => para(`${c.cmd}  —  ${c.desc}`));
}

export async function buildWelcomeBlocks(user) {
  const buttons = await primaryButtons(user.id);
  const uname = await botUsername();

  if (user.id === OWNER_ID) {
    return [
      para(mention(user)),
      head('👑 OWNER DASHBOARD'),
      para(`Welcome to @${uname}`),
      para('Owner-only commands:'),
      divider,
      ...ownerCmdLines(),
      divider,
      buttons,
    ];
  }

  if (await isRegisteredAdminAny(user.id)) {
    const adminCmds = listCommands('admin')
      .filter((c) => c.access === 'admin')
      .map((c) => para(`${c.cmd}  —  ${c.desc}`));
    return [
      para(mention(user)),
      head('🛡 ADMIN WELCOME'),
      para(`Welcome to @${uname}`),
      para('Admin commands:'),
      divider,
      ...adminCmds,
      divider,
      para('Press Help for the full user command list.'),
      buttons,
    ];
  }

  // Normal user — requested copy (no pull_quotation; uses proven block types only)
  return [
    para(mention(user), ` welcome to @${uname} ❄️`),
    para('Use the commands below to get started.'),
    divider,
    para('◈ /Claim — daily reward'),
    para('◈ /Balance — check balance'),
    para('◈ /Profile — view profile'),
    para('◈ /Inventory — view inventory'),
    divider,
    buttons,
  ];
}

export async function buildUserHelpBlocks(user) {
  return [
    para(mention(user)),
    head('📚 COMMANDS'),
    divider,
    ...userHelpLines(),
    divider,
    row(cb('⬅️ Back', 'wel:back', 'primary')),
  ];
}

export async function sendWelcome(chatId, user) {
  const blocks = await buildWelcomeBlocks(user);
  try {
    return await api.sendRichMessage({ chat_id: chatId, rich_message: rich(blocks) });
  } catch (e) {
    console.error('sendWelcome failed:', e?.description || e);
    // Second try without mention entity (some clients reject text_mention in certain contexts)
    try {
      const uname = await botUsername();
      const simple = [
        head(`Welcome to @${uname} ❄️`),
        para('Use the commands below to get started.'),
        para('◈ /Claim — daily reward'),
        para('◈ /Balance — check balance'),
        para('◈ /Profile — view profile'),
        para('◈ /Inventory — view inventory'),
        await primaryButtons(user.id),
      ];
      return await api.sendRichMessage({ chat_id: chatId, rich_message: rich(simple) });
    } catch (e2) {
      console.error('sendWelcome simple failed:', e2?.description || e2);
      const uname = await botUsername();
      return api.sendMessage({
        chat_id: chatId,
        text:
          `${user.first_name || 'User'} welcome to @${uname} ❄️\n\n` +
          'Use the commands below to get started.\n\n' +
          '◈ /Claim — daily reward\n' +
          '◈ /Balance — check balance\n' +
          '◈ /Profile — view profile\n' +
          '◈ /Inventory — view inventory',
      });
    }
  }
}

export async function handleWelcomeCallback(cq) {
  const data = cq.data || '';
  if (data !== 'wel:help' && data !== 'wel:back') return false;
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  if (!cq.message) return true;

  try {
    if (data === 'wel:help') {
      const blocks = await buildUserHelpBlocks(cq.from);
      await api.editMessageText({
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        rich_message: rich(blocks),
      });
    } else {
      // wel:back → restore welcome
      const blocks = await buildWelcomeBlocks(cq.from);
      await api.editMessageText({
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        rich_message: rich(blocks),
      });
    }
  } catch (e) {
    console.error('welcome callback failed:', e?.description || e);
    // If edit fails (e.g. message was plain fallback), send new rich help/welcome
    try {
      if (data === 'wel:help') {
        await api.sendRichMessage({
          chat_id: cq.from.id,
          rich_message: rich(await buildUserHelpBlocks(cq.from)),
        });
      } else {
        await sendWelcome(cq.from.id, cq.from);
      }
    } catch (_) {}
  }
  return true;
}

export async function buildWelcome(user) {
  return { blocks: await buildWelcomeBlocks(user), rich: true };
}
export function buildUserHelp() { return 'Use /help'; }
export async function primaryKeyboard(userId) {
  const uname = await botUsername();
  return {
    inline_keyboard: [[
      { text: '➕ Add to Group', url: `https://t.me/${uname}?startgroup=true&admin=delete_messages+restrict_members+invite_users+pin_messages+manage_video_chats+change_info+manage_topics+promote_members&admin=delete_messages+restrict_members+invite_users+pin_messages+manage_video_chats+change_info+manage_topics+promote_members` },
      { text: '📚 Help', callback_data: 'wel:help' },
      ...(userId ? [{ text: '💬 Contact Owner', callback_data: `si:menu:${userId}` }] : []),
    ]],
  };
}
