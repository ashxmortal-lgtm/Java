/**
 * Combat — Itachi kill/rob, Jiraiya protection, Hinata byakugan,
 * Naruto's Shadow Clone Jutsu.
 *
 * All state is persisted (shinobi_state, user_skills, clone_pending, rpg_tx);
 * there is no scheduler, so expired clone windows resolve lazily on the next
 * interaction (sweep, command, callback, Gate/Inventory open) — restart-safe.
 */

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { api } from '../message_api.js';
import { render, style, escapeHtml, mention } from '../texts.js';
import { send } from '../chat.js';
import { fmt } from '../store.js';
import { richBtn } from '../map/rich.js';
import { dueText } from './time.js';
import {
  once, getShinobiState, ensureShinobiState, markDead, isDead,
  getUserSkills, setUserSkills, getEquipped, ownedSet, activateProtection,
} from './state.js';
import {
  itachiLevelOf, itachiRobPct, cloneWindowSec,
  KILL_COINS_MIN, KILL_COINS_MAX, ROB_LOCKOUT_SEC, BYAKUGAN_COOLDOWN_SEC,
} from './levels.js';

const now = () => Math.floor(Date.now() / 1000);
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function replyText(message, body) {
  return send(message.chat.id, {
    text: render(message.from, body),
    parse_mode: 'HTML',
    reply_parameters: { message_id: message.message_id },
  });
}

async function isOwner(id, shinobi) {
  return (await ownedSet(id)).has(shinobi);
}

// ---- core kill ----

/**
 * Resolve a kill against `targetId`'s equipped shinobi.
 * The death flip is conditional (only when alive), so concurrent kills and
 * duplicate callbacks resolve at most once; kills/coins follow the winner.
 */
export async function killTarget(attackerId, targetId, targetShinobi) {
  await db.run(sql`INSERT OR IGNORE INTO users (telegram_id, balance) VALUES (${attackerId}, 0)`);
  await db.run(sql`INSERT OR IGNORE INTO users (telegram_id, balance) VALUES (${targetId}, 0)`);
  await ensureShinobiState(targetId, targetShinobi);
  const st = await getShinobiState(targetId, targetShinobi);
  if (isDead(st, now())) {
    return { code: 'already_dead', reviveAt: st.deadUntil };
  }

  // Guarded death flip: only the first concurrent kill wins.
  const death = await markDead(targetId, targetShinobi);
  if (!death.ok) {
    const st2 = await getShinobiState(targetId, targetShinobi);
    return { code: 'already_dead', reviveAt: st2.deadUntil };
  }
  const reviveAt = death.until;

  const coins = rand(KILL_COINS_MIN, KILL_COINS_MAX);
  await db.run(sql`
    UPDATE users SET balance = balance + ${coins}, kills = kills + 1
    WHERE telegram_id = ${attackerId}
  `);
  const u = await db.get(sql`SELECT kills FROM users WHERE telegram_id = ${attackerId}`);
  return { code: 'ok', coins, kills: u ? u.kills : 0, reviveAt };
}

function killResultText(attackerUser, targetName, shinobi, r) {
  const m = mention(attackerUser);
  if (r.code === 'already_dead') {
    return `${m}, ${escapeHtml(targetName)}'s ${escapeHtml(shinobi)} is already dead.\n\n🕊️ revives at ${dueText(r.reviveAt)}.`;
  }
  return (
    `${m}, ⚔️ 𝐊𝐈𝐋𝐋 𝐂𝐎𝐍𝐅𝐈𝐑𝐌𝐄𝐃\n\n` +
    `${escapeHtml(targetName)}'s ${escapeHtml(shinobi)} has fallen.\n` +
    `🍥 bounty: +${fmt(r.coins)}\n🔪 successful kills: ${fmt(r.kills)}\n\n` +
    `🕊️ ${escapeHtml(shinobi)} revives automatically at ${dueText(r.reviveAt)}.`
  );
}

// ---- shadow clone flow ----

