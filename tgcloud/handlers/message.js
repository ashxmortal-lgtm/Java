import { handleStudyCommand } from '../lib/study/router.js';
import { sendTrackerLauncher } from '../lib/study/hub.js';
import { handleTopicCommand, handleTopicText } from '../lib/topic.js';
import { api } from '../lib/message_api.js';
import { buildHncMenu } from '../lib/hnc.js';
import { handleEconomyCommand } from '../lib/economy_handler.js';
import { handleGroupAdminCommand, economyLocked, ECO_LOCKED_TEXT } from '../lib/groupadmin.js';
import { notifyNewUser } from '../lib/ownernotice.js';
import { handleAnnounceCommand, handleAnnounceText } from '../lib/announce.js';
import { handleGroupReplyToBot, handleAdminDmReply } from '../lib/replybridge.js';
import { handleOwnerCommand } from '../lib/owner_cmds.js';
import { handleMtCommand } from '../lib/mt.js';
import { handleGiftCommand } from '../lib/gift.js';
import { handleSocialCommand } from '../lib/social.js';
import {
  handleXoxoCommand,
  handleRpsCommand,
  handleGamesCommand,
  handleCancelCommand,
  handleStatsCommand,
  handleCustomStakeText,
} from '../lib/games/handler.js';
import { handleMapCommand, mapSweep } from '../lib/map/handler.js';
import { handleSupportCommand, handleSupportMessage, handleSupportAdminReply } from '../lib/support_inbox.js';

const MINI_APP_START_COMMANDS = {
  mini_todo: '/todo',
  mini_studytime: '/studytime',
  mini_study: '/study',
  mini_duel: '/duel',
  mini_map: '/map',
  mini_tracker: '/tracker',
};

export default async function (message, ctx) {
  // Fixed, whitelisted deep-link payloads let the Mini App launch these commands
  // directly in the bot DM without accepting arbitrary command text from a URL.
  if (message.chat?.type === 'private') {
    const start = String(message.text || '').trim().match(/^\/start(?:@\w+)?\s+(mini_todo|mini_studytime|mini_study|mini_duel|mini_map|mini_tracker)$/i);
    const key = start && start[1].toLowerCase();
    const command = key && MINI_APP_START_COMMANDS[key];
    if (command) {
      if (key === 'mini_tracker') {
        await sendTrackerLauncher(message.chat.id);
        return;
      }
      if (key === 'mini_map') {
        await handleMapCommand({ ...message, text: '/map' });
        return;
      }
      await handleStudyCommand({ ...message, text: command });
      return;
    }
  }

  if (await handleSupportCommand(message)) return;
  if (await handleSupportAdminReply(message)) return;
  const supportMessageHandled = await handleSupportMessage(message);
  if (supportMessageHandled && message.chat?.type === 'private') return;

  await notifyNewUser(message);

  const gameCmd = (message.text || '')
    .trim()
    .split(/\s+/)[0]
    .split('@')[0]
    .replace(/^\/+/, '')
    .toLowerCase();

  if (gameCmd === 'xoxo_cancel' || gameCmd === 'cancel_xoxo' || gameCmd === 'rps_cancel' || gameCmd === 'cancel_rps') {
    return await handleCancelCommand(message);
  }

  if (await handleGroupReplyToBot(message)) return;
  if (await handleAdminDmReply(message)) return;
  if (await handleAnnounceText(message)) return;

  try {
    if (await handleCustomStakeText(message)) return;
  } catch (e) {
    console.error(e);
  }

  if (await handleStudyCommand(message)) return;

  const topicHead = ((message.text || '').split(/[\s@]/)[0] || '').toLowerCase();
  if (topicHead.replace(/^\/(qu|addadmingrp)$/, '/topic') === '/topic') {
    return handleTopicCommand(message);
  }
  if (!(message.text || '').startsWith('/') && (await handleTopicText(message))) return;

  if (await handleAnnounceCommand(message)) return;
  if (await handleOwnerCommand(message)) return;
  if (await handleMtCommand(message)) return;

  // When /eco is off in a group, lock the extra economy-related commands listed by the owner.
  if (message.chat?.type !== 'private') {
    const ecoExtra = new Set([
      'map', 'gift', 'gift_store', 'hug', 'slap', 'punch', 'pat',
      'xoxo', 'rps', 'games', 'xoxo_stats', 'rps_stats',
    ]);
    if (ecoExtra.has(gameCmd)) {
      let locked = false;
      try { locked = await economyLocked(message.chat.id); } catch (_) {}
      if (locked) {
        try {
          await api.sendMessage({
            chat_id: message.chat.id,
            text: ECO_LOCKED_TEXT,
            reply_parameters: { message_id: message.message_id },
          });
        } catch (_) {}
        return;
      }
    }
  }

  if (await handleGiftCommand(message)) return;
  if (await handleSocialCommand(message)) return;

  if (gameCmd === 'xoxo') return await handleXoxoCommand(message);
  if (gameCmd === 'rps') return await handleRpsCommand(message);
  if (gameCmd === 'games') return await handleGamesCommand(message);
  if (gameCmd === 'xoxo_stats') return await handleStatsCommand(message, 'xoxo');
  if (gameCmd === 'rps_stats') return await handleStatsCommand(message, 'rps');

  const cmd = ((message.text || '').split(/[\s@]/)[0] || '').toLowerCase();

  if (cmd === '/map') {
    try {
      await mapSweep(message.from?.id);
    } catch (e) {
      console.error(e);
    }
    return await handleMapCommand(message);
  }

  if (cmd === '/hnc') {
    await api.sendRichMessage({
      chat_id: message.chat.id,
      rich_message: {
        blocks: buildHncMenu(message.from),
        skip_entity_detection: true,
      },
    });
    return;
  }

  if (await handleGroupAdminCommand(message)) return;

  await handleEconomyCommand(message, ctx);
}
