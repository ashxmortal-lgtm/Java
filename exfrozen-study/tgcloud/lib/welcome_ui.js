// ExFrozen welcome + help. /start shows the study welcome directly and
// /help opens the study help directly — there is no Game/Study mode chooser.
import { db } from 'sdk';
import { api } from './message_api.js';
import { eq, sql } from 'sdk/db';
import { OWNER_ID, BOT_USERNAME } from './config.js';
import { listCommands } from './command_registry.js';
import { groupAdmins as GA } from '../schema.js';
import { buildStudyStatsBlocks } from './study/hub.js';

const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const divider = { type: 'divider' };
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const urlBtn = (text, url, style) => (style ? { text, url, style } : { text, url });
const rich = (blocks) => ({ blocks });
const cmdLine = (cmd, desc) => para(`${cmd}  —  ${desc}`);
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
const blockquote = (...lines) => ({ type: 'blockquote', blocks: lines.map((l) => para(l)) });
const urlText = (text, url) => ({ type: 'url', text, url });
const BOT_NAME = '𝐄𝐱 𝑭𝒓❄️𝒛𝒆𝒏';

async function botUsername() {
  try {
    const me = await api.getMe();
    return me.username || BOT_USERNAME;
  } catch (_) {
    return BOT_USERNAME;
  }
}

const addToGroupUrl = (uname) =>
  `https://t.me/${uname}?startgroup=true&admin=delete_messages+restrict_members+invite_users+pin_messages+manage_video_chats+change_info+manage_topics+promote_members`;

async function primaryButtons(userId) {
  const uname = await botUsername();
  return [
    row(
      urlBtn('Add to grp', addToGroupUrl(uname), 'danger'),
      cb('Help', 'wel:help', 'success'),
    ),
    row(cb('Contact ❄️ owner', `si:menu:${userId}`, 'primary')),
  ];
}

/** Study mini profile shown in the normal-user welcome. */
async function miniProfile(user) {
  const uid = user.id;
  const out = { balance: 0, studyCoins: 0, rank: '—', chapters: 0, todos: 0 };
  try {
    const u = await db.get(sql`SELECT balance, study_coins FROM users WHERE telegram_id = ${uid}`);
    if (u) {
      out.balance = u.balance || 0;
      out.studyCoins = u.study_coins || 0;
      const r = await db.get(sql`SELECT COUNT(*) + 1 AS pos FROM users WHERE balance > ${u.balance || 0}`);
      out.rank = r ? `#${r.pos}` : '—';
    }
  } catch (_) {}
  try {
    const rows = await db.all(sql`SELECT revision_done AS rd, practice_done AS pd, pyq_done AS qd FROM biology_tracker WHERE user_id = ${uid}`);
    out.chapters = (rows || []).filter((r) => r.rd && r.pd && r.qd).length;
  } catch (_) {}
  try {
    const t = await db.get(sql`SELECT COUNT(*) AS n FROM study_todos WHERE user_id = ${uid} AND status = 'closed' AND completed = 1`);
    out.todos = t ? Number(t.n) : 0;
  } catch (_) {}
  return out;
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
      ...listCommands('owner').filter((c) => c.access === 'owner').map((c) => para(`${c.cmd}  —  ${c.desc}`)),
      divider,
      ...buttons,
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
      ...buttons,
    ];
  }

  const mp = await miniProfile(user);
  const botLink = `https://t.me/${uname}`;
  return [
    para(mention(user), ' ᴡᴇʟᴄᴏᴍᴇ!'),
    para(
      urlText(BOT_NAME, botLink),
      ' is your study companion for NEET aspirants — set goals, track chapters, duel friends and earn study coins 🍥. Check the Help menu to explore!',
    ),
    para('/study — Open the study hub 📚'),
    para('ʏᴏᴜʀ ᴍɪɴɪ ᴘʀᴏꜰɪʟᴇ'),
    blockquote(
      `🍥 Balance: ${Number(mp.balance).toLocaleString('en-US')}`,
      `📚 Study coins earned: ${Number(mp.studyCoins).toLocaleString('en-US')}`,
      `🧬 Chapters completed: ${mp.chapters}`,
      `✅ Todos completed: ${mp.todos}`,
      `🏆 Global Rank: ${mp.rank}`,
    ),
    para('Add ', urlText(BOT_NAME, botLink), ' to your study group to begin!'),
    ...buttons,
  ];
}

