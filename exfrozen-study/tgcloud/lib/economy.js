// ExFrozen study economy: independent balance fed ONLY by study rewards
// (study goals, todos, tracker chapter completion — same amounts as before).
// No gaming claim/purchase logic lives here.
import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { users } from '../schema.js';

// IST = UTC + 5:30, no daylight saving.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export function dayKey(offsetDays = 0) {
  return new Date(Date.now() + IST_OFFSET_MS + offsetDays * 86400000)
    .toISOString().slice(0, 10);
}
export const todayKey = () => dayKey(0);

export async function getBalance(telegramId) {
  const row = await db.select().from(users)
    .where(eq(users.telegramId, telegramId)).get();
  return row ? row.balance : 0;
}

/**
 * Adjust user balance by delta. Never goes below 0.
 * opts.study also mirrors the delta into study_coins (study-earnings total).
 */
export async function adjustBalance(telegramId, delta, opts = {}) {
  await db.run(sql`INSERT OR IGNORE INTO users (telegram_id, balance) VALUES (${telegramId}, 0)`);
  const before = await getBalance(telegramId);
  let applied = delta;
  if (delta < 0 && before + delta < 0) {
    applied = opts.allowPartial ? -before : 0;
  }
  if (applied === 0 && delta !== 0) return { before, after: before, applied: 0 };
  await db.run(sql`UPDATE users SET balance = balance + ${applied} WHERE telegram_id = ${telegramId}`);
  if (opts.study && applied !== 0) {
    await db.run(sql`UPDATE users SET study_coins = COALESCE(study_coins, 0) + ${applied} WHERE telegram_id = ${telegramId}`);
  }
  const after = await getBalance(telegramId);
  return { before, after, applied };
}

export async function getStudyCoins(telegramId) {
  const row = await db.get(sql`SELECT study_coins AS sc FROM users WHERE telegram_id = ${telegramId}`);
  return row && row.sc != null ? Number(row.sc) : 0;
}
