import { BotApiError } from 'sdk';
import { api } from './message_api.js';
import { style, escapeHtml } from './texts.js';
import { SHINOBI, JUTSU, CHAKRA_RATE, boldNum } from './store.js';
import { ROWS } from './ability.js';
import { OWNER_ID } from './admin.js';
import { send, sendRich } from './chat.js';

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
export const btn = (label, extra) => ({ text: S(label), ...extra });
export const row = (...buttons) => ({ type: 'buttons', align: 'center', buttons });

const build = (user, content) => [P([mentionNode(user)]), ...content];

async function debug(user, e) {
  console.error(e);
  if (user.id !== OWNER_ID) return;
  try {
    await send(user.id, {
      text: `rich failed: <code>${escapeHtml(String(e.description || e.message).slice(0, 300))}</code>`,
      parse_mode: 'HTML',
    });
  } catch (_) {}
}

export async function richOr(chatId, user, content, classic) {
  try {
    return await sendRich(chatId, { rich_message: { blocks: build(user, content) } });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    await debug(user, e);
    return classic();
  }
}

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

const footer = () => [
  P('───────────────'),
  P('🛒 /buy [item name]'),
  P('tap an item name to copy it.'),
];

/**
 * Shinobi store — compact 2-col table (Shinobi | Price).
 * @param {string} screen
 * @param {number} ownerId
 * @param {{ fromMap?: boolean }} [opts]
 */
export function storeContent(screen, ownerId, opts = {}) {
  const fromMap = !!opts.fromMap;
  const storeCb = (s) => ({ callback_data: `store:${s}:${ownerId}` });
  const mapCb = (s) => ({ callback_data: `map_store:${s}:${ownerId}` });
  const cb = fromMap ? mapCb : storeCb;

  const shinobiTable = table([
    ['Shinobi', 'Price'],
    ...SHINOBI.map((i) => [`${i.emoji} ${i.name}`, `${boldNum(i.price)} 🍥`]),
  ]);
  const jutsuTable = table([
    ['Jutsu', 'Price'],
    ...JUTSU.map((i) => [`${i.emoji} ${i.name}`, `${boldNum(i.price)} 🍥`]),
  ]);

  if (screen === 'jutsu') {
    const buttons = [row(btn('Back', cb('main')))];
    if (fromMap) buttons.push(row(btn('◂ Back to Map', { callback_data: `map_home:${ownerId}` })));
    return [P('🌀 𝐉𝐔𝐓𝐒𝐔'), jutsuTable, ...footer(), ...buttons];
  }
  if (screen === 'chakra') {
    const buttons = [row(btn('Back', cb('main')))];
    if (fromMap) buttons.push(row(btn('◂ Back to Map', { callback_data: `map_home:${ownerId}` })));
    return [
      P('⚡ 𝐂𝐇𝐀𝐊𝐑𝐀'),
      table([['Item', 'Price'], ['Chakra × 100', `${boldNum(100 * CHAKRA_RATE)} 🍥`]]),
      ...footer(),
      ...buttons,
    ];
  }

  const abilityCb = fromMap
    ? { callback_data: `map_ability:${ownerId}` }
    : { callback_data: `lv:ab:${ownerId}` };
  const buttons = [
    row(btn('Jutsu', cb('jutsu')), btn('Chakra', cb('chakra'))),
    row(btn('Shinobi Abilities', abilityCb)),
  ];
  if (fromMap) {
    buttons.push(row(btn('◂ Back to Map', { callback_data: `map_home:${ownerId}` })));
  }
  return [
    P('🏯 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐒𝐓𝐎𝐑𝐄'),
    P('ʀᴇᴄʀᴜɪᴛ ʏᴏᴜʀ ɴᴇxᴛ ꜱʜɪɴᴏʙɪ'),
    shinobiTable,
    ...footer(),
    ...buttons,
  ];
}

/**
 * Ability screen. fromMap adds Back to Map; manual /ability does not.
 * @param {number} ownerId
 * @param {{ fromMap?: boolean }} [opts]
 */
export function abilityContent(ownerId, opts = {}) {
  const fromMap = !!opts.fromMap;
  const buttons = [row(btn('Lvl Up', { callback_data: `lv:up:${ownerId}` }))];
  if (fromMap) {
    buttons.push(row(btn('◂ Back to Map', { callback_data: `map_home:${ownerId}` })));
  }
  return [
    P('📖 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐀𝐁𝐈𝐋𝐈𝐓𝐈𝐄𝐒'),
    table([['Shinobi', 'Ability'], ...ROWS]),
    P('─────────────────⟢'),
    ...buttons,
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