async function cloneWarningHtml(pending, targetName, targetUser, attackerName, shinobi) {
  const m = mention(targetUser);
  const btn = richBtn('🌀 Shadow Clone Jutsu', `cl:go:${pending.id}:${targetUser.id}`, 'danger');
  return (
    `<p>⚠️ <b>𝐊𝐈𝐋𝐋 𝐖𝐀𝐑𝐍𝐈𝐍𝐆</b></p>` +
    `<p>${m}, ${escapeHtml(attackerName)}'s Itachi is striking your ${escapeHtml(shinobi)}!</p>` +
    `<p>🌀 Activate Shadow Clone Jutsu within <b>${pending.windowSec}s</b> — before ${dueText(pending.expiresAt)}.</p>` +
    `<p><tg-button-row align="center">${btn}</tg-button-row></p>`
  );
}

async function sendCloneWarning(pending, targetName, targetUser, attackerName, shinobi) {
  const html = await cloneWarningHtml(pending, targetName, targetUser, attackerName, shinobi);
  try {
    const sent = await api.sendRichMessage({
      chat_id: pending.chatId,
      rich_message: { html, skip_entity_detection: true },
    });
    const messageId = sent?.message_id ?? sent?.result?.message_id;
    if (messageId) {
      await db.run(sql`UPDATE clone_pending SET message_id = ${messageId} WHERE id = ${pending.id}`);
    }
    return messageId;
  } catch (e) {
    console.error('[clone warning]', e?.description || e);
    // Classic fallback keeps the flow working (plain button, no red style).
    try {
      const sent = await api.sendMessage({
        chat_id: pending.chatId,
        text: style(
          `⚠️ 𝐊𝐈𝐋𝐋 𝐖𝐀𝐑𝐍𝐈𝐍𝐆\n\n${mention(targetUser)}, ${escapeHtml(attackerName)}'s Itachi is striking your ${escapeHtml(shinobi)}!\n\n🌀 Activate Shadow Clone Jutsu within ${pending.windowSec}s — before ${dueText(pending.expiresAt)}.`,
        ),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🌀 Shadow Clone Jutsu', callback_data: `cl:go:${pending.id}:${targetUser.id}` }]],
        },
      });
      const messageId = sent?.message_id ?? sent?.result?.message_id;
      if (messageId) {
        await db.run(sql`UPDATE clone_pending SET message_id = ${messageId} WHERE id = ${pending.id}`);
      }
    } catch (e2) {
      console.error('[clone warning fallback]', e2?.description || e2);
    }
  }
  return null;
}

async function editResult(chatId, messageId, text) {
  if (!messageId) return;
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      rich_message: { html: `<p>${style(text).replace(/\n/g, '<br>')}</p>`, skip_entity_detection: true },
    });
  } catch (e) {
    try {
      await api.editMessageText({
        chat_id: chatId, message_id: messageId,
        text: style(text), parse_mode: 'HTML',
      });
    } catch (e2) { console.error('[clone result edit]', e2?.description || e2); }
  }
}

/**
 * Resolve one pending clone row: on timeout the kill lands and the warning
 * message is edited into the actual result.
 */
async function resolveCloneTimeout(row) {
  const won = await db.run(sql`
    UPDATE clone_pending SET status = 'timeout'
    WHERE id = ${row.id} AND status = 'pending'
  `);
  if (won.rowsAffected === 0) return;

  const attacker = await db.get(sql`SELECT first_name, username FROM users WHERE telegram_id = ${row.attacker_id}`);
  const target = await db.get(sql`SELECT first_name, username FROM users WHERE telegram_id = ${row.target_id}`);
  const attackerUser = { id: row.attacker_id, first_name: attacker?.first_name || 'Shinobi', username: attacker?.username };
  const targetName = target?.first_name || 'Shinobi';
  const r = await killTarget(row.attacker_id, row.target_id, row.target_shinobi);
  await editResult(
    row.chat_id, row.message_id,
    killResultText(attackerUser, targetName, row.target_shinobi, r),
  );
}

/** Lazily resolve expired clone windows (called on interactions). */
export async function sweepClones() {
  const rows = await db.all(sql`
    SELECT id, attacker_id, target_id, target_shinobi, chat_id, message_id, window_sec, expires_at
    FROM clone_pending WHERE status = 'pending' AND expires_at <= ${now()} LIMIT 10
  `);
  for (const row of rows || []) {
    try { await resolveCloneTimeout(row); } catch (e) { console.error('[clone sweep]', e); }
  }
}

