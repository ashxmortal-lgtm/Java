// Economy commands + store/level-up buttons, restored from the old handlers.
// /start /help /claim /balance /inventory /shinobi_store /buy /mission /patrol /ability /addcoins /backup
import { runBackup, runFullBackup } from "./backup.js";
import { BotApiError } from 'sdk';
import { api } from './message_api.js';
import {
  claimDaily, DAILY_COINS, DAILY_CHAKRA, BONUS_COINS, BONUS_CHAKRA,
  SAKURA_COINS, SAKURA_CHAKRA,
} from './economy.js';
import { render, style, escapeHtml, COIN } from './texts.js';
import { SCREENS, screenText, screenKeyboard, findItem, fmt } from './store.js';
import { handleBuy } from './buy.js';
import { purchase } from './purchase.js';
import { ownedSet, getEquipped, setEquipped } from './rpg/state.js';
import { sendInventory } from './inventory.js';
import { addCoins, OWNER_ID } from './admin.js';
import { runActivity, sweepActivities } from './activities.js';
import { grantStarter, STARTER_NOTICE } from './starter.js';
import { balanceText, trackGroup } from './balance.js';
import { abilityText, abilityKeyboard, backKeyboard } from './ability.js';
import { levelsText, levelsContent } from './levels.js';
import { economyLocked, ECO_LOCKED_TEXT } from './groupadmin.js';
import { richOr, editRichOr, storeContent, abilityContent, groupOnlyContent } from './rich.js';
import { helpText } from './help.js';
import { profileText } from './profile.js';
import { sendWelcome, buildUserHelpBlocks } from './welcome_ui.js';

import {
  handleKill, handleRob, handleProtect, handleByakugan,
  handleCloneCallback, isCloneCallback, handleByakuganCallback, isByakuganCallback,
  sweepClones,
} from '../lib/rpg/combat.js';
import { handleSearchTsuna } from '../lib/rpg/tsunade.js';
import { send, sweepMessages, trackUser } from './chat.js';

const BOT_USERNAME = 'exfrozen_bot';

function reply(message, body, extra = {}) {
  return send(message.chat.id, {
    text: render(message.from, body),
    parse_mode: 'HTML',
    ...extra,
  });
}

function claimBody(r) {
  const bar = '●'.repeat(r.streak) + '○'.repeat(7 - r.streak);
  if (!r.claimed) {
    return `⏳ 𝐀𝐋𝐑𝐄𝐀𝐃𝐘 𝐂𝐋𝐀𝐈𝐌𝐄𝐃\n\nCome back after 12:00 AM IST.\n\nStreak: ${r.streak}/7  ${bar}\nBalance: ${fmt(r.balance)} 🍥`;
  }
  let s = `✅ 𝐃𝐀𝐈𝐋𝐘 𝐂𝐋𝐀𝐈𝐌\n\n+${fmt(DAILY_COINS)} ${COIN}\n+chakra x ${DAILY_CHAKRA} ⚡`;
  if (r.sakura) {
    s += `\n\n🌸 𝐒𝐀𝐊𝐔𝐑𝐀 𝐁𝐎𝐎𝐒𝐓\n+${fmt(r.sakuraCoins ?? SAKURA_COINS)} ${COIN}\n+chakra x ${r.sakuraChakra ?? SAKURA_CHAKRA} ⚡`;
  }
  if (r.bonus) {
    s += `\n\n🎉 𝐃𝐀𝐘 𝟕 𝐁𝐎𝐍𝐔𝐒\n+${fmt(BONUS_COINS)} ${COIN}\n+chakra x ${BONUS_CHAKRA} ⚡`;
  }
  s += `\n\nStreak: ${r.streak}/7  ${bar}\nBalance: ${fmt(r.balance)} 🍥`;
  if (r.chakraFailed) s += `\n\n⚠️ Chakra couldn't be added. Contact the owner.`;
  return s;
}

// Finished missions/patrols: group reminder + short DM.
async function announceDone() {
  for (const r of await sweepActivities()) {
    const who = { id: r.id, first_name: r.name };
    if (r.chatId && r.chatId < 0) {
      try {
        await send(r.chatId, { text: render(who, r.reminder), parse_mode: 'HTML' });
      } catch (e) { console.error(e); }
    }
    try {
      await send(r.id, { text: render(who, r.dm), parse_mode: 'HTML' });
    } catch (e) { /* user never started the bot in DM */ }
  }
}

// Everything that touches coins, shinobi, inventory or rewards. /start and /help stay open.
const ECONOMY_CMDS = new Set([
  'balance', 'inventory', 'profile', 'claim', 'daily', 'shinobi_store', 'buy',
  'mission', 'patrol', 'map', 'ability', 'abilities', 'addcoins',
  'kill', 'rob', 'protect', 'byakugan', 'mt', 'gift', 'gift_store',
  'search_tsuna',
  'hug', 'slap', 'punch', 'pat',
  'xoxo', 'rps', 'games', 'xoxo_stats', 'rps_stats',
]);

