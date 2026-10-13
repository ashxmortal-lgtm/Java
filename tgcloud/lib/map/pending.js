/**
 * Pending patrol rewards (map-started patrols claim at Hokage).
 */

import { db } from 'sdk';
import { sql } from 'sdk/db';

const now = () => Math.floor(Date.now() / 1000);

export async function addPendingPatrolReward(telegramId, shinobi, reward) {
  const t = now();
  // Upsert: stack reward if same shinobi still unclaimed
  const existing = await db.get(sql`
    SELECT reward FROM pending_patrol_rewards
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi} AND claimed = 0
  `);
  if (existing) {
    await db.run(sql`
      UPDATE pending_patrol_rewards
      SET reward = reward + ${reward}, completed_at = ${t}
      WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi} AND claimed = 0
    `);
  } else {
    await db.run(sql`
      INSERT INTO pending_patrol_rewards (telegram_id, shinobi, reward, completed_at, claimed)
      VALUES (${telegramId}, ${shinobi}, ${reward}, ${t}, 0)
    `);
  }
}

export async function listPendingPatrolRewards(telegramId) {
  return db.all(sql`
    SELECT shinobi, reward, completed_at
    FROM pending_patrol_rewards
    WHERE telegram_id = ${telegramId} AND claimed = 0
    ORDER BY completed_at
  `);
}

/**
 * Claim all pending. Returns { code: 'none'|'ok', total, details }.
 * Atomic: only unclaimed rows flip to claimed.
 */
export async function claimPendingPatrolRewards(telegramId) {
  const rows = await listPendingPatrolRewards(telegramId);
  if (!rows.length) return { code: 'none', total: 0, details: [] };

  let total = 0;
  const details = [];
  for (const r of rows) {
    const won = await db.run(sql`
      UPDATE pending_patrol_rewards
      SET claimed = 1
      WHERE telegram_id = ${telegramId} AND shinobi = ${r.shinobi} AND claimed = 0
    `);
    if (won.rowsAffected === 0) continue;
    total += r.reward;
    details.push({ shinobi: r.shinobi, reward: r.reward });
  }
  if (total <= 0) return { code: 'none', total: 0, details: [] };

  await db.run(sql`
    INSERT OR IGNORE INTO users (telegram_id, balance) VALUES (${telegramId}, 0)
  `);
  await db.run(sql`
    UPDATE users SET balance = balance + ${total} WHERE telegram_id = ${telegramId}
  `);
  return { code: 'ok', total, details };
}