// ---- /kill ----

export async function handleKill(message) {
  const user = message.from;
  if (message.chat.type === 'private') {
    await replyText(message, "/kill works in groups only.\n\n» Reply to a target's message with /kill in a group where I am a member.");
    return true;
  }
  if (!message.reply_to_message || !message.reply_to_message.from) {
    await replyText(message, "⚔️ Reply to the target's message with /kill to strike.");
    return true;
  }
  if (!(await isOwner(user.id, 'Itachi'))) {
    await replyText(message, '👁️ You need Itachi on your roster to use /kill.\n\n» Recruit at /shinobi_store.');
    return true;
  }

  await sweepClones();
  const target = message.reply_to_message.from;
  if (target.id === user.id) {
    await replyText(message, '🚫 You cannot target yourself.');
    return true;
  }
  if (target.is_bot) {
    await replyText(message, '🚫 Bots cannot be targeted.');
    return true;
  }

  const shinobi = await getEquipped(target.id);
  const skills = await getUserSkills(target.id);
  if ((skills.protectedUntil || 0) > now()) {
    await replyText(message,
      `🛡️ ${escapeHtml(target.first_name || 'The target')} is protected by Jiraiya.\n\n⏳ protection ends at ${dueText(skills.protectedUntil)}.`);
    return true;
  }

  const st = await getShinobiState(target.id, shinobi);
  if (isDead(st, now())) {
    await replyText(message,
      `☠️ ${escapeHtml(target.first_name || 'The target')}'s ${escapeHtml(shinobi)} is already dead.\n\n🕊️ revives at ${dueText(st.deadUntil)}.`);
    return true;
  }

  if (shinobi === 'Naruto') {
    const pendingRow = await db.get(sql`
      SELECT id FROM clone_pending WHERE target_id = ${target.id} AND status = 'pending'
    `);
    if (pendingRow) {
      await replyText(message, '🌀 A kill attempt on this target is already in progress.');
      return true;
    }
    const narutoSt = await getShinobiState(target.id, 'Naruto');
    const windowSec = cloneWindowSec(narutoSt ? narutoSt.level : 1);
    const t = now();
    const ins = await db.run(sql`
      INSERT INTO clone_pending (attacker_id, target_id, target_shinobi, chat_id, window_sec, expires_at, status, created_at)
      VALUES (${user.id}, ${target.id}, 'Naruto', ${message.chat.id}, ${windowSec}, ${t + windowSec}, 'pending', ${t})
    `);
    const pending = {
      id: ins.lastInsertRowid, windowSec, expiresAt: t + windowSec, chatId: message.chat.id,
    };
    await sendCloneWarning(pending, target.first_name || 'Shinobi', target, user.first_name || 'Shinobi', 'Naruto');
    return true;
  }

  const r = await killTarget(user.id, target.id, shinobi);
  await replyText(message, killResultText(user, target.first_name || 'Shinobi', shinobi, r));
  return true;
}

/** Clone button press — only the target may activate, only before expiry. */
export function isCloneCallback(data) {
  return String(data || '').startsWith('cl:go:');
}

export async function handleCloneCallback(cq) {
  if (!isCloneCallback(cq.data)) return false;
  const answer = (text, alert = true) =>
    api.answerCallbackQuery({ callback_query_id: cq.id, text, show_alert: alert }).catch(() => {});
  const [, , idStr, targetStr] = cq.data.split(':');
  const id = Number(idStr);
  if (!id || cq.from.id !== Number(targetStr)) {
    await answer('Only the target can activate the clone.');
    return true;
  }
  const row = await db.get(sql`
    SELECT id, expires_at, status, target_shinobi, attacker_id, target_id, chat_id, message_id
    FROM clone_pending WHERE id = ${id}
  `);
  if (!row) { await answer('This attack has already been resolved.'); return true; }
  if (row.status !== 'pending') { await answer('Too late — this attack is already resolved.'); return true; }

  const t = now();
  if (t > row.expires_at) {
    await resolveCloneTimeout(row);
    await answer('Too late — the clone window expired.');
    return true;
  }
  // Clone absorbs the attack: guarded flip, so only the first press wins.
  const won = await db.run(sql`
    UPDATE clone_pending SET status = 'clone'
    WHERE id = ${row.id} AND status = 'pending' AND expires_at > ${t}
  `);
  if (won.rowsAffected === 0) {
    await answer('Too late — this attack is already resolved.');
    return true;
  }
  const m = mention(cq.from);
  await editResult(
    row.chat_id, row.message_id,
    `${m}'s Shadow Clone absorbed the attack!\n\n🌀 The target survives — Itachi struck a clone.\n» The attacker cannot rob this target from this attack.`,
  );
  await answer('🌀 Shadow Clone Jutsu — attack absorbed!');
  return true;
}

