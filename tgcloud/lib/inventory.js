import { db, BotApiError } from 'sdk';
import { api } from './message_api.js';
import { eq } from 'sdk/db';
import { users, inventory } from '../schema.js';

const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
const head = (text) => ({ type: 'heading', text, size: 2 });
const divider = { type: 'divider' };
const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });
const cb = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
const rich = (blocks) => ({ blocks });
const mention = (u) => ({
  type: 'text_mention',
  text: (u && (u.first_name || u.firstName)) || 'User',
  user: {
    id: u.id || u.telegramId,
    is_bot: false,
    first_name: (u && (u.first_name || u.firstName)) || 'User',
    last_name: u && u.last_name,
    username: u && u.username,
  },
});

const JUTSU_HINTS = ['jutsu', 'mind transmission', 'byakugan', 'rasengan', 'chidori'];

function isJutsu(item) {
  const n = String(item.itemName || '').toLowerCase();
  const t = String(item.itemType || '').toLowerCase();
  if (t === 'jutsu') return true;
  return JUTSU_HINTS.some((h) => n.includes(h));
}

function isShinobi(item) {
  const t = String(item.itemType || '').toLowerCase();
  if (t === 'shinobi' || t === 'character') return true;
  if (isJutsu(item)) return false;
  if (t === 'gift') return false;
  // default non-gift non-jutsu counts as shinobi/item on main screen
  return t !== 'gift';
}

function quoteLines(lines) {
  return {
    type: 'blockquote',
    blocks: lines.map((l) => para(l)),
  };
}

export async function buildInventoryBlocks(user) {
  const uid = user.id || user.telegramId;
  const rowU = await db.select().from(users).where(eq(users.telegramId, uid)).get();
  const items = await db.select().from(inventory).where(eq(inventory.telegramId, uid)).all();

  const shinobi = items.filter((i) => isShinobi(i) && !isJutsu(i));
  const chakra = rowU?.chakra ?? 0;
  const balance = rowU?.balance ?? 0;

  const shinobiLines = shinobi.length
    ? shinobi.map((s) => {
        const q = s.qty && s.qty > 1 ? ` x ${s.qty}` : '';
        return `❯ ${s.itemName}${q}`;
      })
    : ['❯ (empty)'];

  return [
    para(mention(user), "'s INVENTORY"),
    head('⚔️ SHINOBI'),
    quoteLines(shinobiLines),
    para(`⚡ CHAKRA: ${Number(chakra).toLocaleString('en-US')}`),
    para(`🍥 BALANCE: ${Number(balance).toLocaleString('en-US')}`),
    row(cb('🌀 Jutsu', 'inv:jutsu', 'primary')),
  ];
}

export async function buildJutsuBlocks(user) {
  const uid = user.id || user.telegramId;
  const items = await db.select().from(inventory).where(eq(inventory.telegramId, uid)).all();
  const jutsu = items.filter(isJutsu);
  const lines = jutsu.length
    ? jutsu.map((j) => {
        const q = j.qty && j.qty > 1 ? ` x ${j.qty}` : '';
        return `❯ ${j.itemName}${q}`;
      })
    : ['❯ No jutsu unlocked yet'];

  return [
    para(mention(user), "'s JUTSU"),
    quoteLines(lines),
    row(cb('◂ Back to Inventory', 'inv:home', 'primary')),
  ];
}

/** Plain text fallback (old inventoryText API) */
export async function inventoryText(userId) {
  const rowU = await db.select().from(users).where(eq(users.telegramId, userId)).get();
  const items = await db.select().from(inventory).where(eq(inventory.telegramId, userId)).all();
  const shinobi = items.filter((i) => isShinobi(i) && !isJutsu(i));
  const lines = shinobi.length
    ? shinobi.map((s) => `❯ ${s.itemName}${s.qty > 1 ? ` x ${s.qty}` : ''}`)
    : ['❯ (empty)'];
  return (
    `INVENTORY\n\n⚔️ SHINOBI\n${lines.join('\n')}\n\n` +
    `⚡ CHAKRA: ${rowU?.chakra ?? 0}\n🍥 BALANCE: ${rowU?.balance ?? 0}`
  );
}

export async function sendInventory(chatId, user) {
  const blocks = await buildInventoryBlocks(user);
  try {
    await api.sendRichMessage({ chat_id: chatId, rich_message: rich(blocks) });
  } catch (e) {
    console.error('inventory rich failed:', e?.description || e);
    await api.sendMessage({
      chat_id: chatId,
      text: await inventoryText(user.id),
      reply_markup: {
        inline_keyboard: [[{ text: '🌀 Jutsu', callback_data: 'inv:jutsu' }]],
      },
    });
  }
}

export async function handleInventoryCallback(cq) {
  const data = cq.data || '';
  if (!data.startsWith('inv:')) return false;
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  if (!cq.message) return true;
  try {
    const blocks = data === 'inv:jutsu'
      ? await buildJutsuBlocks(cq.from)
      : await buildInventoryBlocks(cq.from);
    await api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      rich_message: rich(blocks),
    });
  } catch (e) {
    console.error('inv callback failed:', e?.description || e);
  }
  return true;
}
