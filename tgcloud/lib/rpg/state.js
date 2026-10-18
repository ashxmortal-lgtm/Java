/**
 * Persistent shinobi/user RPG state — the only place that touches
 * shinobi_state, user_skills, rpg_tx and users.equipped.
 * Everything is timestamp-based (restart-safe); no in-memory timers.
 */

import { db } from 'sdk';
import { sql } from 'sdk/db';
import {
  PATROLS_BEFORE_EXHAUSTION,
  EXHAUSTION_RECOVERY_SEC,
  DEATH_DURATION_SEC,
} from './levels.js';

const now = () => Math.floor(Date.now() / 1000);

// ---- rpg_tx: at-most-once effects ----

/** Returns true (and records the key) only for the first caller of `key`. */
export async function once(key) {
  try {
    const r = await db.run(
      sql`INSERT OR IGNORE INTO rpg_tx (key, created_at) VALUES (${key}, ${now()})`,
    );
    return r.rowsAffected > 0;
  } catch (e) {
    console.error('[rpg once]', e);
    return false;
  }
}

// ---- shinobi_state ----

export async function ensureShinobiState(telegramId, shinobi) {
  await db.run(sql`
    INSERT OR IGNORE INTO shinobi_state (telegram_id, shinobi)
    VALUES (${telegramId}, ${shinobi})
  `);
}

export async function getShinobiState(telegramId, shinobi) {
  await ensureShinobiState(telegramId, shinobi);
  return db.get(sql`
    SELECT level, patrol_streak AS patrolStreak, exhausted_until AS exhaustedUntil,
           dead_until AS deadUntil, last_robbed_at AS lastRobbedAt,
           train_sessions AS trainSessions, next_train_at AS nextTrainAt
    FROM shinobi_state
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
}

export async function getAllShinobiState(telegramId) {
  const rows = await db.all(sql`
    SELECT shinobi, level, patrol_streak AS patrolStreak, exhausted_until AS exhaustedUntil,
           dead_until AS deadUntil, last_robbed_at AS lastRobbedAt,
           train_sessions AS trainSessions, next_train_at AS nextTrainAt
    FROM shinobi_state WHERE telegram_id = ${telegramId}
  `);
  return Object.fromEntries((rows || []).map((r) => [r.shinobi, r]));
}

export function isDead(state, t = now()) {
  return !!state && (state.deadUntil || 0) > t;
}
export function isExhausted(state, t = now()) {
  return !!state && (state.exhaustedUntil || 0) > t;
}

/** Mark dead for a 24h death cycle. Returns { ok, until }; ok=false when
 * the shinobi was already marked dead by a concurrent kill. */
export async function markDead(telegramId, shinobi) {
  const until = now() + DEATH_DURATION_SEC;
  await ensureShinobiState(telegramId, shinobi);
  const r = await db.run(sql`
    UPDATE shinobi_state SET dead_until = ${until}
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi} AND dead_until <= ${now()}
  `);
  return { ok: r.rowsAffected > 0, until };
}

export async function revive(telegramId, shinobi) {
  await db.run(sql`
    UPDATE shinobi_state SET dead_until = 0
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
}

/**
 * Record one completed patrol. When the consecutive-patrol limit is reached,
 * start the exhaustion timer and reset the streak.
 * Returns { exhausted: bool, exhaustedUntil } — exhausted is true for the
 * patrol that triggered the exhaustion.
 */
export async function recordPatrolCompletion(telegramId, shinobi) {
  await ensureShinobiState(telegramId, shinobi);
  const t = now();
  const state = await getShinobiState(telegramId, shinobi);
  const streak = (state.patrolStreak || 0) + 1;
  if (streak >= PATROLS_BEFORE_EXHAUSTION) {
    const until = t + EXHAUSTION_RECOVERY_SEC;
    await db.run(sql`
      UPDATE shinobi_state
      SET patrol_streak = 0, exhausted_until = ${until}
      WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
    `);
    return { exhausted: true, exhaustedUntil: until };
  }
  await db.run(sql`
    UPDATE shinobi_state SET patrol_streak = ${streak}
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
  return { exhausted: false, exhaustedUntil: 0 };
}

/** A mission breaks the consecutive-patrol chain. */
export async function resetPatrolStreak(telegramId, shinobi) {
  await db.run(sql`
    UPDATE shinobi_state SET patrol_streak = 0
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
}

/** Instantly clear exhaustion (BBQ / Katsuyu). Does not touch other timers. */
export async function clearExhaustion(telegramId, shinobi) {
  await db.run(sql`
    UPDATE shinobi_state SET exhausted_until = 0, patrol_streak = 0
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
  `);
}

// ---- user_skills ----

export async function getUserSkills(telegramId) {
  await db.run(sql`INSERT OR IGNORE INTO user_skills (telegram_id) VALUES (${telegramId})`);
  return db.get(sql`
    SELECT protected_until AS protectedUntil,
           sakura_heal_at AS sakuraHealAt, sakura_heal_uses AS sakuraHealUses,
           katsuyu_heal_at AS katsuyuHealAt, byakugan_at AS byakuganAt
    FROM user_skills WHERE telegram_id = ${telegramId}
  `);
}

export async function setUserSkills(telegramId, fields) {
  await getUserSkills(telegramId);
  const map = {
    protectedUntil: 'protected_until',
    sakuraHealAt: 'sakura_heal_at',
    sakuraHealUses: 'sakura_heal_uses',
    katsuyuHealAt: 'katsuyu_heal_at',
    byakuganAt: 'byakugan_at',
  };
  for (const [k, v] of Object.entries(fields)) {
    const col = map[k];
    if (!col || !Number.isFinite(Number(v))) continue;
    await db.run(sql`UPDATE user_skills SET ${sql.raw(col)} = ${Math.floor(v)} WHERE telegram_id = ${telegramId}`);
  }
}

/** Jiraiya protection: 24h, never refreshed while still active. Guarded flip. */
export async function activateProtection(telegramId) {
  const t = now();
  const s = await getUserSkills(telegramId);
  if ((s.protectedUntil || 0) > t) {
    return { ok: false, protectedUntil: s.protectedUntil };
  }
  const until = t + 24 * 3600;
  const won = await db.run(sql`
    UPDATE user_skills SET protected_until = ${until}
    WHERE telegram_id = ${telegramId} AND protected_until <= ${t}
  `);
  if (won.rowsAffected === 0) {
    const s2 = await getUserSkills(telegramId);
    return { ok: false, protectedUntil: s2.protectedUntil };
  }
  return { ok: true, protectedUntil: until };
}

export async function isProtected(telegramId, t = now()) {
  const s = await getUserSkills(telegramId);
  return (s.protectedUntil || 0) > t;
}

// ---- equipped character ----

export async function getEquipped(telegramId) {
  const u = await db.get(sql`SELECT equipped FROM users WHERE telegram_id = ${telegramId}`);
  return (u && u.equipped) || 'Starter Shinobi';
}

export async function setEquipped(telegramId, shinobi) {
  await db.run(sql`UPDATE users SET equipped = ${shinobi} WHERE telegram_id = ${telegramId}`);
}

// ---- ownership helpers ----

export async function ownedSet(telegramId) {
  const rows = await db.all(sql`
    SELECT item_name FROM inventory
    WHERE telegram_id = ${telegramId} AND item_type = 'shinobi'
  `);
  return new Set((rows || []).map((r) => r.item_name));
}
