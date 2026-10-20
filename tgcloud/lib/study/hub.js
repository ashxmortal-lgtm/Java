import { BotApiError } from 'sdk';
import { api } from '../message_api.js';
import { style } from '../texts.js';
import { MINI_APP_TRACKER_URL } from '../config.js';
import { sendBlocks, mention, head, para, divider, row, rp, quoteText } from './common.js';

const BOT_USERNAME = 'missfrozen_bot';

// web_app buttons only work in private chats; in groups the button opens the
// bot DM with a whitelisted payload and the bot answers with the Mini App button.
function trackerButton(chat) {
  return chat && chat.type === 'private'
    ? { text: 'Open biology tracker', web_app: { url: MINI_APP_TRACKER_URL }, style: 'success' }
    : { text: 'Open biology tracker', url: `https://t.me/${BOT_USERNAME}?start=mini_tracker`, style: 'success' };
}

/** DM reply for the mini_tracker deep link: one tap launches the Mini App on the tracker. */
export async function sendTrackerLauncher(chatId) {
  await api.sendMessage({
    chat_id: chatId,
    text: style('🧬 Biology tracker'),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{
      text: 'Open biology tracker',
      web_app: { url: MINI_APP_TRACKER_URL },
      style: 'success',
    }]] },
  });
}

export async function handleStudyHub(message) {
  const blocks = [
    head('📚 𝐒𝐓𝐔𝐃𝐘 𝐇𝐔𝐁'),
    para('🥷 ', mention(message.from)),
    para('🌱 ꜱᴛᴜᴅʏ • ᴛʀᴀᴄᴋ • ᴇᴀʀɴ 🍥'),
    divider,
    head('🗂️ 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬', 3),
    para('📖 /studytime — ꜱᴇᴛ ᴅᴀɪʟʏ ꜱᴛᴜᴅʏ ɢᴏᴀʟ & ɴɪɢʜᴛʟʏ ʀᴇᴘᴏʀᴛ'),
    para('🗒️ /todo — ᴄʀᴇᴀᴛᴇ ᴀɴᴅ ᴛʀᴀᴄᴋ ʏᴏᴜʀ ᴛᴏᴅᴏ'),
    para('⚔️ /duel @username — ᴄʜᴀʟʟᴇɴɢᴇ ᴛᴏ ᴀ ꜱᴛᴜᴅʏ ᴅᴜᴇʟ'),
    para('🧬 /tracker — ᴛʀᴀᴄᴋ ʙɪᴏʟᴏɢʏ ᴘʀᴏɢʀᴇꜱꜱ'),
    para('📝 /report — ꜱᴇɴᴅ ᴀ ꜱᴛᴜᴅʏ ʀᴇᴘᴏʀᴛ ᴀɴʏᴛɪᴍᴇ'),
    para('⏰ /reminder — ꜱᴇᴛ ᴀ ᴛɪᴍᴇᴅ ʀᴇᴍɪɴᴅᴇʀ'),
    para('🔗 /hnc — ᴏᴘᴇɴꜱ ʜɪᴅᴅᴇɴ ɴᴇᴇᴛ ᴄᴏᴍᴍᴜɴɪᴛʏ ʟɪɴᴋꜱ ᴀɴᴅ ꜱᴛᴜᴅʏ ᴍᴀᴛᴇʀɪᴀʟ'),
    para('📚 /study — ᴛᴏ ᴏᴘᴇɴ ᴛʜɪꜱ ᴍᴇɴᴜ ᴀɴʏᴡʜᴇʀᴇ'),
    divider,
    row(trackerButton(message.chat)),
  ];
  const opts = { ...rp(message.message_id), skipEntities: false };
  if (message.message_thread_id) opts.message_thread_id = message.message_thread_id;
  try {
    await sendBlocks(message.chat.id, blocks, opts);
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    // Rich button refused (e.g. web_app unsupported in rich blocks): fall back to a plain link row.
    console.error('[study hub] rich send failed, retrying with url button:', e?.description || e);
    const fallback = blocks.slice(0, -1);
    fallback.push(row({
      text: 'Open biology tracker',
      url: `https://t.me/${BOT_USERNAME}?start=mini_tracker`,
      style: 'success',
    }));
    await sendBlocks(message.chat.id, fallback, opts);
  }
}


