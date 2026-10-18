import { BotApiError } from 'sdk';
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { api } from './message_api.js';
import { style, escapeHtml } from './texts.js';
import { SHINOBI, JUTSU, CHAKRA_RATE, boldNum, fmt } from './store.js';
import { OWNER_ID } from './admin.js';
import { send, sendRich } from './chat.js';
import { ownedSet, getEquipped, getAllShinobiState } from './rpg/state.js';

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

// Short skill notes — only skills already defined in the game.
const SKILL_NOTES = {
  Sasuke: 'mission specialist',
  Sakura: 'boost on /claim · patrol only · healing at Lv. 4',
  Naruto: '×3 patrol/mission rewards · shadow clone',
  Itachi: 'kill & rob · cannot patrol/mission',
  Hinata: '/byakugan — reveals protection time',
};

/**
 * Shinobi Store with live balance, ownership markers, levels and
 * Buy / Owned / Equip buttons. Async — callers must await it.
 */
export async function storeContent(screen, ownerId) {
  const cb = (s) => ({ callback_data: `store:${s}:${ownerId}` });
  if (screen === 'jutsu') {
    return [
      P('🌀 𝐉𝐔𝐓𝐒𝐔'), jutsuQuote(), ...footer(), row(btn('Back', cb('main'))),
    ];
  }
  if (screen === 'chakra') {
    return [
      P('⚡ 𝐂𝐇𝐀𝐊𝐑𝐀'),
      quote(`✦ Chakra × 100 : ${boldNum(100 * CHAKRA_RATE)} 🍥`),
      ...footer(), row(btn('Back', cb('main'))),
    ];
  }

  const balRow = await db.get(sql`SELECT balance FROM users WHERE telegram_id = ${ownerId}`);
  const balance = balRow ? balRow.balance : 0;
  const own = await ownedSet(ownerId);
  const equipped = await getEquipped(ownerId);
  const states = await getAllShinobiState(ownerId);

  const lines = [];
  const buttons = [];
  for (const i of SHINOBI) {
    const isOwned = own.has(i.name);
    const isEquipped = equipped === i.name;
    const lv = (states[i.name] && states[i.name].level) || 1;
    lines.push(
      `✦ <b>${escapeHtml(i.name)}</b> ${i.emoji} : ${boldNum(i.price)} 🍥`
      + ` · Lv. ${lv}`
      + (isEquipped ? ' · 👤 equipped' : isOwned ? ' · ✅ owned' : ''),
    );
    if (SKILL_NOTES[i.name]) lines.push(`   <i>${escapeHtml(SKILL_NOTES[i.name])}</i>`);
    const rowBtns = [];
    if (!isOwned) {
      rowBtns.push(btn(`Buy ${i.name} (${boldNum(i.price)} 🍥)`, { callback_data: `sb:${i.name}:${ownerId}` }));
    } else if (!isEquipped) {
      rowBtns.push(btn(`Equip ${i.name}`, { callback_data: `seq:${i.name}:${ownerId}` }));
    } else {
      rowBtns.push(btn(`Equipped ✓`, { callback_data: `seq:${i.name}:${ownerId}` }));
    }
    buttons.push(rowBtns);
  }

  return [
    P('🏯 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐒𝐓𝐎𝐑𝐄'),
    P('ʀᴇᴄʀᴜɪᴛ ʏᴏᴜʀ ɴᴇxᴛ ꜱʜɪɴᴏʙɪ'),
    P(`🍥 Balance: ${fmt(balance)}`),
    P('⚔️ 𝐒𝐇𝐈𝐍𝐎𝐁𝐈'),
    quote(lines.join('\n')),
    ...buttons.map((b) => row(...b)),
    ...footer(),
    row(btn('Jutsu', cb('jutsu')), btn('Chakra', cb('chakra'))),
  ];
}

function shinobiQuote() {
  return quote(SHINOBI.map((i) => `✦ ${i.name} ${i.emoji} : ${boldNum(i.price)} 🍥`).join('\n'));
}
function jutsuQuote() {
  return quote(JUTSU.map((i) => `✦ ${i.name} ${i.emoji} : ${boldNum(i.price)} 🍥`).join('\n'));
}

export function abilityContent(_ownerId, opts = {}) {
  const buttons = [
    row(btn('Check ❄️ abilities', { url: 'https://t.me/frozenblooded/27', style: 'success' })),
  ];
  if (opts.fromMap) {
    buttons.push(row(btn('Back', { callback_data: `map_home:${_ownerId}`, style: 'danger' })));
  }
  return [
    P('Clicked on button below to check abilities of all shinobis.'),
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