export async function handleEconomyCommand(message, ctx) {
  // ===== /backup command =====
  const backupCmd = (message.text ?? "").split(/\s+/)[0].split("@")[0].toLowerCase();
  if (backupCmd === "/backup_all") {
    if (message.from?.id !== OWNER_ID) return;
    await runFullBackup(message.chat.id);
    return;
  }
  if (backupCmd === "/backup") {
    if (message.from?.id !== OWNER_ID) return;
    await runBackup(message.chat.id);
    return;
  }
  // ===== end /backup =====
  // No scheduler: cleanup, reminders and expired clone windows run on every incoming message.
  try { await sweepMessages(); } catch (e) { console.error(e); }
  try { await announceDone(); } catch (e) { console.error(e); }
  try { await sweepClones(); } catch (e) { console.error(e); }

  const text = message.text;
  const user = message.from;
  if (!text || !text.startsWith('/') || !user || user.is_bot) return;

  const head = text.split(/\s+/)[0].slice(1);
  const [rawCmd, target] = head.split('@');
  if (target && target.toLowerCase() !== BOT_USERNAME) return;
  const cmd = rawCmd.toLowerCase();

  // Per-group economy switch (/eco off): economy commands are refused in that group.
  if (ECONOMY_CMDS.has(cmd) && message.chat.type !== 'private') {
    let locked = false;
    try { locked = await economyLocked(message.chat.id); } catch (e) { console.error(e); }
    if (locked) {
      try {
        await send(message.chat.id, {
          text: ECO_LOCKED_TEXT,
          parse_mode: 'HTML',
          reply_parameters: { message_id: message.message_id },
        });
      } catch (e) { console.error(e); }
      return;
    }
  }

  try {
    try { await trackUser(user); } catch (e) { console.error(e); }
    try { await trackGroup(message); } catch (e) { console.error(e); }
    let starterNew = false;
    try { starterNew = await grantStarter(user); } catch (e) { console.error(e); }
    if (starterNew) await reply(message, STARTER_NOTICE);

    if (cmd === 'start') {
      await sendWelcome(message.chat.id, user);
      return;
    } else if (cmd === 'help') {
      try {
        const blocks = await buildUserHelpBlocks(user);
        await api.sendRichMessage({
          chat_id: message.chat.id,
          rich_message: { blocks },
        });
      } catch (e) {
        console.error('help rich failed:', e?.description || e);
        await reply(message, helpText(user));
      }
    } else if (cmd === 'ability' || cmd === 'abilities') {
      // rich blocks + rich button; classic layout if Telegram refuses
      await richOr(message.chat.id, user, abilityContent(user.id), () =>
        reply(message, abilityText(), { reply_markup: abilityKeyboard(user.id) }));
    } else if (cmd === 'shinobi_store') {
      await richOr(message.chat.id, user, await storeContent('main', user.id), () =>
        reply(message, screenText('main'), { reply_markup: screenKeyboard('main', user.id) }));
    } else if (cmd === 'mission' || cmd === 'patrol') {
      if (message.chat.type === 'private') {
        await richOr(message.chat.id, user, groupOnlyContent(cmd), () =>
          reply(message, `「𝐆𝐑𝐎𝐔𝐏 𝐂𝐎𝐌𝐌𝐀𝐍𝐃」\n\n/${cmd} works in groups only.\n\n» Use it in a group where I am a member.`));
      } else {
        const arg = text.trim().split(/\s+/).slice(1).join(' ');
        const r = await runActivity(user, cmd, arg || null, message.chat.id);
        await send(message.chat.id, {
          text: style(r.body),
          parse_mode: 'HTML',
          reply_parameters: { message_id: message.message_id },
        });
        for (const d of r.dms) {
          try {
            await send(user.id, { text: render(user, d), parse_mode: 'HTML' });
          } catch (e) { /* user never started the bot in DM */ }
        }
      }
    } else if (cmd === 'buy') {
      const body = await handleBuy(user, text, ctx?.update?.update_id);
      if (body) {
        await reply(message, body, {
          reply_parameters: { message_id: message.message_id },
        });
      }
    } else if (cmd === 'addcoins') {
      if (user.id !== OWNER_ID) return;
      await reply(message, await addCoins(message, text));
    } else if (cmd === 'inventory') {
      await sendInventory(message.chat.id, user);
    } else if (cmd === 'kill') {
      await handleKill(message);
    } else if (cmd === 'rob') {
      await handleRob(message);
    } else if (cmd === 'protect') {
      await handleProtect(message);
    } else if (cmd === 'byakugan') {
      await handleByakugan(message);
    } else if (cmd === 'search_tsuna') {
      await send(message.chat.id, {
        text: style(await handleSearchTsuna(message)),
        parse_mode: 'HTML',
        reply_parameters: { message_id: message.message_id },
      });
    } else if (cmd === 'claim' || cmd === 'daily') {
      if (message.chat.type !== 'private') {
        await reply(message, `Please use /Claim in the bot's DM: @${BOT_USERNAME}`);
        return;
      }
      await reply(message, claimBody(await claimDaily(user.id)));
    } else if (cmd === 'balance') {
      await send(message.chat.id, {
        text: style(await balanceText(message)),
        parse_mode: 'HTML',
      });
    } else if (cmd === 'profile') {
      const profileAppButton = message.chat.type === 'private'
        ? { reply_markup: { inline_keyboard: [[{
          text: 'Open Profile Mini App',
          web_app: { url: 'https://app8868570312.tgcloud.ai/profile' },
        }]] } }
        : {};
      await reply(message, await profileText(user), profileAppButton);
    }
  } catch (e) {
    console.error(e);
    if (!(e instanceof BotApiError)) {
      let msg = 'Something went wrong. Try again later.';
      if (user.id === OWNER_ID) {
        msg += `\n\n<code>${escapeHtml(String(e && e.message ? e.message : e).replace(/\s+/g, ' ').slice(0, 300))}</code>`;
      }
      try { await reply(message, msg); } catch (_) {}
    }
  }
}