/** All-time study stats shown from Study ❄️ mode button */
export async function buildStudyStatsBlocks(user, fromWelcome = false) {
  const { db } = await import('sdk');
  const { sql } = await import('sdk/db');
  const { getStudyCoins } = await import('../economy.js');
  const uid = user.id;

  // Aggregate chapter progress
  let revised = 0, practiced = 0, pyqs = 0, completedChapters = 0;
  try {
    const rows = await db.all(sql`
      SELECT revision_done AS rd, practice_done AS pd, pyq_done AS qd
      FROM biology_tracker WHERE user_id = ${uid}
    `);
    for (const r of (rows || [])) {
      if (r.rd) revised++;
      if (r.pd) practiced++;
      if (r.qd) pyqs++;
      if (r.rd && r.pd && r.qd) completedChapters++;
    }
  } catch (_) {}

  // Completed todos (all-time closed with completed=1)
  let completedTodos = 0;
  try {
    const t = await db.get(sql`
      SELECT COUNT(*) AS n FROM study_todos
      WHERE user_id = ${uid} AND status = 'closed' AND completed = 1
    `);
    completedTodos = t ? Number(t.n) : 0;
  } catch (_) {}

  let studyCoins = 0;
  try { studyCoins = await getStudyCoins(uid); } catch (_) {}

  let studyRank = '';
  if (studyCoins > 0) {
    try {
      const r = await db.get(sql`
        SELECT COUNT(*) AS n FROM users
        WHERE COALESCE(study_coins, 0) > ${studyCoins}
      `);
      studyRank = `#${(r ? Number(r.n) : 0) + 1}`;
    } catch (_) {}
  }

  const orNone = (v) => (v ? String(v) : 'None');
  const revStr = orNone(revised > 0 ? revised : '');
  const pracStr = orNone(practiced > 0 ? practiced : '');
  const pyqStr = orNone(pyqs > 0 ? pyqs : '');
  const todoStr = orNone(completedTodos > 0 ? completedTodos : '');
  const coinStr = studyCoins > 0
    ? `${Number(studyCoins).toLocaleString('en-US')} 🍥${studyRank ? ` (${studyRank})` : ''}`
    : 'None';
  const chapStr = orNone(completedChapters > 0 ? completedChapters : '');
  const sfx = fromWelcome ? ':w' : '';

  return [
    para('🥷🏼: ', mention(user)),
    quoteText([
      `✦ ʀᴇᴠɪꜱᴇᴅ ᴄʜᴀᴘᴛᴇʀꜱ: ${revStr}`,
      `✦ ᴘʀᴀᴄᴛɪᴄᴇᴅ ᴄʜᴀᴘᴛᴇʀꜱ: ${pracStr}`,
      `✦ ᴘʏǫꜱ ᴄʜᴀᴘᴛᴇʀᴡɪꜱᴇ: ${pyqStr}`,
      `✦ ᴄᴏᴍᴘʟᴇᴛᴇᴅ ᴛᴏ-ᴅᴏ: ${todoStr}`,
      `✦ ᴄᴏɪɴꜱ ᴇᴀʀɴᴇᴅ ᴛʜʀᴏᴜɢʜ ꜱᴛᴜᴅʏ ᴍᴏᴅᴇ: ${coinStr}`,
      `✦ ᴄᴏᴍᴘʟᴇᴛᴇᴅ ᴄʜᴀᴘᴛᴇʀꜱ: ${chapStr} (ɪɴᴄʟᴜᴅɪɴɢ ʀᴇᴠɪꜱɪᴏɴ, ᴘʀᴀᴄᴛɪᴄᴇ & ᴘʏǫꜱ ᴀʟʟ ᴅᴏɴᴇ ᴘᴇʀ ᴄʜᴀᴘᴛᴇʀ)`,
    ].join('\n')),
    para('ᴜꜱᴇ: /study ᴛᴏ ᴏᴘᴇɴ ꜱᴛᴜᴅʏ ʜᴜʙ.'),
    row({ text: '← Back', callback_data: `hp:home${sfx}`, style: 'danger' }),
  ];
}
