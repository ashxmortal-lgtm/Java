/**
 * Map command + callback router.
 * Photo captions + centered keyboards; rich fallback when media fails.
 */

import { BotApiError } from 'sdk';
import { api } from '../message_api.js';
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { style, escapeHtml, mention } from '../texts.js';
import { screenText, screenKeyboard, fmt } from '../store.js';
import { runActivity, KINDS } from '../activities.js';
import { MAP_ENABLED, MAX_CHAKRA } from './constants.js';
import {
  mapKeyboard,
  hokageKeyboard,
  gateKeyboard,
  ichirakuKeyboard,
  bbqKeyboard,
  trainingKeyboard,
  hotspringsKeyboard,
  storeKeyboard,
  guard,
  backToMapRow,
} from './ui.js';
import {
  listPendingRewards,
  claimAllPendingRewards,
} from './pending.js';
import {
  applyBbqRecovery,
  listBbqSessions,
  startBbq,
  stopBbq,
} from './bbq.js';
import {
  ramenKeyboard,
  fieldMealKeyboard,
  buyRamen,
  prepareFieldMeal,
} from './ichiraku.js';
import { sendMapRich, editMapRich, mapBody } from './rich.js';
import { showMapPhoto, storageIdForLocation } from './media.js';
import { showCatalog, catalogBlocks } from '../gift.js';
import { storeContent, abilityContent, editRichOr, richOr } from '../rich.js';
import { abilityText, abilityKeyboardFromMap } from '../ability.js';
import { render } from '../texts.js';
import { send } from '../chat.js';

const EMO = {
  Sasuke: '⚔️',
  Sakura: '🌸',
  Naruto: '🍥',
  Itachi: '👁️',
  Hinata: '👁️',
  Jiraiya: '🐸',
  'Starter Shinobi': '🥷',
};

async function answer(cb, text, alert = false) {
  const payload = { callback_query_id: cb.id };
  if (text) {
    payload.text = text;
    payload.show_alert = !!alert;
  }
  try {
    await api.answerCallbackQuery(payload);
  } catch (_) {}
}

async function ownedNames(telegramId) {
  const rows = await db.all(sql`
    SELECT item_name FROM inventory
    WHERE telegram_id = ${telegramId} AND item_type = 'shinobi'
  `);
  return rows.map((r) => r.item_name);
}

function p(html) {
  return `<p>${html}</p>`;
}

function locBody(title, lines) {
  return p(`<b>${title}</b>`) + (lines || []).map((l) => p(l)).join('');
}

const LOC_COPY = {
  hokage: {
    title: '🏯 HOKAGE OFFICE',
    lines: ['Shinobi missions · Daily Quest · claim all rewards.'],
  },
  ichiraku: {
    title: '🍜 ICHIRAKU RAMEN',
    lines: ['Restore chakra with ramen or prepare a Field Meal.'],
  },
  bbq: {
    title: '🍖 BBQ',
    lines: ['Send shinobi here to recover chakra over time (+20 / 30 min).'],
  },
  gate: {
    title: '🚪 VILLAGE GATE',
    lines: ['Shinobi status · dispatch available units on patrol.'],
  },
  training: {
    title: '🥷 TRAINING GROUND',
    lines: [
      'Sakura training requires Tsunade (not in the current roster).',
      'This location is reserved for a future update.',
    ],
  },
  hotsprings: {
    title: '♨️ HOT SPRINGS',
    lines: [
      'Pet rest is not available in this version (pets omitted).',
      'This location is reserved for a future update.',
    ],
  },
  store: {
    title: '🏪 STORES',
    lines: ['Shinobi Store · Gift Store.'],
  },
};

function homeBody() {
  return locBody('🗺️ KONOHA MAP', ['Choose a location.']);
}

function locationBody(locKey) {
  const c = LOC_COPY[locKey] || { title: 'Map', lines: [] };
  return locBody(c.title, c.lines);
}

function kbFor(locKey, userId) {
  const map = {
    hokage: hokageKeyboard,
    ichiraku: ichirakuKeyboard,
    bbq: bbqKeyboard,
    gate: gateKeyboard,
    training: trainingKeyboard,
    hotsprings: hotspringsKeyboard,
    store: storeKeyboard,
  };
  return (map[locKey] || mapKeyboard)(userId);
}