// ---- /help: study commands directly (no mode chooser) ----
// Callback data: hp:<screen>[:w]. ":w" = opened from the welcome message.
const backBtn = (data) => row(cb('← Back', data, 'danger'));
const sfx = (fromWelcome) => (fromWelcome ? ':w' : '');

export async function buildUserHelpBlocks(_user, fromWelcome = false) {
  return [
    head('📚 Study help'),
    cmdLine('/study', 'Open the study hub'),
    cmdLine('/studytime', 'Set a daily study goal & nightly report'),
    cmdLine('/todo', 'Create and track your todos'),
    cmdLine('/duel', 'Challenge a friend to a study duel'),
    cmdLine('/tracker', 'Track biology progress'),
    cmdLine('/report', 'Send a study report anytime'),
    cmdLine('/reminder', 'Set a timed reminder'),
    cmdLine('/hnc', 'Hidden NEET Community links & study material'),
    cmdLine('/balance', 'Your study-coin balance & rank'),
    cmdLine('/leaderboard (/lb)', 'Top study balances'),
    row(cb('📊 My study stats', `hp:study${sfx(fromWelcome)}`, 'success')),
    ...(fromWelcome ? [backBtn('wel:back')] : []),
  ];
}

export async function sendWelcome(chatId, user) {
  const blocks = await buildWelcomeBlocks(user);
  try {
    return await api.sendRichMessage({ chat_id: chatId, rich_message: rich(blocks) });
  } catch (e) {
    console.error('sendWelcome failed:', e?.description || e);
    return api.sendMessage({
      chat_id: chatId,
      text: `${user.first_name || 'User'} welcome to ${BOT_NAME} — your study bot.\n\n/study : open the study hub 📚\n/help : all study commands`,
    });
  }
}

async function editTo(cq, blocks, detectEntities = false) {
  await api.editMessageText({
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    rich_message: detectEntities
      ? { blocks: Array.isArray(blocks) ? blocks : blocks?.blocks || [] }
      : { blocks: Array.isArray(blocks) ? blocks : blocks?.blocks || [], skip_entity_detection: true },
  });
}

export async function handleWelcomeCallback(cq) {
  const data = cq.data || '';
  const isHelp = data.startsWith('hp:');
  if (data !== 'wel:help' && data !== 'wel:back' && !isHelp) return false;
  if (!cq.message) {
    await api.answerCallbackQuery({ callback_query_id: cq.id }).catch(() => {});
    return true;
  }
  try {
    if (data === 'wel:back') {
      await api.answerCallbackQuery({ callback_query_id: cq.id });
      await editTo(cq, await buildWelcomeBlocks(cq.from));
      return true;
    }
    if (data === 'wel:help') {
      await api.answerCallbackQuery({ callback_query_id: cq.id });
      await editTo(cq, await buildUserHelpBlocks(cq.from, true));
      return true;
    }
    const [, screen, flag] = data.split(':');
    const w = flag === 'w';
    await api.answerCallbackQuery({ callback_query_id: cq.id });
    if (screen === 'study') {
      await editTo(cq, await buildStudyStatsBlocks(cq.from, w), true);
      return true;
    }
    // hp:home (and any legacy game-mode screen) lands on the study help.
    await editTo(cq, await buildUserHelpBlocks(cq.from, w));
  } catch (e) {
    console.error('welcome callback failed:', e?.description || e);
    try { await api.answerCallbackQuery({ callback_query_id: cq.id }); } catch (_) {}
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
    inline_keyboard: [
      [
        { text: 'Add to grp', url: addToGroupUrl(uname), style: 'danger' },
        { text: 'Help', callback_data: 'wel:help', style: 'success' },
      ],
      ...(userId ? [[{ text: 'Contact ❄️ owner', callback_data: `si:menu:${userId}`, style: 'primary' }]] : []),
    ],
  };
}
