// ExFrozen (Study) callbacks only. Unknown/gaming callbacks fail safely.
import { api } from '../lib/message_api.js';
import { handleStudyCallback } from '../lib/study/router.js';
import { handleTopicCallback } from '../lib/topic.js';
import { handleHncCallback } from '../lib/hnc.js';
import { handleCommonCallback } from '../lib/common_handler.js';
import { handleGroupAdminCallback } from '../lib/groupadmin.js';
import { handleAnnounceCallback } from '../lib/announce.js';
import { handleReactionCallback } from '../lib/replybridge.js';
import { handleOwnerCallback } from '../lib/owner_cmds.js';
import { handleWelcomeCallback } from '../lib/welcome_ui.js';
import { handleSupportCallback } from '../lib/support_inbox.js';

export default async function (cq) {
  if (await handleSupportCallback(cq)) return;
  if (await handleHncCallback(cq)) return;
  if (await handleStudyCallback(cq)) return;
  if (await handleTopicCallback(cq)) return;
  if (await handleGroupAdminCallback(cq)) return;
  if (await handleAnnounceCallback(cq)) return;
  if (await handleReactionCallback(cq)) return;
  if (await handleOwnerCallback(cq)) return;
  if (await handleWelcomeCallback(cq)) return;
  if (await handleCommonCallback(cq)) return;
  // Unsupported callback (e.g. a gaming button): acknowledge, never crash.
  try { await api.answerCallbackQuery({ callback_query_id: cq.id }); } catch (_) {}
}