/** Caption HTML for photo messages (no embedded tg-buttons — those use reply_markup). */
function captionFromBody(user, bodyInner) {
  const name = escapeHtml((user && user.first_name) || 'Shinobi');
  const inner = String(bodyInner || '')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return style(`<b>${name}</b>\n\n${inner}`);
}

/**
 * Show map screen: prefer storage-channel photo + caption + keyboard.
 * locKey null/'home' → main map image.
 */
async function showScreen(chatId, messageId, user, bodyInner, keyboard, locKey = 'home') {
  const body = mapBody(user, bodyInner);
  const storageId = storageIdForLocation(locKey);
  const caption = captionFromBody(user, bodyInner);

  try {
    const result = await showMapPhoto({
      chatId,
      messageId,
      storageMessageId: storageId,
      caption,
      replyMarkup: keyboard,
    });
    if (result && result.ok) return result.messageId || messageId;
  } catch (e) {
    console.error('[map showScreen photo]', e);
  }

  // Rich / classic text fallback
  if (messageId) {
    await editMapRich(chatId, messageId, body, keyboard);
    return messageId;
  }
  const sent = await sendMapRich(chatId, body, keyboard);
  return sent?.message_id || sent?.result?.message_id || null;
}

const now = () => Math.floor(Date.now() / 1000);

