// ExFrozen common commands: /start, /help, /balance, /leaderboard (/lb),
// /backup, /backup_all. Balances here are ExFrozen study coins only.
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { api } from './message_api.js';
import { runBackup, runFullBackup } from './backup.js';
import { OWNER_ID, BOT_USERNAME } from './config.js';
import { render, style, mention as mentionFn } from './texts.js';
import { send, sweepMessages, trackUser } from './chat.js';
import { sendWelcome, buildUserHelpBlocks } from './welcome_ui.js';
import { helpText } from './help.js';
import { getBalance, getStudyCoins } from './economy.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const isGroup = (chat) => chat && (chat.type === 'group' || chat.type === 'supergroup');

const table = (rows) => ({
  type: 'table', is_bordered: true, is_compact: true,
  cells: rows.map((r) => r.map((c) => ({ text: [String(c)] }))),
});

async function trackGroup(message) {
  if (!isGroup(message.chat) || !message.from) return;
  await db.run(sql`
    INSERT OR IGNORE INTO group_members (chat_id, telegram_id)
    VALUES (${message.chat.id}, ${message.from.id})
  `);
}

function reply(message, body, extra = {}) {
  return send(message.chat.id, { text: render(message.from, body), parse_mode: 'HTML', ...extra });
}

async function balanceBody(message) {
  const user = message.from;
  const bal = await getBalance(user.id);
  const studyCoins = await getStudyCoins(user.id);
  let rank = '';
  if (isGroup(message.chat)) {
    const r = await db.get(sql`
      SELECT COUNT(*) AS n FROM group_members g
      JOIN users u ON u.telegram_id = g.telegram_id
      WHERE g.chat_id = ${message.chat.id} AND u.balance > ${bal}
    `);
    rank = `  #${(r ? r.n : 0) + 1}`;
  }
  return (
    `📚 ${mentionFn(user)}\n` +
    `🍥 Study coins: ${fmt(bal)}${rank}\n` +
    `✦ Earned through study: ${fmt(studyCoins)} 🍥\n` +
    `Earn more with /studytime, /todo and /tracker`
  );
}

async function sendGlobalLeaderboard(chatId) {
  const rows = await db.all(sql`
    SELECT telegram_id AS id, username, first_name, balance
    FROM users ORDER BY balance DESC LIMIT 10
  `);
  const tableRows = [['Rank', 'Name', 'Coins']];
  if (rows && rows.length) {
    rows.forEach((r, i) => {
      const display = r.username ? `@${r.username}` : (r.first_name || String(r.id));
      tableRows.push([String(i + 1), display, `${fmt(r.balance)} 🍥`]);
    });
  } else {
    tableRows.push(['—', 'No data yet', '—']);
  }
  try {
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: { blocks: [{ type: 'heading', text: '🌍 Global Study Leaderboard', size: 2 }, table(tableRows)] },
    });
  } catch (e) {
    let body = `🌍 <b>Global Study Leaderboard</b>\n\n`;
    if (!rows || !rows.length) body += 'No data yet.';
    else rows.forEach((r, i) => { body += `${i + 1}. ${r.username ? `@${r.username}` : (r.first_name || r.id)} — ${fmt(r.balance)} 🍥\n`; });
    await send(chatId, { text: style(body), parse_mode: 'HTML' });
  }
}

async function handleLeaderboard(message) {
  const chat = message.chat;
  if (!isGroup(chat)) {
    await sendGlobalLeaderboard(chat.id);
    return;
  }
  const rows = await db.all(sql`
    SELECT u.telegram_id AS id, u.username, u.first_name, u.balance
    FROM group_members g JOIN users u ON u.telegram_id = g.telegram_id
    WHERE g.chat_id = ${chat.id} ORDER BY u.balance DESC LIMIT 10
  `);
  const tableRows = [['Rank', 'Name', 'Coins']];
  if (rows && rows.length) {
    rows.forEach((r, i) => {
      const display = r.username ? `@${r.username}` : (r.first_name || String(r.id));
      tableRows.push([String(i + 1), display, `${fmt(r.balance)} 🍥`]);
    });
  } else {
    tableRows.push(['—', 'No data yet', '—']);
  }
  const blocks = [
    { type: 'heading', text: '🏆 Group Study Leaderboard', size: 2 },
    table(tableRows),
    { type: 'buttons', align: 'center', buttons: [{ text: 'Global leaderboard', callback_data: 'lb:global', style: 'primary' }] },
  ];
  try {
    await api.sendRichMessage({ chat_id: chat.id, rich_message: { blocks } });
  } catch (e) {
    let body = `🏆 <b>Group Study Leaderboard</b>\n\n`;
    if (!rows || !rows.length) body += 'No data yet.';
    else rows.forEach((r, i) => { body += `${i + 1}. ${mentionFn({ id: r.id, first_name: r.first_name || r.username || String(r.id) })} — ${fmt(r.balance)} 🍥\n`; });
    await send(chat.id, {
      text: style(body), parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Global leaderboard', callback_data: 'lb:global', style: 'primary' }]] },
    });
  }
}

export async function handleCommonCommand(message) {
  const head0 = (message.text ?? '').split(/\s+/)[0].split('@')[0].toLowerCase();
  if (head0 === '/backup_all') {
    if (message.from?.id !== OWNER_ID) return true;
    await runFullBackup(message.chat.id);
    return true;
  }
  if (head0 === '/backup') {
    if (message.from?.id !== OWNER_ID) return true;
    await runBackup(message.chat.id);
    return true;
  }

  try { await sweepMessages(); } catch (e) { console.error(e); }

  const text = message.text;
  const user = message.from;
  if (!text || !text.startsWith('/') || !user || user.is_bot) return false;

  const head = text.split(/\s+/)[0].slice(1);
  const [rawCmd, target] = head.split('@');
  if (target && target.toLowerCase() !== BOT_USERNAME) return false;
  const cmd = rawCmd.toLowerCase();
  if (!['start', 'help', 'balance', 'leaderboard', 'lb'].includes(cmd)) return false;

  try { await trackUser(user); } catch (e) { console.error(e); }
  try { await trackGroup(message); } catch (e) { console.error(e); }

  if (cmd === 'start') {
    await sendWelcome(message.chat.id, user);
  } else if (cmd === 'help') {
    try {
      const blocks = await buildUserHelpBlocks(user);
      await api.sendRichMessage({ chat_id: message.chat.id, rich_message: { blocks } });
    } catch (e) {
      console.error('help rich failed:', e?.description || e);
      await reply(message, helpText(user));
    }
  } else if (cmd === 'balance') {
    await send(message.chat.id, { text: style(await balanceBody(message)), parse_mode: 'HTML' });
  } else {
    await handleLeaderboard(message);
  }
  return true;
}

export async function handleCommonCallback(cq) {
  if ((cq.data || '') !== 'lb:global') return false;
  await api.answerCallbackQuery({ callback_query_id: cq.id }).catch(() => {});
  if (cq.message) await sendGlobalLeaderboard(cq.message.chat.id);
  return true;
}
