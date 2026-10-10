import { db } from 'sdk';
import { eq } from 'sdk/db';
import { inventory } from '../schema.js';
import { findItem, fmt } from './store.js';
import { getBalance } from './economy.js';

export async function inventoryText(userId) {
  const rows = await db.select().from(inventory)
    .where(eq(inventory.telegramId, userId)).all();
  const balance = await getBalance(userId);

  const list = (type) => {
    const items = rows.filter((r) => r.itemType === type);
    if (items.length === 0) return `✦ None`;
    return items.map((r) => {
      const it = findItem(r.itemName);
      return `✦ <code>${r.itemName}</code> ${it ? it.emoji : ''}`.trim();
    }).join('\n');
  };
  const chakra = rows.find((r) => r.itemType === 'chakra');

  return (
    `🎒 𝐈𝐍𝐕𝐄𝐍𝐓𝐎𝐑𝐘\n\n` +
    `⚔️ 𝐒𝐇𝐈𝐍𝐎𝐁𝐈\n\n${list('shinobi')}\n\n` +
    `🌀 𝐉𝐔𝐓𝐒𝐔\n\n${list('jutsu')}\n\n` +
    `⚡ 𝐂𝐇𝐀𝐊𝐑𝐀\n\n✦ chakra x ${fmt(chakra ? chakra.qty : 0)} ⚡\n\n` +
    `───────────────\n` +
    `Balance : ${fmt(balance)} 🍥`
  );
}
