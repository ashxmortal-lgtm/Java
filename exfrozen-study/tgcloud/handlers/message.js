// ExFrozen (Study) message router. Gaming commands are not registered here:
// messages for MissFrozen-only commands fall through and are ignored silently.
import { handleStudyCommand } from '../lib/study/router.js';
import { processReminders } from '../lib/study/reminder.js';
import { sendTrackerLauncher } from '../lib/study/hub.js';
import { handleTopicCommand, handleTopicText } from '../lib/topic.js';
import { api } from '../lib/message_api.js';
import { buildHncMenu } from '../lib/hnc.js';
import { handleCommonCommand } from '../lib/common_handler.js';
import { handleGroupAdminCommand } from '../lib/groupadmin.js';
import { notifyNewUser } from '../lib/ownernotice.js';
import { handleAnnounceCommand, handleAnnounceText } from '../lib/announce.js';
import { handleGroupReplyToBot, handleAdminDmReply } from '../lib/replybridge.js';
import { handleOwnerCommand } from '../lib/owner_cmds.js';
import { handleSupportCommand, handleSupportMessage, handleSupportAdminReply } from '../lib/support_inbox.js';

const MINI_APP_START_COMMANDS = {
  mini_todo: '/todo',
  mini_studytime: '/studytime',
  mini_study: '/study',
  mini_duel: '/duel',
  mini_tracker: '/tracker',
  mini_owner: '/owner',
  owner: '/owner',
};

export default async function (message, ctx) {
  // Study reminders / due tasks: serverless sweep on incoming updates.
  try { await processReminders(); } catch (e) { console.error('[reminder sweep]', e?.description || e); }

  // Fixed, whitelisted deep-link payloads from the Mini App.
  if (message.chat?.type === 'private') {
    const start = String(message.text || '').trim().match(/^\/start(?:@\w+)?\s+(mini_todo|mini_studytime|mini_study|mini_duel|mini_tracker|mini_owner|owner)$/i);
    const key = start && start[1].toLowerCase();
    const command = key && MINI_APP_START_COMMANDS[key];
    if (command) {
      if (key === 'mini_owner' || key === 'owner') {
        await handleSupportCommand({ ...message, text: '/owner' });
        return;
      }
      if (key === 'mini_tracker') {
        await sendTrackerLauncher(message.chat.id);
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

  if (await handleGroupReplyToBot(message)) return;
  if (await handleAdminDmReply(message)) return;
  if (await handleAnnounceText(message)) return;

  if (await handleStudyCommand(message)) return;

  const topicHead = ((message.text || '').split(/[\s@]/)[0] || '').toLowerCase();
  if (topicHead.replace(/^\/(qu|addadmingrp)$/, '/topic') === '/topic') {
    return handleTopicCommand(message);
  }
  if (!(message.text || '').startsWith('/') && (await handleTopicText(message))) return;

  if (await handleAnnounceCommand(message)) return;
  if (await handleOwnerCommand(message)) return;

  const cmd = ((message.text || '').split(/[\s@]/)[0] || '').toLowerCase();
  if (cmd === '/hnc') {
    await api.sendRichMessage({
      chat_id: message.chat.id,
      rich_message: { blocks: buildHncMenu(message.from), skip_entity_detection: true },
    });
    return;
  }

  if (await handleGroupAdminCommand(message)) return; // /imfrozen
  await handleCommonCommand(message); // /start /help /balance /leaderboard /backup*
}
