import { sendBlocks, mention, head, para, divider, row, btn, rp, SHEESH } from './common.js';

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
    divider,
    SHEESH,
    row(btn('🧬 Open Biology Tracker', 'tracker_home', 'primary')),
  ];
  await sendBlocks(message.chat.id, blocks, { ...rp(message.message_id), skipEntities: false });
}