// ---- /rob ----

export async function handleRob(message) {
  const user = message.from;
  if (message.chat.type === 'private') {
    await replyText(message, "/rob works in groups only.\n\n» Reply to a target's message with /rob in a group where I am a member.");
    return true;
  }
  if (!message.reply_to_message || !message.reply_to_message.from) {
    await replyText(message, "💰 Reply to the target's message with /rob.");
    return true;
  }
  if (!(await isOwner(user.id, 'Itachi'))) {
    await replyText(message, '👁️ You need Itachi on your roster to use /rob.\n\n» Recruit at /shinobi_store.');
    return true;
  }

  await sweepClones();
  const target = message.reply_to_message.from;
  if (target.id === user.id) {
    await replyText(message, '🚫 You cannot rob yourself.');
    return true;
  }
  if (target.is_bot) {
    await replyText(message, '🚫 Bots cannot be targeted.');
    return true;
  }

  const shinobi = await getEquipped(target.id);
  await ensureShinobiState(target.id, shinobi);
  const st = await getShinobiState(target.id, shinobi);
  const t = now();
  if (!isDead(st, t)) {
    await replyText(message,
      `🚫 Only dead targets can be robbed.\n\n${escapeHtml(target.first_name || 'The target')}'s ${escapeHtml(shinobi)} is not dead.`);
    return true;
  }
  if ((st.lastRobbedAt || 0) > t - ROB_LOCKOUT_SEC) {
    await replyText(message,
      `⏳ ${escapeHtml(shinobi)} was robbed recently.\n\nrobbery possible again at ${dueText(st.lastRobbedAt + ROB_LOCKOUT_SEC, t)}.`);
    return true;
  }

  const u = await db.get(sql`SELECT kills, balance FROM users WHERE telegram_id = ${user.id}`);
  const pct = itachiRobPct(u ? u.kills : 0);
  const tu = await db.get(sql`SELECT balance FROM users WHERE telegram_id = ${target.id}`);
  const steal = Math.floor(((tu ? tu.balance : 0) * pct) / 100);
  if (steal <= 0) {
    await replyText(message, `🕳️ ${escapeHtml(target.first_name || 'The target')} has nothing to steal.`);
    return true;
  }
  await db.run(sql`INSERT OR IGNORE INTO users (telegram_id, balance) VALUES (${user.id}, 0)`);

  // Guarded lockout claim → transfer. Only the first robber wins.
  await db.run(sql`
    UPDATE shinobi_state SET last_robbed_at = ${t}
    WHERE telegram_id = ${target.id} AND shinobi = ${shinobi} AND last_robbed_at <= ${t - ROB_LOCKOUT_SEC}
  `);
  const lock = await getShinobiState(target.id, shinobi);
  if (lock.lastRobbedAt !== t) {
    await replyText(message, '⏳ This target was just robbed by someone else.');
    return true;
  }
  const moved = await db.run(sql`
    UPDATE users SET balance = balance - ${steal}
    WHERE telegram_id = ${target.id} AND balance >= ${steal}
  `);
  if (moved.rowsAffected === 0) {
    await replyText(message, '🕳️ The target had nothing to steal.');
    return true;
  }
  await db.run(sql`
    UPDATE users SET balance = balance + ${steal} WHERE telegram_id = ${user.id}
  `);
  await replyText(message,
    `💰 𝐑𝐎𝐁 𝐒𝐔𝐂𝐂𝐄𝐒𝐒\n\nItachi (Lv. ${itachiLevelOf(u ? u.kills : 0)}) looted ${fmt(steal)} 🍥 from ${escapeHtml(target.first_name || 'the target')}'s fallen ${escapeHtml(shinobi)}.\n\n🩸 robbery rate: ${pct}%`);
  return true;
}

