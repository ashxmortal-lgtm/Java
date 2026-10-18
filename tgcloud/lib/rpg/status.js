/**
 * Shinobi status derivation — shared by /inventory and /map → Gate.
 * All statuses are computed from persisted rows + current time, so the
 * display is always live (finished activities show their new state).
 */

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { dueText } from './time.js';
import { escapeHtml } from '../texts.js';
import { getAllShinobiState, getUserSkills, isDead, isExhausted } from './state.js';

export const SHINOBI_EMO = {
  Sasuke: '⚔️', Sakura: '🌸', Naruto: '🍥', Itachi: '👁️',
  Hinata: '👁️', Jiraiya: '🐸', Tsunade: '🐌', 'Starter Shinobi': '🥷',
};

const ACT_WORD = { patrol: 'Patrol', mission: 'Mission' };

/** Catalog display names for roster UIs. */
export const FULL_NAMES = {
  Sasuke: 'Sasuke Uchiha', Sakura: 'Sakura Haruno', Naruto: 'Naruto Uzumaki',
  Itachi: 'Itachi Uchiha', Hinata: 'Hinata Hyuga', Jiraiya: 'Jiraiya',
  Tsunade: 'Tsunade', 'Starter Shinobi': 'Starter Shinobi',
};
export function fullName(name) {
  return FULL_NAMES[name] || name;
}

const now = () => Math.floor(Date.now() / 1000);

/**
 * Build one status row per owned shinobi.
 * Primary status picks the most relevant state; additional live timers are
 * appended as extras so no information is hidden.
 */
export async function collectStatus(telegramId) {
  const t = now();
  const own = await db.all(sql`
    SELECT item_name FROM inventory
    WHERE telegram_id = ${telegramId} AND item_type = 'shinobi'
    ORDER BY item_name
  `);
  const names = (own || []).map((r) => r.item_name);

  const acts = await db.all(sql`
    SELECT shinobi, kind, status, ends_at, cooldown_until
    FROM activities WHERE telegram_id = ${telegramId}
  `);
  const actMap = Object.fromEntries((acts || []).map((a) => [a.shinobi, a]));

  let bbqMap = {};
  try {
    const bbq = await db.all(sql`
      SELECT shinobi, last_recovery_at FROM bbq_sessions WHERE telegram_id = ${telegramId}
    `);
    bbqMap = Object.fromEntries((bbq || []).map((b) => [b.shinobi, b]));
  } catch (_) {}

  const search = await db.get(sql`
    SELECT status, ends_at, found FROM tsunade_search WHERE telegram_id = ${telegramId}
  `);
  const searchActive = search && search.status === 'active';
  const skills = await getUserSkills(telegramId);
  const stateMap = await getAllShinobiState(telegramId);

  const rows = [];
  for (const name of names) {
    const state = stateMap[name] || {};
    const act = actMap[name];
    const emoji = SHINOBI_EMO[name] || '🥷';
    const level = state.level || 1;
    const extras = [];
    let primary;

    if (isDead(state, t)) {
      primary = { key: 'dead', icon: '☠️', label: 'Dead', due: dueText(state.deadUntil, t), dueAt: state.deadUntil };
    } else if (act && act.status === 'active' && act.ends_at > t) {
      const label = `${ACT_WORD[act.kind] || 'Activity'}`;
      primary = { key: act.kind, icon: act.kind === 'mission' ? '⚔️' : '🏃', label, due: dueText(act.ends_at, t), dueAt: act.ends_at };
    } else if (searchActive && (name === 'Naruto' || name === 'Jiraiya')) {
      primary = {
        key: 'searching', icon: '🔎',
        label: name === 'Jiraiya' ? 'Searching Tsunade' : 'Searching Tsunade (with Jiraiya)',
        due: dueText(search.ends_at, t), dueAt: search.ends_at,
      };
    } else if (isExhausted(state, t)) {
      primary = { key: 'exhausted', icon: '🔥', label: 'Exhausted', due: `Ready at ${dueText(state.exhaustedUntil, t)}`, dueAt: state.exhaustedUntil };
    } else if (bbqMap[name]) {
      primary = { key: 'bbq', icon: '🍖', label: 'At BBQ', due: null, dueAt: 0 };
    } else if ((state.nextTrainAt || 0) > t) {
      primary = { key: 'training', icon: '🏋️', label: 'Training', due: `Next session ${dueText(state.nextTrainAt, t)}`, dueAt: state.nextTrainAt };
    } else {
      primary = { key: 'ready', icon: '🟢', label: 'Ready', due: null, dueAt: 0 };
    }

    // Additional relevant timers (never hidden).
    if (primary.key !== 'exhausted' && isExhausted(state, t)) {
      extras.push(`🔥 Exhausted — ready at ${dueText(state.exhaustedUntil, t)}`);
    }
    if (act && act.status !== 'active' && (act.cooldown_until || 0) > t) {
      extras.push(`⏳ Mission cooldown until ${dueText(act.cooldown_until, t)}`);
    }

    rows.push({ name, emoji, level, primary, extras });
  }

  return { rows, skills, search, now: t };
}

/** Short detail lines for a status row (extras + protection note). */
export function extrasLines(row) {
  return row.extras || [];
}

/**
 * Human status cell for /inventory and /map → Gate, e.g.
 * "🔥 Exhausted — Ready at 18:45 IST (in 18m)" or "🟢 Ready".
 * Escape the caller's responsibility (names) — times/labels are safe.
 */
export function statusText(row) {
  const p = row.primary;
  switch (p.key) {
    case 'ready': return '🟢 Ready';
    case 'patrol': return `🏃 On patrol — Returns ${p.due}`;
    case 'mission': return `⚔️ On mission — Returns ${p.due}`;
    case 'searching': return `🔎 Searching Tsunade — Completes ${p.due}`;
    case 'training': return `🏋️ Training — Next session ${p.due}`;
    case 'exhausted': return `🔥 Exhausted — ${p.due}`;
    case 'dead': return `☠️ Dead — Revives ${p.due}`;
    case 'bbq': return '🍖 At BBQ (chakra recovery)';
    default: return `🟢 ${p.label}`;
  }
}

/** Gate roster line: "Naruto Uzumaki — 🏃 On patrol — Returns 18:45 IST (in 12m)". */
export function gateLine(row) {
  const p = row.primary;
  if (p.key === 'ready') return `${row.emoji} <b>${escapeHtml(fullName(row.name))}</b> · Lv. ${row.level} — 🟢 Ready`;
  return `${row.emoji} <b>${escapeHtml(fullName(row.name))}</b> · Lv. ${row.level} — ${statusText(row)}`;
}