// Classic edit, used only if Telegram refuses the rich edit.
async function classicEdit(msg, text, markup) {
  try {
    await api.editMessageText({
      chat_id: msg.chat.id, message_id: msg.message_id,
      text, parse_mode: 'HTML', reply_markup: markup,
    });
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
  }
}

export async function handleEconomyCallback(cb) {
  const answer = (text, show_alert = false) =>
    api.answerCallbackQuery({ callback_query_id: cb.id, ...(text ? { text, show_alert } : {}) });

  const [kind, a, b] = String(cb.data || '').split(':');
  const msg = cb.message;
  const isStore = kind === 'store' && SCREENS.includes(a);
  const isLv = kind === 'lv' && (a === 'up' || a === 'ab');
  const isBuy = kind === 'sb';
  const isEquip = kind === 'seq';
  if (!(isStore || isLv || isBuy || isEquip)) return false;
  if (!msg) {
    await answer();
    return true;
  }
  // Buttons on old store/ability messages stop working while the group's economy is off.
  if (msg.chat.type !== 'private') {
    let locked = false;
    try { locked = await economyLocked(msg.chat.id); } catch (e) { console.error(e); }
    if (locked) {
      await api.answerCallbackQuery({ callback_query_id: cb.id, text: ECO_LOCKED_TEXT, show_alert: true });
      return true;
    }
  }
  if (cb.from.id !== Number(b)) {
    await answer("This menu isn't yours. Send the command to open your own.");
    return true;
  }
  try {
    if (isBuy || isEquip) {
      // Shinobi Store actions — purchase() is duplicate-tap safe (unique
      // inventory index + grant-before-charge), so rapid taps charge once.
      const item = findItem(a);
      if (!item || item.type !== 'shinobi') {
        await answer('Unknown shinobi.', true);
        return true;
      }
      if (isEquip) {
        const own = await ownedSet(cb.from.id);
        if (!own.has(item.name)) {
          await answer('You do not own this shinobi yet.', true);
          return true;
        }
        if ((await getEquipped(cb.from.id)) === item.name) {
          await answer(`${item.name} is already equipped.`);
          return true;
        }
        await setEquipped(cb.from.id, item.name);
        await answer(`${item.name} equipped! 👤`);
      } else {
        const r = await purchase(cb.from.id, null, {
          type: item.type, name: item.name, qty: 1, cost: item.price, emoji: item.emoji,
        });
        if (r.status === 'owned') {
          await answer('You already own this shinobi — no coins were charged.', true);
          return true;
        }
        if (r.status === 'insufficient') {
          await answer(`Not enough coins: need ${fmt(item.price)} 🍥, have ${fmt(r.balance)} 🍥.`, true);
          return true;
        }
        if (r.status !== 'ok') {
          await answer('Purchase failed — no coins were charged. Try again.', true);
          return true;
        }
        await answer(`${item.name} recruited for ${fmt(item.price)} 🍥! ✅`);
      }
      await editRichOr(msg, cb.from, await storeContent('main', cb.from.id), () =>
        classicEdit(msg, render(cb.from, screenText('main')), screenKeyboard('main', cb.from.id)));
      return true;
    }
    if (isStore) {
      await editRichOr(msg, cb.from, await storeContent(a, cb.from.id), () =>
        classicEdit(msg, render(cb.from, screenText(a)), screenKeyboard(a, cb.from.id)));
    } else if (a === 'up') {
      await editRichOr(msg, cb.from, await levelsContent(cb.from), async () =>
        classicEdit(msg, await levelsText(cb.from), backKeyboard(cb.from.id)));
    } else {
      await editRichOr(msg, cb.from, abilityContent(cb.from.id), () =>
        classicEdit(msg, render(cb.from, abilityText()), abilityKeyboard(cb.from.id)));
    }
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400)) {
      console.error(e);
      await answer('Something went wrong. Try again.');
      return true;
    }
  }
  await answer();
  return true;
}
