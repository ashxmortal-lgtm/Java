import { BotApiError } from 'sdk';
import { api } from '../message_api.js';
import { style } from '../texts.js';
import { MINI_APP_TRACKER_URL } from '../config.js';
import { sendBlocks, mention, head, para, divider, row, rp, SHEESH } from './common.js';

const BOT_USERNAME = 'exfrozen_bot';

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
    para('🔗 /hnc — ᴏᴘᴇɴꜱ ʜɪᴅᴅᴇɴ ɴᴇᴇᴛ ᴄᴏᴍᴍᴜɴɪᴛʏ ʟɪɴᴋꜱ ᴀɴᴅ ꜱᴛᴜᴅʏ ᴍᴀᴛᴇʀɪᴀʟ'),
    para('📚 /study — ᴛᴏ ᴏᴘᴇɴ ᴛʜɪꜱ ᴍᴇɴᴜ ᴀɴʏᴡʜᴇʀᴇ'),
    divider,
    SHEESH,
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
