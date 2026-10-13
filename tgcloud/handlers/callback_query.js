import { handleStudyCallback } from '../lib/study/router.js';
import { handleTopicCallback } from '../lib/topic.js';
import { BotApiError } from 'sdk';
import { api } from '../lib/message_api.js';
import { menus } from '../lib/hnc.js';
import { handleEconomyCallback } from '../lib/economy_handler.js';
import { handleGroupAdminCallback } from '../lib/groupadmin.js';
import { handleAnnounceCallback } from '../lib/announce.js';
import { handleReactionCallback } from '../lib/replybridge.js';
import { handleOwnerCallback } from '../lib/owner_cmds.js';
import { handleWelcomeCallback } from '../lib/welcome_ui.js';
import { handleGiftCallback } from '../lib/gift.js';
import { handleInventoryCallback } from '../lib/inventory.js';
import { handleGamesCallback, isGamesCallback } from '../lib/games/handler.js';
import { handleMapCallback, isMapCallback } from '../lib/map/handler.js';
import { handleSupportCallback } from '../lib/support_inbox.js';

export default async function (cq) {
  if (await handleSupportCallback(cq)) return;
  if (isMapCallback(cq.data)) {
    const handled = await handleMapCallback(cq);
    if (handled) return;
  }

  if (isGamesCallback(cq.data)) {
    const handled = await handleGamesCallback(cq);
    if (handled) return;
  }

  if (await handleStudyCallback(cq)) return;
  if (await handleTopicCallback(cq)) return;
  if (await handleGroupAdminCallback(cq)) return;
  if (await handleAnnounceCallback(cq)) return;
  if (await handleReactionCallback(cq)) return;
  if (await handleOwnerCallback(cq)) return;
  if (await handleWelcomeCallback(cq)) return;
  if (await handleGiftCallback(cq)) return;
  if (await handleInventoryCallback(cq)) return;
  if (await handleEconomyCallback(cq)) return;

  const key = (cq.data || '').replace('hnc:', '');
  const blocks = menus[key];

  await api.answerCallbackQuery({ callback_query_id: cq.id });
  if (!blocks || !cq.message) return;

  try {
    await api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      rich_message: { blocks, skip_entity_detection: true },
    });
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
  }
}
