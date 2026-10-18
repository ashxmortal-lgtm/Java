/**
 * Training Ground — Tsunade trains Sakura, Jiraiya trains Naruto.
 * Sakura's Healing (lv 4 unlock) and Katsuyu's Healing (3 Sakura heals).
 * All cooldowns are persisted timestamps — restart-safe.
 */

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { dueText } from './time.js';
import {
  getShinobiState, getAllShinobiState, ensureShinobiState, isDead, revive,
  getUserSkills, setUserSkills, once, isExhausted,
} from './state.js';
import {
  nextTrainSlot, SAKURA_SESSIONS_PER_LEVEL, SAKURA_MAX_LEVEL, NARUTO_MAX_LEVEL,
  KATSUYU_UNLOCK_USES, KATSUYU_CHAKRA, KATSUYU_PROTECT_SEC,
} from './levels.js';

const now = () => Math.floor(Date.now() / 1000);

async function owned(telegramId) {
  const rows = await db.all(sql`
    SELECT item_name FROM inventory
    WHERE telegram_id = ${telegramId} AND item_type = 'shinobi'
  `);
  return new Set((rows || []).map((r) => r.item_name));
}

/**
 * One training session (one per shinobi per day).
 * trainer: 'Tsunade' (Sakura) or 'Jiraiya' (Naruto).
 */
export async function trainSession(telegramId, shinobi, trainer) {
  const own = await owned(telegramId);
  if (!own.has(shinobi)) return { code: 'not_owned', shinobi };
  if (!own.has(trainer)) return { code: 'no_trainer', trainer };

  await ensureShinobiState(telegramId, shinobi);
  const t = now();
  const st = await getShinobiState(telegramId, shinobi);
  if (isDead(st, t)) return { code: 'dead', shinobi, until: st.deadUntil };
  if (isExhausted(st, t)) return { code: 'exhausted', shinobi, until: st.exhaustedUntil };
  // Naruto & Jiraiya are away while a Tsunade search session is running.
  if (shinobi === 'Naruto' || shinobi === 'Jiraiya') {
    const s = await db.get(sql`SELECT status, ends_at FROM tsunade_search WHERE telegram_id = ${telegramId}`);
    if (s && s.status === 'active') return { code: 'searching', shinobi, until: s.ends_at };
  }
  if ((st.nextTrainAt || 0) > t) {
    return { code: 'cooldown', shinobi, until: st.nextTrainAt };
  }

  const next = nextTrainSlot(t);
  // Guarded claim: only the first request per day wins.
  const won = await db.run(sql`
    UPDATE shinobi_state SET train_sessions = train_sessions + 1, next_train_at = ${next}
    WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi} AND next_train_at <= ${t}
  `);
  if (won.rowsAffected === 0) {
    return { code: 'cooldown', shinobi, until: st.nextTrainAt };
  }

  const sessions = st.trainSessions + 1;
  let levelUp = null;
  if (shinobi === 'Sakura') {
    // Two successful sessions per level-up; level 4 is the cap.
    if (st.level < SAKURA_MAX_LEVEL && sessions % SAKURA_SESSIONS_PER_LEVEL === 0) {
      const lv = st.level + 1;
      await db.run(sql`
        UPDATE shinobi_state SET level = ${lv}
        WHERE telegram_id = ${telegramId} AND shinobi = 'Sakura'
      `);
      levelUp = lv;
    }
  }
  // Naruto: sessions are tracked; his level-up requirements are COMING SOON.
  return {
    code: 'ok', shinobi, trainer, sessions, nextTrainAt: next, levelUp,
    maxLevel: shinobi === 'Sakura' ? SAKURA_MAX_LEVEL : NARUTO_MAX_LEVEL,
  };
}

// ---- Sakura's Healing ----

export function sakuraHealUnlocked(sakuraLevel) {
  return sakuraLevel >= SAKURA_MAX_LEVEL;
}

export async function sakuraHealStatus(telegramId) {
  const st = await getShinobiState(telegramId, 'Sakura');
  const skills = await getUserSkills(telegramId);
  const t = now();
  return {
    owned: (await owned(telegramId)).has('Sakura'),
    level: st ? st.level : 1,
    dead: isDead(st, t),
    unlocked: sakuraHealUnlocked(st ? st.level : 1),
    cooldownUntil: skills.sakuraHealAt ? skills.sakuraHealAt + 24 * 3600 : 0,
    uses: skills.sakuraHealUses || 0,
    now: t,
  };
}

/** Revive dead Sakura. 24h cooldown, self-only, persists use count. */
export async function sakuraHeal(telegramId) {
  const s = await sakuraHealStatus(telegramId);
  if (!s.owned) return { code: 'not_owned' };
  if (!s.unlocked) return { code: 'locked', level: s.level };
  if (s.cooldownUntil > s.now) return { code: 'cooldown', until: s.cooldownUntil };
  if (!s.dead) return { code: 'not_dead' };

  const st = await getShinobiState(telegramId, 'Sakura');
  if (!isDead(st, now())) return { code: 'not_dead' }; // re-check after await
  const used = await once(`sakura_heal:${telegramId}:${st.deadUntil}`);
  if (!used) return { code: 'duplicate' };

  await revive(telegramId, 'Sakura');
  const uses = (await getUserSkills(telegramId)).sakuraHealUses + 1;
  await setUserSkills(telegramId, { sakuraHealAt: now(), sakuraHealUses: uses });
  return {
    code: 'ok', nextAt: now() + 24 * 3600, uses,
    katsuyuUnlocked: uses >= KATSUYU_UNLOCK_USES,
  };
}

