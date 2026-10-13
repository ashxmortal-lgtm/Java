/**
 * Map command + callback router (rich messages + classic fallback).
 * Pets omitted. Does not touch non-map handlers.
 */

import { BotApiError } from 'sdk';
import { api } from '../message_api.js';
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { mention, style, escapeHtml } from '../texts.js';
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
  listPendingPatrolRewards,
  claimPendingPatrolRewards,
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

const EMO = {
  Sasuke: '⚔️', Sakura: '🌸', Naruto: '🍥', Itachi: '👁️',
  Hinata: '👁️', Jiraiya: '🐸', 'Starter Shinobi': '🥷',
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
    lines: ['Shinobi missions · Daily Mission · patrol claims.'],
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
    lines: ['Dispatch a patrol. Map patrol rewards are claimed at the Hokage Office.'],
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
    title: '🏪 STORE',
    lines: ['Open the shinobi store from the map.'],
  },
};

function homeBody() {
  return locBody('🗺️ KONOHA MAP', ['Choose a location to explore.']);
}

function locationBody(locKey) {
  const c = LOC_COPY[locKey] || LOC_COPY.hokage;
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

async function showScreen(chatId, messageId, user, bodyInner, keyboard) {
  const body = mapBody(user, bodyInner);
  if (messageId) {
    await editMapRich(chatId, messageId, body, keyboard);
  } else {
    await sendMapRich(chatId, body, keyboard);
  }
}

/** /map command — rich map home */
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
  await showScreen(message.chat.id, null, user, homeBody(), mapKeyboard(user.id));
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

/** True when callback_data belongs to the map subsystem. */
export function isMapCallback(data) {
  return String(data || '').startsWith('map_');
}

/** Returns true if this callback was a map_* action. */
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
      await showScreen(chatId, messageId, user, homeBody(), mapKeyboard(user.id));
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
        try { await applyBbqRecovery(user.id); } catch (_) {}
      }
      await showScreen(chatId, messageId, user, locationBody(loc), kbFor(loc, user.id));
      return true;
    }

    if (action === 'map_open_shinobi_store') {
      await answer(cb);
      const kb = screenKeyboard('main', user.id);
      const rows = [...(kb.inline_keyboard || []), backToMapRow(user.id)];
      await showScreen(
        chatId,
        messageId,
        user,
        p('<b>🏯 SHINOBI STORE</b>') + p('Use /buy [item] after picking from the list.'),
        { inline_keyboard: rows },
      );
      return true;
    }

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
          chatId, messageId, user,
          locBody('🏯 SHINOBI MISSION', [
            "You don't own a mission-eligible shinobi yet.",
            'Recruit Sasuke or Naruto from /shinobi_store.',
          ]),
          hokageKeyboard(user.id),
        );
        return true;
      }
      rows.push([{ text: '🔙 ʙᴀᴄᴋ', callback_data: guard('map_loc_hokage', user.id) }]);
      await showScreen(
        chatId, messageId, user,
        locBody('🏯 SHINOBI MISSION', ['Select a shinobi to dispatch.']),
        { inline_keyboard: rows },
      );
      return true;
    }

    if (action === 'map_msel' && parts.length >= 3) {
      const shinobi = parts[1];
      await answer(cb);
      if (chatId > 0) {
        await showScreen(
          chatId, messageId, user,
          locBody('GROUP COMMAND', ['Missions work in groups only.']),
          hokageKeyboard(user.id),
        );
        return true;
      }
      const r = await runActivity(user, 'mission', shinobi, chatId);
      await showScreen(
        chatId, messageId, user,
        p(style(r.body).replace(/\n/g, '<br>')),
        hokageKeyboard(user.id),
      );
      return true;
    }

    if (action === 'map_daily') {
      await answer(cb, 'Daily Mission coming soon.', true);
      return true;
    }

    if (action === 'map_claim_patrol') {
      await answer(cb);
      const pending = await listPendingPatrolRewards(user.id);
      if (!pending.length) {
        await showScreen(
          chatId, messageId, user,
          locBody('💰 PENDING PATROL', [
            'No pending patrol rewards.',
            'Complete a map patrol at the Village Gate first.',
            '(Command /patrol still pays instantly.)',
          ]),
          hokageKeyboard(user.id),
        );
        return true;
      }
      let total = 0;
      const lines = ['Pending rewards:'];
      for (const row of pending) {
        const emoji = EMO[row.shinobi] || '🥷';
        lines.push(`${emoji} ${escapeHtml(row.shinobi)} → +${fmt(row.reward)} 🍥`);
        total += row.reward;
      }
      lines.push(`TOTAL +${fmt(total)} 🍥`);
      lines.push('Claim now?');
      const kb = {
        inline_keyboard: [
          [{ text: `✅ ᴄʟᴀɪᴍ ${fmt(total)} 🍥`, callback_data: guard('map_claim_confirm', user.id) }],
          backToMapRow(user.id),
        ],
      };
      await showScreen(chatId, messageId, user, locBody('💰 PENDING PATROL REWARDS', lines), kb);
      return true;
    }

    if (action === 'map_claim_confirm') {
      const result = await claimPendingPatrolRewards(user.id);
      if (result.code === 'none') {
        await answer(cb, 'Nothing to claim.', true);
        return true;
      }
      await answer(cb);
      await showScreen(
        chatId, messageId, user,
        locBody('✅ PATROL REWARDS CLAIMED', [`+${fmt(result.total)} 🍥 added to your balance.`]),
        hokageKeyboard(user.id),
      );
      return true;
    }

    if (action === 'map_patrol_select') {
      await answer(cb);
      const eligible = KINDS.patrol.eligible;
      const own = await ownedNames(user.id);
      const rows = [];
      for (const name of eligible) {
        if (!own.includes(name)) continue;
        rows.push([{
          text: `${EMO[name] || '🥷'} ${name}`,
          callback_data: `map_psel:${name}:${user.id}`,
        }]);
      }
      if (!rows.length) {
        await showScreen(
          chatId, messageId, user,
          locBody('🚪 TEAM PATROL', [
            'No patrol-eligible shinobi owned.',
            'Starter Shinobi / Naruto / Hinata can patrol.',
          ]),
          gateKeyboard(user.id),
        );
        return true;
      }
      rows.push([{ text: '🔙 ʙᴀᴄᴋ', callback_data: guard('map_loc_gate', user.id) }]);
      await showScreen(
        chatId, messageId, user,
        locBody('🚪 TEAM PATROL', [
          'Select a shinobi.',
          'Map patrol rewards are claimed at the Hokage Office.',
        ]),
        { inline_keyboard: rows },
      );
      return true;
    }

    if (action === 'map_psel' && parts.length >= 3) {
      const shinobi = parts[1];
      await answer(cb);
      if (chatId > 0) {
        await showScreen(
          chatId, messageId, user,
          locBody('GROUP COMMAND', ['Patrol works in groups only.']),
          gateKeyboard(user.id),
        );
        return true;
      }
      await db.run(sql`
        INSERT INTO map_activity_source (telegram_id, shinobi, source, created_at)
        VALUES (${user.id}, ${shinobi}, 'map', ${Math.floor(Date.now() / 1000)})
        ON CONFLICT(telegram_id, shinobi) DO UPDATE SET
          source = 'map', created_at = excluded.created_at
      `);
      const r = await runActivity(user, 'patrol', shinobi, chatId);
      let extra = '';
      if (r.body && /DISPATCHED/i.test(r.body)) {
        extra = p('💰 Reward will wait at the Hokage Office.');
      }
      await showScreen(
        chatId, messageId, user,
        p(style(r.body).replace(/\n/g, '<br>')) + extra,
        gateKeyboard(user.id),
      );
      return true;
    }

    if (action === 'map_ichi_cat_ramen') {
      await answer(cb);
      await showScreen(
        chatId, messageId, user,
        locBody('🍜 RAMEN MENU', [
          `Restores chakra (capped at ${MAX_CHAKRA}).`,
          'You are not charged if chakra is already full.',
        ]),
        ramenKeyboard(user.id),
      );
      return true;
    }
    if (action === 'map_ichi_cat_field') {
      await answer(cb);
      await showScreen(
        chatId, messageId, user,
        locBody('⚡ FIELD MEALS', ['Prepared for your next mission or patrol.']),
        fieldMealKeyboard(user.id),
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
        chatId, messageId, user,
        locBody(`✅ ${result.emoji} ${escapeHtml(result.name)}`, [
          `−${fmt(result.cost)} 🍥`,
          `+${result.chakraGained} ⚡ → ${result.chakra}/${MAX_CHAKRA}`,
        ]),
        ichirakuKeyboard(user.id),
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
        chatId, messageId, user,
        locBody(`✅ ${result.emoji} ${escapeHtml(result.name)} prepared`, [
          `−${fmt(result.cost)} 🍥`,
          'Applies to your next mission or patrol.',
        ]),
        ichirakuKeyboard(user.id),
      );
      return true;
    }

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
          chatId, messageId, user,
          locBody('🍖 BBQ', ['No free shinobi to send (or none owned).']),
          bbqKeyboard(user.id),
        );
        return true;
      }
      rows.push([{ text: '🔙 ʙᴀᴄᴋ', callback_data: guard('map_loc_bbq', user.id) }]);
      await showScreen(
        chatId, messageId, user,
        locBody('🍖 SEND TO BBQ', ['Select a shinobi.']),
        { inline_keyboard: rows },
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
        chatId, messageId, user,
        locBody(`🍖 ${EMO[shinobi] || '🥷'} ${escapeHtml(shinobi)} at BBQ`, [
          'Chakra recovers +20 every 30 minutes (catch-up when you open the map).',
        ]),
        bbqKeyboard(user.id),
      );
      return true;
    }

    if (action === 'map_bbq_recall') {
      await answer(cb);
      const sessions = await listBbqSessions(user.id);
      if (!sessions.length) {
        await showScreen(
          chatId, messageId, user,
          locBody('🍖 BBQ', ['No shinobi at the BBQ.']),
          bbqKeyboard(user.id),
        );
        return true;
      }
      const rows = sessions.map((s) => [{
        text: `${EMO[s.shinobi] || '🥷'} ${s.shinobi}`,
        callback_data: `map_bbq_stop:${s.shinobi}:${user.id}`,
      }]);
      rows.push([{ text: '🔙 ʙᴀᴄᴋ', callback_data: guard('map_loc_bbq', user.id) }]);
      await showScreen(
        chatId, messageId, user,
        locBody('🏠 RECALL FROM BBQ', ['Select a shinobi.']),
        { inline_keyboard: rows },
      );
      return true;
    }

    if (action === 'map_bbq_stop' && parts.length >= 3) {
      const shinobi = parts[1];
      await stopBbq(user.id, shinobi);
      await answer(cb);
      await showScreen(
        chatId, messageId, user,
        locBody(`🏠 ${EMO[shinobi] || '🥷'} ${escapeHtml(shinobi)} left BBQ`, []),
        bbqKeyboard(user.id),
      );
      return true;
    }

    if (action === 'map_train_sakura') {
      await answer(cb, 'Sakura training (Tsunade) coming soon.', true);
      return true;
    }

    await answer(cb);
    return true;
  } catch (e) {
    console.error('[map callback]', e);
    try { await answer(cb, 'Something went wrong.', true); } catch (_) {}
    return true;
  }
}
