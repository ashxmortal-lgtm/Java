import { BotApiError } from 'sdk';
import { api } from './message_api.js';
import { frozenBloodedRow } from './universal_buttons.js';

const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
// Telegram's documented centered-text block is pullquote (RichBlockPullQuotation).
const para = (...text) => ({ type: 'pullquote', text: text.length === 1 ? text[0] : text });
const head = (text, size = 2) => ({ type: 'heading', text, size });
const cb = (text, callback_data, style = 'primary') => ({ text, callback_data, style });
const link = (text, url) => ({ type: 'url', text, url });

const VALID_PATHS = new Set([
  'home',
  'home.study',
  'home.links',
  'home.study.books',
  'home.study.notes',
]);

const LEGACY_PATHS = {
  home: ['home'],
  study: ['home', 'study'],
  links: ['home', 'links'],
  books: ['home', 'study', 'books'],
  notes: ['home', 'study', 'notes'],
};

const STUDY_CHANNEL = 'https://t.me/+o_5e9GYDQDYwMzRl';
const BOOK_LINKS = [
  ['✦ 𝐏𝐘𝐐 𝐁𝐎𝐎𝐊𝐒', 'https://t.me/c/4471291233/243'],
  ['✦ 𝐌𝐎𝐃𝐔𝐋𝐄', 'https://t.me/c/4471291233/152'],
  ['✦ 𝐎𝐓𝐇𝐄𝐑 𝐁𝐎𝐎𝐊𝐒', 'https://t.me/c/4471291233/368'],
];
const NOTE_LINKS = [
  ['11ᴛʜ ʙɪᴏ sɴ ❄️', 'https://t.me/c/2994306672/735'],
  ['12ᴛʜ ʙɪᴏ sɴ ❄️', 'https://t.me/c/2994306672/752'],
  ['ᴄʜᴇᴍɪsᴛʀʏ sɴ [11+12ᴛʜ] ❄️', 'https://t.me/c/2994306672/778'],
  ['11ᴛʜ ᴘʜʏsɪᴄs sɴ ❄️', 'https://t.me/c/2994306672/823'],
  ['12ᴛʜ ᴘʜʏsɪᴄs sɴ ❄️', 'https://t.me/c/2994306672/824'],
];
const GROUP_LINKS = [
  ['ꜱᴛᴜᴅʏ ᴍᴀᴛᴇʀɪᴀʟ', 'https://t.me/+Dkf7sqGgUWY0MTU1', '📚', 'Short notes, updates, tricks & useful PDFs'],
  ['ᴅɪꜱᴄᴜꜱꜱɪᴏɴ ɢʀᴘ', 'https://t.me/+ChxNR6ShlzRjMjA1', '💬', 'Quizzes, doubts & support'],
  ['ɴᴇᴇᴛ ʟɪʙʀᴀʀʏ', 'https://t.me/+lxR4mMxK-1s4MGJl', '🎓', 'Book PDFs'],
  ['ᴛᴏ-ᴅᴏ ꜱʜᴀʀɪɴɢ ɢʀᴘ', 'https://t.me/+hRDedaMqU2liNmM1', '📝', ''],
  ['ʏᴘᴛ ᴀᴘᴘ ɢʀᴘ', 'https://link.yeolpumta.com/P3R5cGU9Z3JvdXBJbnZpdGUmaWQ9NjE3OTA4Mw==', '📱', ''],
  ['ʏᴀᴘᴘɪɴɢ ɢʀᴘ', 'https://t.me/+mlp94tMHi29jMmFl', '🗯️', 'Off-topic bakchodi, fun & games'],
  ['ɴᴇᴇᴛ 𝐐𝐔𝐈𝐙', 'https://t.me/The_Migrator_Quizzes', '❓', ''],
  ['ɴᴇᴇᴛ 𝐌𝐂𝐐ꜱ', 'https://t.me/konoha_quizzes', '🧠', 'Conceptual NEET polls'],
];

function mention(user) {
  if (!user?.id) return 'User';
  return {
    type: 'text_mention',
    text: user.first_name || 'User',
    user: {
      id: user.id,
      is_bot: !!user.is_bot,
      first_name: user.first_name || 'User',
      ...(user.last_name ? { last_name: user.last_name } : {}),
      ...(user.username ? { username: user.username } : {}),
    },
  };
}

function navData(path, nextScreen) {
  return `hnc:nav:${[...path, nextScreen].join('.')}`;
}

function footer(path) {
  return [
    // Keep this branded button solo on its own long, red row on every HNC screen.
    frozenBloodedRow(),
    row(
      cb('‹ ʙᴀᴄᴋ', `hnc:back:${path.join('.')}`),
      cb('ᴄʟᴏsᴇ ›', 'hnc:close'),
    ),
  ];
}