// ---- /protect ----

export async function handleProtect(message) {
  const user = message.from;
  if (!(await isOwner(user.id, 'Jiraiya'))) {
    await replyText(message, '🐸 You need Jiraiya on your roster to use /protect.\n\n» He is discovered on Naruto patrols.');
    return true;
  }
  const r = await activateProtection(user.id);
  if (!r.ok) {
    await replyText(message,
      `🛡️ Protection is already active.\n\n⏳ ends at ${dueText(r.protectedUntil)} — it cannot be refreshed early.`);
    return true;
  }
  await replyText(message,
    `🛡️ 𝐏𝐑𝐎𝐓𝐄𝐂𝐓𝐈𝐎𝐍 𝐀𝐂𝐓𝐈𝐕𝐄\n\nJiraiya shields you for 24 hours.\n\n⏳ protection ends at ${dueText(r.protectedUntil)}.\n» Itachi's /kill cannot succeed while protected.`);
}

// ---- /byakugan ----

export async function handleByakugan(message) {
  const user = message.from;
  if (message.chat.type === 'private' || !message.reply_to_message || !message.reply_to_message.from) {
    await replyText(message, '👁️ Reply to a target\'s message with /byakugan in a group.');
    return true;
  }
  if (!(await isOwner(user.id, 'Hinata'))) {
    await replyText(message, '👁️ You need Hinata on your roster to use /byakugan.\n\n» Recruit at /shinobi_store.');
    return true;
  }

  const t = now();
  await getUserSkills(user.id);
  const won = await db.run(sql`
    UPDATE user_skills SET byakugan_at = ${t}
    WHERE telegram_id = ${user.id} AND byakugan_at <= ${t - BYAKUGAN_COOLDOWN_SEC}
  `);
  if (won.rowsAffected === 0) {
    const s = await getUserSkills(user.id);
    await replyText(message,
      `👁️ Byakugan needs rest.\n\nusable again at ${dueText(s.byakuganAt + BYAKUGAN_COOLDOWN_SEC, t)}.`);
    return true;
  }

  const target = message.reply_to_message.from;
  const chatTitle = escapeHtml(message.chat.title || 'this group');
  const btn = { text: '👁 Reveal', callback_data: `by:reveal:${user.id}:${target.id}` };
  await send(message.chat.id, {
    text: render(user, `👁️ 𝐁𝐘𝐀𝐊𝐔𝐆𝐀𝐍\n\n${escapeHtml(target.first_name || 'The target')} scanned. Tap below — the report is private and only you will see it.`),
    parse_mode: 'HTML',
    reply_parameters: { message_id: message.message_id },
    reply_markup: { inline_keyboard: [[btn]] },
  });

  // Best-effort private heads-up to the target; failure is silent and safe.
  try {
    await send(target.id, {
      text: render(
        { id: user.id, first_name: user.first_name || 'A shinobi' },
        `👁️ ${escapeHtml(user.first_name || 'A shinobi')} viewed your protection countdown in ${chatTitle}.`,
      ),
      parse_mode: 'HTML',
    });
  } catch (_) { /* target never started the bot — fail gracefully */ }
  return true;
}

export function isByakuganCallback(data) {
  return String(data || '').startsWith('by:reveal:');
}

export async function handleByakuganCallback(cq) {
  if (!isByakuganCallback(cq.data)) return false;
  const [, , ownerStr, targetStr] = cq.data.split(':');
  if (cq.from.id !== Number(ownerStr)) {
    await api.answerCallbackQuery({
      callback_query_id: cq.id, text: 'Only the scanner sees this report.', show_alert: true,
    }).catch(() => {});
    return true;
  }
  // Report the TARGET's protection, not the scanner's own.
  const skills = await getUserSkills(Number(targetStr) || cq.from.id);
  let report;
  if ((skills.protectedUntil || 0) > now()) {
    report = `🛡️ Jiraiya protection ends at ${dueText(skills.protectedUntil)}.`;
  } else {
    report = '🛡️ No active Jiraiya protection on this target right now.';
  }
  await api.answerCallbackQuery({
    callback_query_id: cq.id,
    text: report,
    show_alert: true,
  }).catch(() => {});
  return true;
}
