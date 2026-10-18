import { handleStudyCallback } from '../lib/study/router.js';
import { handleTopicCallback } from '../lib/topic.js';
import { handleHncCallback } from '../lib/hnc.js';
import { handleEconomyCallback } from '../lib/economy_handler.js';
import { handleGroupAdminCallback } from '../lib/groupadmin.js';
import { handleAnnounceCallback } from '../lib/announce.js';
import { handleReactionCallback } from '../lib/replybridge.js';
import { handleOwnerCallback } from '../lib/owner_cmds.js';
import { handleWelcomeCallback } from '../lib/welcome_ui.js';
import { handleGiftCallback } from '../lib/gift.js';
import { handleInventoryCallback } from '../lib/inventory.js';
import {
  handleCloneCallback, isCloneCallback, handleByakuganCallback, isByakuganCallback,
} from '../lib/rpg/combat.js';
import { handleGamesCallback, isGamesCallback } from '../lib/games/handler.js';
import { handleMapCallback, isMapCallback } from '../lib/map/handler.js';
import { handleSupportCallback } from '../lib/support_inbox.js';

export default async function (cq) {
  if (await handleSupportCallback(cq)) return;
  if (await handleHncCallback(cq)) return;
  // Combat callbacks (Shadow Clone activation, private Byakugan report) are
  // routed first so no other handler can claim or delay them.
  if (isCloneCallback(cq.data)) return handleCloneCallback(cq);
  if (isByakuganCallback(cq.data)) return handleByakuganCallback(cq);
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
}
