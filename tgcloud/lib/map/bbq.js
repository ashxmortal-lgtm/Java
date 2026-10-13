/**
 * BBQ chakra recovery — catch-up on open / sweep (no background loop).
 */

import { db } from 'sdk';
import { sql } from 'sdk/db';
import {
  BBQ_RECOVERY_INTERVAL_SEC,
  BBQ_RECOVERY_AMOUNT,
  MAX_CHAKRA,
} from './constants.js';

const now = () => Math.floor(Date.now() / 1000);

async function chakraQty(id) {
  const r = await db.get(
    sql`SELECT qty FROM inventory WHERE telegram_id = ${id} AND item_name = 'Chakra'`,
  );
  return r ? r.qty : 0;
}

async function addChakra(id, amount) {
  if (amount <= 0) return;
  await db.run(sql`
    INSERT INTO inventory (telegram_id, item_type, item_name, qty)
    VALUES (${id}, 'chakra', 'Chakra', ${amount})
    ON CONFLICT(telegram_id, item_name) DO UPDATE SET qty = qty + ${amount}
  `);
  // Cap at MAX_CHAKRA
  const q = await chakraQty(id);
  if (q > MAX_CHAKRA) {
    await db.run(sql`
      UPDATE inventory SET qty = ${MAX_CHAKRA}
      WHERE telegram_id = ${id} AND item_name = 'Chakra'
    `);
  }
}

export async function listBbqSessions(telegramId) {
  return db.all(sql`
    SELECT shinobi, bbq_start, last_recovery_at
    FROM bbq_sessions WHERE telegram_id = ${telegramId}
  `);
}

export async function isAtBbq(telegramId, shinobi) {
  const r = await db.get(sql`
    SELECT 1 FROM bbq_sessions
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
  return !!r;
}

export async function startBbq(telegramId, shinobi) {
  const t = now();
  // Block if on mission/patrol
  const act = await db.get(sql`
    SELECT status FROM activities
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
  if (act && act.status === 'active') return { code: 'busy' };

  await db.run(sql`
    INSERT INTO bbq_sessions (telegram_id, shinobi, bbq_start, last_recovery_at)
    VALUES (${telegramId}, ${shinobi}, ${t}, ${t})
    ON CONFLICT(telegram_id, shinobi) DO UPDATE SET
      bbq_start = excluded.bbq_start,
      last_recovery_at = excluded.last_recovery_at
  `);
  return { code: 'ok' };
}

export async function stopBbq(telegramId, shinobi) {
  await db.run(sql`
    DELETE FROM bbq_sessions
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
  return { code: 'ok' };
}

/**
 * Apply offline catch-up recovery for one user (or all if telegramId omitted).
 * Returns total chakra granted this call.
 */
export async function applyBbqRecovery(telegramId = null) {
  const t = now();
  const rows = telegramId
    ? await db.all(sql`
        SELECT telegram_id, shinobi, last_recovery_at
        FROM bbq_sessions WHERE telegram_id = ${telegramId}
      `)
    : await db.all(sql`
        SELECT telegram_id, shinobi, last_recovery_at FROM bbq_sessions LIMIT 50
      `);

  let granted = 0;
  for (const row of rows) {
    const last = row.last_recovery_at || t;
    const ticks = Math.floor((t - last) / BBQ_RECOVERY_INTERVAL_SEC);
    if (ticks <= 0) continue;
    const amount = ticks * BBQ_RECOVERY_AMOUNT;
    const before = await chakraQty(row.telegram_id);
    const room = Math.max(0, MAX_CHAKRA - before);
    const give = Math.min(amount, room);
    if (give > 0) {
      await addChakra(row.telegram_id, give);
      granted += give;
    }
    const advanced = last + ticks * BBQ_RECOVERY_INTERVAL_SEC;
    await db.run(sql`
      UPDATE bbq_sessions SET last_recovery_at = ${advanced}
      WHERE telegram_id = ${row.telegram_id} AND shinobi = ${row.shinobi}
    `);
  }
  return granted;
}