// ---- Katsuyu's Healing ----

export async function katsuyuUnlocked(telegramId) {
  const s = await getUserSkills(telegramId);
  return (s.sakuraHealUses || 0) >= KATSUYU_UNLOCK_USES;
}

export async function katsuyuStatus(telegramId) {
  const skills = await getUserSkills(telegramId);
  const t = now();
  const cooldownUntil = skills.katsuyuHealAt ? skills.katsuyuHealAt + 24 * 3600 : 0;
  const stMap = await getAllShinobiState(telegramId);
  const equippedRow = await db.get(sql`SELECT equipped FROM users WHERE telegram_id = ${telegramId}`);
  const equipped = (equippedRow && equippedRow.equipped) || 'Starter Shinobi';
  const dead = Object.values(stMap).some((s) => isDead(s, t));
  return {
    unlocked: (skills.sakuraHealUses || 0) >= KATSUYU_UNLOCK_USES,
    cooldownUntil,
    dead, equipped,
    deadShinobi: Object.entries(stMap).filter(([, s]) => isDead(s, t)).map(([n]) => n),
    now: t,
  };
}

/**
 * Use Katsuyu's Healing: +200 chakra always; revives a dead equipped shinobi
 * (with 24h Katsuyu protection); alive users are eligible too.
 */
export async function katsuyuHeal(telegramId) {
  if (!(await katsuyuUnlocked(telegramId))) return { code: 'locked' };
  const s = await katsuyuStatus(telegramId);
  if (s.cooldownUntil > s.now) return { code: 'cooldown', until: s.cooldownUntil };

  const t = now();
  // Idempotency key = the cooldown mark; duplicates hit the cooldown anyway,
  // but the tx key also protects against two racing callbacks.
  const used = await once(`katsuyu_heal:${telegramId}:${t}`);
  if (!used) return { code: 'duplicate' };
  await setUserSkills(telegramId, { katsuyuHealAt: t });

  await db.run(sql`
    INSERT INTO inventory (telegram_id, item_type, item_name, qty)
    VALUES (${telegramId}, 'chakra', 'Chakra', ${KATSUYU_CHAKRA})
    ON CONFLICT(telegram_id, item_name) DO UPDATE SET qty = qty + ${KATSUYU_CHAKRA}
  `);

  let revived = null;
  let protectedUntil = 0;
  for (const name of s.deadShinobi) {
    const st = await getShinobiState(telegramId, name);
    if (!isDead(st, now())) continue;
    const ok = await once(`katsuyu_revive:${telegramId}:${name}:${st.deadUntil}`);
    if (!ok) continue;
    await revive(telegramId, name);
    protectedUntil = t + KATSUYU_PROTECT_SEC;
    revived = name;
  }
  if (revived) {
    const skills = await getUserSkills(telegramId);
    // Katsuyu protection extends only — never shortens an existing shield.
    await setUserSkills(telegramId, {
      protectedUntil: Math.max(skills.protectedUntil || 0, protectedUntil),
    });
  }
  return { code: 'ok', nextAt: t + 24 * 3600, revived, chakra: KATSUYU_CHAKRA, healKey: `${t}` };
}

/**
 * One timer restore per Katsuyu use (mission cooldown or exhaustion).
 * `healKey` ties the restore to the heal that paid for it.
 */
export async function katsuyuRestore(telegramId, kind, shinobi, healKey) {
  if (!(await once(`katsuyu_restore:${telegramId}:${healKey}`))) {
    return { code: 'duplicate' };
  }
  const t = now();
  if (kind === 'cooldown') {
    const r = await db.run(sql`
      UPDATE activities SET cooldown_until = 0
      WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi} AND cooldown_until > ${t}
    `);
    if (r.rowsAffected === 0) return { code: 'nothing' };
    return { code: 'ok', kind, shinobi };
  }
  if (kind === 'exhaustion') {
    const r = await db.run(sql`
      UPDATE shinobi_state SET exhausted_until = 0, patrol_streak = 0
      WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi} AND exhausted_until > ${t}
    `);
    if (r.rowsAffected === 0) return { code: 'nothing' };
    return { code: 'ok', kind, shinobi };
  }
  return { code: 'unknown_kind' };
}

/** Eligible restore targets for the picker (exhaustion / mission cooldown). */
export async function restorableTimers(telegramId) {
  const t = now();
  const out = [];
  const stMap = await getAllShinobiState(telegramId);
  for (const [name, s] of Object.entries(stMap)) {
    if (isExhausted(s, t)) out.push({ kind: 'exhaustion', shinobi: name, until: s.exhaustedUntil });
  }
  const acts = await db.all(sql`
    SELECT shinobi, cooldown_until FROM activities
    WHERE telegram_id = ${telegramId} AND cooldown_until > ${t} AND status != 'active'
  `);
  for (const a of acts || []) out.push({ kind: 'cooldown', shinobi: a.shinobi, until: a.cooldown_until });
  return out;
}

// Sakura's Healing line for the Training Ground panel.
export function sakuraHealInfoText(s) {
  if (!s.owned) return '🌸 Sakura is not on your roster.';
  if (!s.unlocked) return `🌸 Sakura's Healing unlocks at Lv. ${SAKURA_MAX_LEVEL} via Tsunade training (now Lv. ${s.level}).`;
  if (s.dead) return '🌸 Sakura is ☠️ dead — healing is available.';
  if (s.cooldownUntil > s.now) return `🌸 Sakura's Healing ready at ${dueText(s.cooldownUntil, s.now)}.`;
  return `🌸 Sakura's Healing ready (${s.uses} uses).`;
}
