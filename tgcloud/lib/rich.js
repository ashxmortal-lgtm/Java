import { BotApiError } from 'sdk';
import { api } from './message_api.js';
import { style, escapeHtml } from './texts.js';
import { SHINOBI, JUTSU, CHAKRA_RATE, boldNum } from './store.js';
import { ROWS } from './ability.js';
import { OWNER_ID } from './admin.js';
import { send, sendRich } from './chat.js';

// ---- block shapes (the only place to fix if Telegram rejects one) ----
const S = (t) => style(t);
export const P = (t) => ({ type: 'paragraph', text: typeof t === 'string' ? S(t) : t });
export const quote = (t) => ({ type: 'blockquote', blocks: String(t).split('\n').map((l) => P(l)) });
export const table = (rows) => ({
  type: 'table', is_bordered: true, is_compact: true,
  cells: rows.map((r) => r.map((c) => ({ text: S(c) }))),
});
const code = (t) => ({ type: 'code', text: t });
const mentionNode = (u) => ({
  type: 'text_mention', text: u.first_name || 'User',
  user: { id: u.id, first_name: u.first_name || 'User' },
});
// A row of buttons. Each button: callback_data OR url.
export const btn = (label, extra) => ({ text: S(label), ...extra });
export const row = (...buttons) => ({ type: 'buttons', align: 'center', buttons });

// Mention paragraph always comes first.
const build = (user, content) => [P([mentionNode(user)]), ...content];

async function debug(user, e) {
  console.error(e);
  if (user.id !== OWNER_ID) return;
  try {
    await send(user.id, {
      text: `rich failed: <code>${escapeHtml(String(e.description || e.message).slice(0, 300))}</code>`,
      parse_mode: 'HTML',
    });
  } catch (_) { /* ignore */ }
}

// Send rich; on Telegram refusal run the classic sender instead.
export async function richOr(chatId, user, content, classic) {
  try {
    return await sendRich(chatId, { rich_message: { blocks: build(user, content) } });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    await debug(user, e);
    return classic();
  }
}

// Edit the same message as rich; on refusal run the classic edit.
export async function editRichOr(msg, user, content, classic) {
  try {
    await api.editMessageText({
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      rich_message: { blocks: build(user, content) },
    });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    if (/not modified/i.test(String(e.description || ''))) return;
    await debug(user, e);
    await classic();
  }
}

// ---- screens ----
const item = (i) => P([S('✦ '), code(i.name), S(` ${i.emoji} : `), `${boldNum(i.price)} 🍥`]);
const footer = () => [
  P('───────────────'),
  P('🛒 /buy [item name]'),
  P('tap an item name to copy it.'),
];

export function storeContent(screen, ownerId) {
  const cb = (s) => ({ callback_data: `store:${s}:${ownerId}` });
  if (screen === 'jutsu') {
    return [P('🌀 𝐉𝐔𝐓𝐒𝐔'), ...JUTSU.map(item), ...footer(), row(btn('Back', cb('main')))];
  }
  if (screen === 'chakra') {
    return [
      P('⚡ 𝐂𝐇𝐀𝐊𝐑𝐀'),
      P([S('✦ '), code('Chakra'), ` × 100 : ${boldNum(100 * CHAKRA_RATE)} 🍥`]),
      ...footer(), row(btn('Back', cb('main'))),
    ];
  }
  return [
    P('🏯 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐒𝐓𝐎𝐑𝐄'),
    P('ʀᴇᴄʀᴜɪᴛ ʏᴏᴜʀ ɴᴇxᴛ ꜱʜɪɴᴏʙɪ'),
    P('⚔️ 𝐒𝐇𝐈𝐍𝐎𝐁𝐈'),
    ...SHINOBI.map(item),
    ...footer(),
    row(btn('Jutsu', cb('jutsu')), btn('Chakra', cb('chakra'))),
  ];
}

export function abilityContent(ownerId) {
  return [
    P('📖 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐀𝐁𝐈𝐋𝐈𝐓𝐈𝐄𝐒'),
    table([['Shinobi', 'Ability'], ...ROWS]),
    P('─────────────────⟢'),
    row(btn('Lvl Up', { callback_data: `lv:up:${ownerId}` })),
  ];
}

export function groupOnlyContent(cmd) {
  return [
    P('「𝐆𝐑𝐎𝐔𝐏 𝐂𝐎𝐌𝐌𝐀𝐍𝐃」'),
    P(`/${cmd} works in groups only.`),
    P('» use it in a group where i am a member.'),
    row(btn('Add to grp', { url: 'tg://resolve?domain=exfrozen_bot&startgroup=true', style: 'danger' })),
  ];
}
