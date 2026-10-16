import { handleStudyCommand } from '../lib/study/router.js';
import { handleTopicCommand, handleTopicText } from '../lib/topic.js';
import { api } from '../lib/message_api.js';
import { buildHncMenu } from '../lib/hnc.js';
import { handleEconomyCommand } from '../lib/economy_handler.js';
import { handleGroupAdminCommand } from '../lib/groupadmin.js';
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
};

export default async function (message, ctx) {
  // Fixed, whitelisted deep-link payloads let the Mini App launch these commands
  // directly in the bot DM without accepting arbitrary command text from a URL.
  if (message.chat?.type === 'private') {
    const start = String(message.text || '').trim().match(/^\/start(?:@\w+)?\s+(mini_todo|mini_studytime|mini_study|mini_duel)$/i);
    const command = start && MINI_APP_START_COMMANDS[start[1].toLowerCase()];
    if (command) {
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

  if (gameCmd === 'xoxo_cancel' || gameCmd === 'cancel_xoxo') {
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