function contentFor(screen, user, path) {
  if (screen === 'study') {
    return [
      para('🏯 𝐒𝐓𝐔𝐃𝐘 𝐌𝐀𝐓𝐄𝐑𝐈𝐀𝐋'),
      para(link('🔒 𝐉𝐎𝐈𝐍 𝐓𝐇𝐈𝐒 𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐅𝐈𝐑𝐒𝐓', STUDY_CHANNEL)),
      para('ᴀғᴛᴇʀ ᴊᴏɪɴɪɴɢ, ʏᴏᴜ ᴄᴀɴ ᴏᴘᴇɴ ᴛʜᴇ ʀᴇsᴏᴜʀᴄᴇs ʙᴇʟᴏᴡ.'),
      row(
        cb('Book 📚 PDF', navData(path, 'books')),
        cb('short ❄️ notes', navData(path, 'notes')),
      ),
    ];
  }

  if (screen === 'books') {
    const blocks = [
      para('📚 𝐁𝐎𝐎𝐊 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒'),
      para('ᴄʜᴏᴏsᴇ ᴀ ᴄᴀᴛᴇɢᴏʀʏ ᴛᴏ ᴄᴏɴᴛɪɴᴜᴇ.'),
    ];
    for (const [title, url] of BOOK_LINKS) {
      blocks.push(para(title, '\n➜ ', link('𝐎𝐏𝐄𝐍 ❄️', url)));
    }
    return blocks;
  }

  if (screen === 'notes') {
    return [
      para('𝐒𝐇𝐎𝐑𝐓 𝐍𝐎𝐓𝐄𝐒 (𝐒𝐍)'),
      ...NOTE_LINKS.map(([label, url]) => para('✦ ', link(label, url))),
    ];
  }

  if (screen === 'links') {
    const blocks = [para('𝐀𝐋𝐋 𝐆𝐑❄️𝐔𝐏𝐒 & 𝐂𝐇𝐀𝐍𝐍𝐄𝐋𝐒')];
    for (const [label, url, emoji, description] of GROUP_LINKS) {
      blocks.push(para('✦ ', link(label, url), ` ${emoji}`));
      if (description) blocks.push(para(`(${description})`));
    }
    return blocks;
  }

  return [
    // Telegram heading size 1 is largest; its section-heading block has no align field.
    head(
      [
        '⛩️ ᴡᴇʟᴄᴏᴍᴇ ',
        mention(user),
        ' ᴛᴏ\nʏᴏᴜʀ ʜɴᴄ ɴᴀᴠɪɢᴀᴛɪᴏɴ ʜᴜʙ. 🍥',
      ],
      1,
    ),
    row(
      cb('📚 sᴛᴜᴅʏ ʀᴇsᴏᴜʀᴄᴇs', navData(path, 'study')),
      cb('🔗 ɢʀᴘ & ᴄʜɴʟ ʟɪɴᴋ', navData(path, 'links')),
    ),
    para('sᴇʟᴇᴄᴛ ᴀɴ ᴏᴘᴛɪᴏɴ ᴛᴏ ᴘʀᴏᴄᴇᴇᴅ.'),
  ];
}

function normalizePath(path) {
  const candidate = Array.isArray(path) ? path : ['home'];
  return VALID_PATHS.has(candidate.join('.')) ? candidate : ['home'];
}

export function buildHncMenu(user, path = ['home']) {
  const currentPath = normalizePath(path);
  const screen = currentPath[currentPath.length - 1];
  return [...contentFor(screen, user, currentPath), ...footer(currentPath)];
}

function routeFromCallback(data) {
  if (data.startsWith('hnc:nav:')) {
    const path = data.slice('hnc:nav:'.length).split('.');
    return VALID_PATHS.has(path.join('.')) ? path : null;
  }
  if (data.startsWith('hnc:back:')) {
    const path = data.slice('hnc:back:'.length).split('.');
    if (!VALID_PATHS.has(path.join('.'))) return null;
    return path.length > 1 ? path.slice(0, -1) : ['home'];
  }
  if (data.startsWith('hnc:')) return LEGACY_PATHS[data.slice('hnc:'.length)] || null;
  return null;
}

export async function handleHncCallback(cq) {
  const data = String(cq.data || '');
  if (!data.startsWith('hnc:')) return false;

  await api.answerCallbackQuery({ callback_query_id: cq.id });
  if (!cq.message) return true;

  if (data === 'hnc:close') {
    try {
      await api.deleteMessage({
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
      });
    } catch (e) {
      if (!(e instanceof BotApiError)) console.error('[hnc close]', e);
    }
    return true;
  }

  const path = routeFromCallback(data);
  if (!path) return true;

  try {
    await api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      rich_message: {
        blocks: buildHncMenu(cq.from, path),
        skip_entity_detection: true,
      },
    });
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400 && /not modified/i.test(String(e.description || '')))) {
      console.error('[hnc menu edit]', e?.description || e);
    }
  }
  return true;
}