function fmtReturn(endsAt) {
  const left = Math.max(0, (endsAt || 0) - now());
  if (left <= 0) return 'returning soon';
  const m = Math.ceil(left / 60);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m left`;
}

/** Status line for each owned shinobi at the Gate. */
async function gateRosterLines(telegramId) {
  let names = [];
  try {
    names = await ownedNames(telegramId);
  } catch (e) {
    console.error('[gate owned]', e);
    return ['Could not load inventory.'];
  }
  if (!names.length) return ['No shinobi owned yet. Recruit at Stores.'];

  let actMap = {};
  try {
    const acts = await db.all(sql`
      SELECT shinobi, kind, status, ends_at
      FROM activities
      WHERE telegram_id = ${telegramId}
    `);
    actMap = Object.fromEntries((acts || []).map((a) => [a.shinobi, a]));
  } catch (e) {
    console.error('[gate activities]', e);
  }

  let bbqSet = new Set();
  try {
    const bbq = await listBbqSessions(telegramId);
    bbqSet = new Set((bbq || []).map((s) => s.shinobi));
  } catch (e) {
    console.error('[gate bbq]', e);
  }

  const lines = [];
  for (const name of names) {
    const emoji = EMO[name] || '🥷';
    const a = actMap[name];
    if (a && a.status === 'active') {
      const label = a.kind === 'mission' ? 'On mission' : 'On patrol';
      lines.push(`${emoji} <b>${escapeHtml(name)}</b> — ${label} (${fmtReturn(a.ends_at)})`);
    } else if (bbqSet.has(name)) {
      lines.push(`${emoji} <b>${escapeHtml(name)}</b> — At BBQ`);
    } else {
      lines.push(`${emoji} <b>${escapeHtml(name)}</b> — Available`);
    }
  }
  return lines;
}

async function gateBody(telegramId) {
  try {
    const lines = await gateRosterLines(telegramId);
    return locBody('🚪 VILLAGE GATE', ['Your shinobi:', ...lines]);
  } catch (e) {
    console.error('[gateBody]', e);
    return locBody('🚪 VILLAGE GATE', [
      'Shinobi status temporarily unavailable.',
      'You can still try Send Available on Patrol.',
    ]);
  }
}

async function clearGateSelection(telegramId) {
  try {
    await db.run(sql`DELETE FROM map_gate_selection WHERE telegram_id = ${telegramId}`);
  } catch (e) {
    console.error('[gate clear sel]', e);
  }
}

async function listGateSelection(telegramId) {
  try {
    const rows = await db.all(sql`
      SELECT shinobi FROM map_gate_selection WHERE telegram_id = ${telegramId}
    `);
    return new Set((rows || []).map((r) => r.shinobi));
  } catch (e) {
    console.error('[gate list sel]', e);
    return new Set();
  }
}

async function toggleGateSelection(telegramId, shinobi) {
  try {
    const exists = await db.get(sql`
      SELECT 1 FROM map_gate_selection
      WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
    `);
    if (exists) {
      await db.run(sql`
        DELETE FROM map_gate_selection
        WHERE telegram_id = ${telegramId} AND shinobi = ${shinobi}
      `);
      return false;
    }
    await db.run(sql`
      INSERT OR IGNORE INTO map_gate_selection (telegram_id, shinobi)
      VALUES (${telegramId}, ${shinobi})
    `);
    return true;
  } catch (e) {
    console.error('[gate toggle]', e);
    return false;
  }
}

async function availableShinobi(telegramId) {
  let names = [];
  try {
    names = await ownedNames(telegramId);
  } catch (_) {
    return [];
  }
  const busy = new Set();
  try {
    const acts = await db.all(sql`
      SELECT shinobi FROM activities
      WHERE telegram_id = ${telegramId} AND status = 'active'
    `);
    for (const a of acts || []) busy.add(a.shinobi);
  } catch (_) {}
  try {
    const bbq = await listBbqSessions(telegramId);
    for (const s of bbq || []) busy.add(s.shinobi);
  } catch (_) {}
  return names.filter((n) => !busy.has(n));
}

function patrolPickKeyboard(userId, available, selected) {
  const rows = available.map((name) => {
    const mark = selected.has(name) ? '✅' : '⬜️';
    return [{
      text: `${mark} ${EMO[name] || '🥷'} ${name}`,
      callback_data: `map_ptog:${name}:${userId}`,
    }];
  });
  rows.push([
    { text: '🚀 Send on Patrol', callback_data: guard('map_psend', userId) },
    { text: '✖️ Cancel', callback_data: guard('map_loc_gate', userId) },
  ]);
  rows.push(backToMapRow(userId));
  return { inline_keyboard: rows };
}

async function claimRewardsBody(telegramId) {
  const rows = await listPendingRewards(telegramId);
  if (!rows.length) {
    return locBody('💰 CLAIM ALL REWARDS', [
      'No pending rewards.',
      'Complete missions or patrols, then return here to claim.',
    ]);
  }
  const mission = rows.filter((r) => (r.kind || 'patrol') === 'mission');
  const patrol = rows.filter((r) => (r.kind || 'patrol') !== 'mission');
  const lines = [];
  let mTotal = 0;
  let pTotal = 0;
  if (mission.length) {
    lines.push('<b>Mission rewards</b>');
    for (const r of mission) {
      lines.push(`${EMO[r.shinobi] || '🥷'} ${escapeHtml(r.shinobi)} → +${fmt(r.reward)} 🍥`);
      mTotal += r.reward;
    }
    lines.push(`Subtotal: +${fmt(mTotal)} 🍥`);
  }
  if (patrol.length) {
    lines.push('<b>Patrol rewards</b>');
    for (const r of patrol) {
      lines.push(`${EMO[r.shinobi] || '🥷'} ${escapeHtml(r.shinobi)} → +${fmt(r.reward)} 🍥`);
      pTotal += r.reward;
    }
    lines.push(`Subtotal: +${fmt(pTotal)} 🍥`);
  }
  lines.push(`<b>TOTAL +${fmt(mTotal + pTotal)} 🍥</b>`);
  lines.push('Rewards are added to your balance only when you claim.');
  return locBody('💰 CLAIM ALL REWARDS', lines);
}

function claimRewardsKeyboard(userId, hasPending) {
  const rows = [];
  if (hasPending) {
    rows.push([{ text: '✅ Claim All', callback_data: guard('map_claim_confirm', userId) }]);
  }
  rows.push([{ text: '◂ Back', callback_data: guard('map_loc_hokage', userId) }]);
  rows.push(backToMapRow(userId));
  return { inline_keyboard: rows };
}

export async function handleMapCommand(message) {
  if (!MAP_ENABLED) {
    await sendMapRich(
      message.chat.id,
      mapBody(message.from, p('🗺️ Map is temporarily disabled.')),
      null,
    );
    return;
  }
  const user = message.from;
  try {
    await applyBbqRecovery(user.id);
  } catch (e) {
    console.error('[map bbq sweep]', e);
  }
  await showScreen(message.chat.id, null, user, homeBody(), mapKeyboard(user.id), 'home');
}

export async function mapSweep(userId) {
  if (!MAP_ENABLED) return;
  try {
    if (userId) await applyBbqRecovery(userId);
  } catch (e) {
    console.error('[mapSweep]', e);
  }
}

function parseCb(data) {
  const parts = String(data || '').split(':');
  return { action: parts[0] || '', parts, ownerId: Number(parts[parts.length - 1]) || 0 };
}

export function isMapCallback(data) {
  return String(data || '').startsWith('map_');
}

export async function handleMapCallback(cb) {
  const data = String(cb.data || '');
  if (!data.startsWith('map_')) return false;
  if (!MAP_ENABLED) {
    await answer(cb, 'Map disabled.', true);
    return true;
  }

  const msg = cb.message;
  if (!msg) {
    await answer(cb);
    return true;
  }

  const { action, parts, ownerId } = parseCb(data);
  if (cb.from.id !== ownerId) {
    await answer(cb, "This menu isn't yours. Send /map to open your own.", true);
    return true;
  }

  const user = cb.from;
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  try {
    if (action === 'map_home') {
      await answer(cb);
      await showScreen(chatId, messageId, user, homeBody(), mapKeyboard(user.id), 'home');
      return true;
    }

    const locActions = {
      map_loc_hokage: 'hokage',
      map_loc_ichiraku: 'ichiraku',
      map_loc_bbq: 'bbq',
      map_loc_gate: 'gate',
      map_loc_training: 'training',
      map_loc_hotsprings: 'hotsprings',
      map_loc_store: 'store',
    };
    if (locActions[action]) {
      const loc = locActions[action];
      await answer(cb);
      if (loc === 'bbq') {
        try {
          await applyBbqRecovery(user.id);
        } catch (_) {}
      }
      let body = locationBody(loc);
      let kb = kbFor(loc, user.id);
      if (loc === 'gate') {
        body = await gateBody(user.id);
      }
      await showScreen(chatId, messageId, user, body, kb, loc);
      return true;
    }

    // --- Stores ---
    if (action === 'map_store' && parts.length >= 3) {
      const screen = parts[1];
      await answer(cb);
      try {
        await editRichOr(
          msg,
          user,
          storeContent(screen, user.id, { fromMap: true }),
          async () => {
            const { screenText, screenKeyboard } = await import('../store.js');
            await api.editMessageText({
              chat_id: chatId,
              message_id: messageId,
              text: style(screenText(screen)),
              parse_mode: 'HTML',
              reply_markup: screenKeyboard(screen, user.id, { fromMap: true }),
            });
          },
        );
      } catch (e) {
        console.error('[map_store]', e);
      }
      return true;
    }

    if (action === 'map_open_shinobi_store') {
      await answer(cb);
      try {
        // Prefer rich table (compact) on the current message
        await editRichOr(
          msg,
          user,
          storeContent('main', user.id, { fromMap: true }),
          async () => {
            const { screenText, screenKeyboard } = await import('../store.js');
            await api.editMessageText({
              chat_id: chatId,
              message_id: messageId,
              text: style(screenText('main')),
              parse_mode: 'HTML',
              reply_markup: screenKeyboard('main', user.id, { fromMap: true }),
            });
          },
        );
      } catch (e) {
        console.error('[map shinobi store]', e);
        try {
          await richOr(
            chatId,
            user,
            storeContent('main', user.id, { fromMap: true }),
            async () => {
              const { screenText, screenKeyboard } = await import('../store.js');
              await api.sendMessage({
                chat_id: chatId,
                text: style(screenText('main')),
                parse_mode: 'HTML',
                reply_markup: screenKeyboard('main', user.id, { fromMap: true }),
              });
            },
          );
        } catch (e2) {
          console.error('[map shinobi store send]', e2);
        }
      }
      return true;
    }

    if (action === 'map_open_gift_store') {
      await answer(cb);
      // 1) Edit current map message into gift catalog
      try {
        await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          rich_message: { blocks: catalogBlocks() },
        });
        return true;
      } catch (e) {
        console.error('[map gift edit]', e?.description || e);
      }
      // 2) Delete map message and open catalog as a new message
      }
    }

    // --- Hokage: mission hub ---
    if (action === 'map_mission_hub') {
      await answer(cb);
      const eligible = KINDS.mission.eligible;
      const own = await ownedNames(user.id);
      const rows = [];
      for (const name of eligible) {
        if (!own.includes(name)) continue;
        rows.push([{
          text: `${EMO[name] || '🥷'} ${name}`,
          callback_data: `map_msel:${name}:${user.id}`,
        }]);
      }
      if (!rows.length) {
        await showScreen(
          chatId,
          messageId,
          user,
          locBody('🏯 SHINOBI MISSION', [
            "You don't own a mission-eligible shinobi yet.",
            'Recruit Sasuke or Naruto from Stores.',
          ]),
          hokageKeyboard(user.id),
          'hokage',
        );
        return true;
      }
      rows.push([{ text: '◂ Back', callback_data: guard('map_loc_hokage', user.id) }]);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('🏯 SHINOBI MISSION', ['Select a shinobi to dispatch.']),
        { inline_keyboard: rows },
        'hokage',
      );
      return true;
    }

    if (action === 'map_msel' && parts.length >= 3) {
      const shinobi = parts[1];
      await answer(cb);
      if (chatId > 0) {
        await showScreen(
          chatId,
          messageId,
          user,
          locBody('GROUP COMMAND', ['Missions work in groups only. Use /mission in a group.']),
          hokageKeyboard(user.id),
          'hokage',
        );
        return true;
      }
      const r = await runActivity(user, 'mission', shinobi, chatId);
      await showScreen(
        chatId,
        messageId,
        user,
        p(style(r.body).replace(/\n/g, '<br>')),
        hokageKeyboard(user.id),
        'hokage',
      );
      return true;
    }

    if (action === 'map_daily') {
      await answer(cb, 'Daily Quest coming soon.', true);
      return true;
    }

    // --- Claim all rewards ---
    if (action === 'map_claim_rewards' || action === 'map_claim_patrol') {
      await answer(cb);
      const rows = await listPendingRewards(user.id);
      await showScreen(
        chatId,
        messageId,
        user,
        await claimRewardsBody(user.id),
        claimRewardsKeyboard(user.id, rows.length > 0),
        'hokage',
      );
      return true;
    }

    if (action === 'map_claim_confirm') {
      const result = await claimAllPendingRewards(user.id);
      if (result.code === 'none') {
        await answer(cb, 'Nothing to claim.', true);
        await showScreen(
          chatId,
          messageId,
          user,
          await claimRewardsBody(user.id),
          claimRewardsKeyboard(user.id, false),
          'hokage',
        );
        return true;
      }
      await answer(cb, `Claimed +${fmt(result.total)} 🍥`, true);
      const lines = [
        `+${fmt(result.total)} 🍥 added to your balance.`,
        result.missionTotal
          ? `Mission portion: +${fmt(result.missionTotal)} 🍥`
          : null,
        result.patrolTotal
          ? `Patrol portion: +${fmt(result.patrolTotal)} 🍥`
          : null,
      ].filter(Boolean);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('✅ REWARDS CLAIMED', lines),
        hokageKeyboard(user.id),
        'hokage',
      );
      return true;
    }

    // --- Gate: multi-select patrol ---
    if (action === 'map_patrol_pick' || action === 'map_patrol_select') {
      await answer(cb);
      await clearGateSelection(user.id);
      const available = await availableShinobi(user.id);
      if (!available.length) {
        await showScreen(
          chatId,
          messageId,
          user,
          locBody('🚪 PATROL', [
            'No available shinobi.',
            'All units are on mission, patrol, or at BBQ.',
          ]),
          gateKeyboard(user.id),
          'gate',
        );
        return true;
      }
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('🚪 SELECT SHINOBI', [
          'Tap to toggle selection, then Send on Patrol.',
        ]),
        patrolPickKeyboard(user.id, available, new Set()),
        'gate',
      );
      return true;
    }

    if (action === 'map_ptog' && parts.length >= 3) {
      const shinobi = parts[1];
      await toggleGateSelection(user.id, shinobi);
      await answer(cb);
      const available = await availableShinobi(user.id);
      const selected = await listGateSelection(user.id);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('🚪 SELECT SHINOBI', [
          `Selected: ${selected.size}`,
          'Tap to toggle, then Send on Patrol.',
        ]),
        patrolPickKeyboard(user.id, available, selected),
        'gate',
      );
      return true;
    }

    if (action === 'map_psend') {
      const selected = [...(await listGateSelection(user.id))];
      if (!selected.length) {
        await answer(cb, 'Select at least one shinobi.', true);
        return true;
      }
      await answer(cb);
      const results = [];
      for (const shinobi of selected) {
        const r = await runActivity(user, 'patrol', shinobi, chatId);
        results.push(`${EMO[shinobi] || '🥷'} ${shinobi}: dispatched`);
        // Note: runActivity pays on completion via existing flow; pending claim is for map-tracked rewards when added
      }
      await clearGateSelection(user.id);
      const body = locBody('🚪 PATROL DISPATCHED', results);
      // Return to gate roster with updated statuses
      const roster = await gateBody(user.id);
      await showScreen(chatId, messageId, user, roster, gateKeyboard(user.id), 'gate');
      return true;
    }

    if (action === 'map_psel' && parts.length >= 3) {
      // Legacy single-select
      const shinobi = parts[1];
      await answer(cb);
      const r = await runActivity(user, 'patrol', shinobi, chatId);
      await showScreen(
        chatId,
        messageId,
        user,
        p(style(r.body).replace(/\n/g, '<br>')),
        gateKeyboard(user.id),
        'gate',
      );
      return true;
    }

    // --- Ichiraku ---
    if (action === 'map_ichi_cat_ramen') {
      await answer(cb);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('🍜 RAMEN MENU', [
          `Restores chakra (capped at ${MAX_CHAKRA}).`,
          'You are not charged if chakra is already full.',
        ]),
        ramenKeyboard(user.id),
        'ichiraku',
      );
      return true;
    }
    if (action === 'map_ichi_cat_field') {
      await answer(cb);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('⚡ FIELD MEALS', ['Prepared for your next mission or patrol.']),
        fieldMealKeyboard(user.id),
        'ichiraku',
      );
      return true;
    }
    if (action === 'map_ramen' && parts.length >= 3) {
      const key = parts[1];
      const result = await buyRamen(user.id, key);
      if (result.code === 'unknown') {
        await answer(cb, 'Unknown item.', true);
        return true;
      }
      if (result.code === 'full_chakra') {
        await answer(cb, `Chakra already full (${result.chakra}/${result.max}).`, true);
        return true;
      }
      if (result.code === 'no_coins') {
        await answer(cb, `Not enough coins (${fmt(result.have)}/${fmt(result.need)}).`, true);
        return true;
      }
      await answer(cb);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody(`✅ ${result.emoji} ${escapeHtml(result.name)}`, [
          `−${fmt(result.cost)} 🍥`,
          `+${result.chakraGained} ⚡ → ${result.chakra}/${MAX_CHAKRA}`,
        ]),
        ichirakuKeyboard(user.id),
        'ichiraku',
      );
      return true;
    }
    if (action === 'map_field' && parts.length >= 3) {
      const key = parts[1];
      const result = await prepareFieldMeal(user.id, key);
      if (result.code === 'unknown') {
        await answer(cb, 'Unknown item.', true);
        return true;
      }
      if (result.code === 'no_coins') {
        await answer(cb, `Not enough coins (${fmt(result.have)}/${fmt(result.need)}).`, true);
        return true;
      }
      await answer(cb);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody(`✅ ${result.emoji} ${escapeHtml(result.name)} prepared`, [
          `−${fmt(result.cost)} 🍥`,
          'Applies to your next mission or patrol.',
        ]),
        ichirakuKeyboard(user.id),
        'ichiraku',
      );
      return true;
    }

    // --- BBQ ---
    if (action === 'map_bbq_select') {
      await answer(cb);
      const own = await ownedNames(user.id);
      const sessions = await listBbqSessions(user.id);
      const atBbq = new Set(sessions.map((s) => s.shinobi));
      const rows = [];
      for (const name of own) {
        if (atBbq.has(name)) continue;
        rows.push([{
          text: `${EMO[name] || '🥷'} ${name}`,
          callback_data: `map_bbq_go:${name}:${user.id}`,
        }]);
      }
      if (!rows.length) {
        await showScreen(
          chatId,
          messageId,
          user,
          locBody('🍖 BBQ', ['No free shinobi to send (or none owned).']),
          bbqKeyboard(user.id),
          'bbq',
        );
        return true;
      }
      rows.push([{ text: '◂ Back', callback_data: guard('map_loc_bbq', user.id) }]);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('🍖 SEND TO BBQ', ['Select a shinobi.']),
        { inline_keyboard: rows },
        'bbq',
      );
      return true;
    }

    if (action === 'map_bbq_go' && parts.length >= 3) {
      const shinobi = parts[1];
      const result = await startBbq(user.id, shinobi);
      if (result.code === 'busy') {
        await answer(cb, 'That shinobi is on a mission/patrol.', true);
        return true;
      }
      await answer(cb);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody(`🍖 ${EMO[shinobi] || '🥷'} ${escapeHtml(shinobi)} at BBQ`, [
          'Chakra recovers +20 every 30 minutes (catch-up when you open the map).',
        ]),
        bbqKeyboard(user.id),
        'bbq',
      );
      return true;
    }

    if (action === 'map_bbq_recall') {
      await answer(cb);
      const sessions = await listBbqSessions(user.id);
      if (!sessions.length) {
        await showScreen(
          chatId,
          messageId,
          user,
          locBody('🍖 BBQ', ['No shinobi at the BBQ.']),
          bbqKeyboard(user.id),
          'bbq',
        );
        return true;
      }
      const rows = sessions.map((s) => [{
        text: `${EMO[s.shinobi] || '🥷'} ${s.shinobi}`,
        callback_data: `map_bbq_stop:${s.shinobi}:${user.id}`,
      }]);
      rows.push([{ text: '◂ Back', callback_data: guard('map_loc_bbq', user.id) }]);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody('🏠 RECALL FROM BBQ', ['Select a shinobi.']),
        { inline_keyboard: rows },
        'bbq',
      );
      return true;
    }

    if (action === 'map_bbq_stop' && parts.length >= 3) {
      const shinobi = parts[1];
      await stopBbq(user.id, shinobi);
      await answer(cb);
      await showScreen(
        chatId,
        messageId,
        user,
        locBody(`🏠 ${EMO[shinobi] || '🥷'} ${escapeHtml(shinobi)} left BBQ`, []),
        bbqKeyboard(user.id),
        'bbq',
      );
      return true;
    }

    if (action === 'map_open_ability') {
      await answer(cb);
      try {
        await editRichOr(
          msg,
          user,
          abilityContent(user.id, { fromMap: true }),
          async () => {
            await api.editMessageText({
              chat_id: chatId,
              message_id: messageId,
              text: style(abilityText()),
              parse_mode: 'HTML',
              reply_markup: abilityKeyboardFromMap(user.id),
            });
          },
        );
      } catch (e) {
        console.error('[map ability]', e);
        try {
          await richOr(
            chatId,
            user,
            abilityContent(user.id, { fromMap: true }),
            async () => {
              await api.sendMessage({
                chat_id: chatId,
                text: style(abilityText()),
                parse_mode: 'HTML',
                reply_markup: abilityKeyboardFromMap(user.id),
              });
            },
          );
        } catch (_) {}
      }
      return true;
    }

    if (action === 'map_train_sakura') {
      await answer(cb, 'Sakura training requires Tsunade — not available yet.', true);
      return true;
    }

    await answer(cb);
    return true;
  } catch (e) {
    console.error('[map callback]', e);
    try {
      await answer(cb, 'Something went wrong.', true);
    } catch (_) {}
    return true;
  }
}
