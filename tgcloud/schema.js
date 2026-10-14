import { table, integer, text, uniqueIndex, index, sql } from 'sdk/db';

export const users = table('users', {
  telegramId: integer('telegram_id').primaryKey(),
  balance: integer('balance').notNull().default(0),
  lastClaimDate: text('last_claim_date'),
  username: text('username'),
  firstName: text('first_name'),
  xp: integer('xp').notNull().default(0),
  kills: integer('kills').notNull().default(0),
  narutoPatrols: integer('naruto_patrols').notNull().default(0),
  claimStreak: integer('claim_streak').notNull().default(0),
  // 1 = user blocked the bot (set via my_chat_member); cleared on /start
  blocked: integer('blocked').notNull().default(0),
}, (t) => ({
  usernameIdx: index('idx_users_username').on(t.username),
}));

export const inventory = table('inventory', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull(),
  itemType: text('item_type').notNull(),
  itemName: text('item_name').notNull(),
  qty: integer('qty').notNull().default(1),
}, (t) => ({
  owner: uniqueIndex('uidx_inventory_owner_item').on(t.telegramId, t.itemName),
}));

export const purchases = table('purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  updateId: integer('update_id'),
  telegramId: integer('telegram_id').notNull(),
  itemName: text('item_name').notNull(),
  qty: integer('qty').notNull().default(1),
  cost: integer('cost').notNull(),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
}, (t) => ({
  uniqUpdate: uniqueIndex('uidx_purchases_update').on(t.updateId),
}));

export const activities = table('activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull(),
  shinobi: text('shinobi').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('idle'),
  startedAt: integer('started_at').notNull().default(0),
  endsAt: integer('ends_at').notNull().default(0),
  cooldownUntil: integer('cooldown_until').notNull().default(0),
  baseRoll: integer('base_roll').notNull().default(0),
  chatId: integer('chat_id').notNull().default(0),
}, (t) => ({
  owner: uniqueIndex('uidx_activities_owner_shinobi').on(t.telegramId, t.shinobi),
}));

export const groupMembers = table('group_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  telegramId: integer('telegram_id').notNull(),
}, (t) => ({
  uniq: uniqueIndex('uidx_group_members').on(t.chatId, t.telegramId),
}));

// Bot messages in groups waiting to be deleted.
export const cleanup = table('cleanup', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  deleteAt: integer('delete_at').notNull(),
}, (t) => ({
  due: index('idx_cleanup_due').on(t.deleteAt),
}));

export const quizTopicSuggestions = table('quiz_topic_suggestions', {
  suggestionId: integer('suggestion_id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id'),
  userId: integer('user_id').notNull(),
  username: text('username'),
  firstName: text('first_name'),
  suggestionMessageId: integer('suggestion_message_id'),
  topicText: text('topic_text').notNull(),
  storageMessageId: integer('storage_message_id'),
  awwdminMessageId: integer('awwdmin_message_id'),
  status: text('status').notNull().default('pending'),
  showTag: integer('show_tag').notNull().default(1),
  scheduledTime: text('scheduled_time'),
  scheduledDate: text('scheduled_date'),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({ statusIdx: index('idx_qts_status').on(t.status) }));

export const topicEditSessions = table('topic_edit_sessions', {
  userId: integer('user_id').primaryKey(),
  suggestionId: integer('suggestion_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const quizDestinations = table('quiz_destinations', {
  chatId: integer('chat_id').primaryKey(),
  title: text('title'),
  kind: text('kind').notNull().default('group'),
});

export const quizComposeTopics = table('quiz_compose_topics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  topic: text('topic').notNull(),
  scheduledTime: text('scheduled_time').notNull(),
}, (t) => ({ userIdx: index('idx_qct_user').on(t.userId) }));

export const quizComposeSessions = table('quiz_compose_sessions', {
  userId: integer('user_id').primaryKey(),
  state: text('state').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const quizSuggestionSessions = table('quiz_suggestion_sessions', {
  userId: integer('user_id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  promptMessageId: integer('prompt_message_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const topicSettings = table('topic_settings', {
  settingKey: text('setting_key').primaryKey(),
  settingValue: text('setting_value').notNull(),
});

// ---- Study module tables (no foreign keys; relations are plain columns) ----
import { table as _stTable, integer as _stInt, text as _stText, uniqueIndex as _stUniq, index as _stIdx } from 'sdk/db';

export const study_goals = _stTable('study_goals', {
  id: _stInt('id').primaryKey({ autoIncrement: true }),
  chatId: _stInt('chat_id').notNull(),
  userId: _stInt('user_id').notNull(),
  username: _stText('username'),
  firstName: _stText('first_name'),
  goalText: _stText('goal_text'),
  goalDate: _stText('goal_date'),
  status: _stText('status').notNull().default('awaiting_goal'),
  reportText: _stText('report_text'),
  completed: _stInt('completed'),
  updatedAt: _stText('updated_at'),
}, (t) => ({ uq: _stUniq('uq_study_goals').on(t.chatId, t.userId) }));

export const study_duels = _stTable('study_duels', {
  duelId: _stInt('duel_id').primaryKey({ autoIncrement: true }),
  chatId: _stInt('chat_id').notNull(),
  challengerId: _stInt('challenger_id').notNull(),
  challengerUsername: _stText('challenger_username'),
  challengerFirstName: _stText('challenger_first_name'),
  opponentId: _stInt('opponent_id').notNull(),
  opponentUsername: _stText('opponent_username'),
  opponentFirstName: _stText('opponent_first_name'),
  goalText: _stText('goal_text'),
  reportTime: _stText('report_time'),
  status: _stText('status').notNull().default('awaiting_goal'),
  challengerResult: _stInt('challenger_result'),
  opponentResult: _stInt('opponent_result'),
  createdAt: _stText('created_at'),
  updatedAt: _stText('updated_at'),
}, (t) => ({ idx: _stIdx('idx_study_duels_chat_status').on(t.chatId, t.status) }));

export const study_todos = _stTable('study_todos', {
  todoId: _stInt('todo_id').primaryKey({ autoIncrement: true }),
  chatId: _stInt('chat_id').notNull(),
  userId: _stInt('user_id').notNull(),
  username: _stText('username'),
  firstName: _stText('first_name'),
  storageChatId: _stInt('storage_chat_id'),
  storageMessageId: _stInt('storage_message_id'),
  contentType: _stText('content_type'),
  contentText: _stText('content_text'),
  reportHour: _stInt('report_hour'),
  reportMinute: _stInt('report_minute'),
  status: _stText('status').notNull().default('collecting'),
  lastSentDate: _stText('last_sent_date'),
  completed: _stInt('completed'),
  createdAt: _stText('created_at'),
  updatedAt: _stText('updated_at'),
}, (t) => ({
  idxUser: _stIdx('idx_study_todos_user').on(t.chatId, t.userId),
  idxDue: _stIdx('idx_study_todos_due').on(t.status, t.reportHour, t.reportMinute),
}));

export const biology_tracker = _stTable('biology_tracker', {
  id: _stInt('id').primaryKey({ autoIncrement: true }),
  userId: _stInt('user_id').notNull(),
  chapterId: _stText('chapter_id').notNull(),
  revisionCount: _stInt('revision_count').notNull().default(0),
  practiceCount: _stInt('practice_count').notNull().default(0),
  pyqCount: _stInt('pyq_count').notNull().default(0),
  revisionDone: _stInt('revision_done').notNull().default(0),
  practiceDone: _stInt('practice_done').notNull().default(0),
  pyqDone: _stInt('pyq_done').notNull().default(0),
  xpCyclesAwarded: _stInt('xp_cycles_awarded').notNull().default(0),
  updatedAt: _stText('updated_at'),
}, (t) => ({
  uq: _stUniq('uq_biology_tracker').on(t.userId, t.chapterId),
  idxUser: _stIdx('idx_biology_tracker_user').on(t.userId),
}));

// ---- Group admin registration + per-group economy switch ----
// Users registered (via /imfrozen) as bot admins of ONE specific group.
export const groupAdmins = table('group_admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  userId: integer('user_id').notNull(),
  registeredAt: integer('registered_at').notNull(),
}, (t) => ({
  uniq: uniqueIndex('uidx_group_admins').on(t.chatId, t.userId),
}));

// Pending /imfrozen confirmations (expire after 10 minutes).
export const adminConfirmations = table('admin_confirmations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  userId: integer('user_id').notNull(),
  chatTitle: text('chat_title'),
  expiresAt: integer('expires_at').notNull(),
  used: integer('used').notNull().default(0),
}, (t) => ({
  userIdx: index('idx_admin_conf_user').on(t.userId),
}));

// One row per group that ever ran /eco. No row = economy ON (default).
export const groupSettings = table('group_settings', {
  chatId: integer('chat_id').primaryKey(),
  economyEnabled: integer('economy_enabled').notNull().default(1),
  updatedBy: integer('updated_by'),
  updatedAt: integer('updated_at'),
});

// ---- Announce sessions ----
// state: pick_groups | pick_scope | collecting | confirming
export const announceSessions = table('announce_sessions', {
  userId: integer('user_id').primaryKey(),
  // Legacy v1 columns — still in live DB. Multi-target uses announce_targets;
  // app writes chatId:0 / chatTitle:'' placeholders on every insert.
  chatId: integer('chat_id').notNull(),
  chatTitle: text('chat_title'),
  mode: text('mode').notNull().default('admin'),
  // Aligned with live DB DEFAULT so migrate does not flag a constraint change.
  // App always sets state explicitly (pick_groups | pick_scope | collecting | confirming).
  state: text('state').notNull().default('collecting'),
  sendGroups: integer('send_groups').notNull().default(1),
  sendDms: integer('send_dms').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const announceTargets = table('announce_targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  chatId: integer('chat_id').notNull(),
  title: text('title'),
  selected: integer('selected').notNull().default(0),
}, (t) => ({
  userChat: uniqueIndex('uidx_announce_targets_user_chat').on(t.userId, t.chatId),
}));

export const announceItems = table('announce_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  dmMessageId: integer('dm_message_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  userIdx: index('idx_announce_items_user').on(t.userId),
}));

export const announcedMessages = table('announced_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  announcerId: integer('announcer_id').notNull(),
  sourceDmMsgId: integer('source_dm_msg_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  msg: uniqueIndex('uidx_announced_msg').on(t.chatId, t.messageId),
  ann: index('idx_announced_announcer').on(t.announcerId),
}));

export const replyBridge = table('reply_bridge', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminId: integer('admin_id').notNull(),
  adminMsgId: integer('admin_msg_id').notNull(),
  groupChatId: integer('group_chat_id').notNull(),
  userMsgId: integer('user_msg_id').notNull(),
  userId: integer('user_id').notNull(),
  botMsgId: integer('bot_msg_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  adminMsg: uniqueIndex('uidx_reply_bridge_admin_msg').on(t.adminId, t.adminMsgId),
}));

export const knownGroups = table('known_groups', {
  chatId: integer('chat_id').primaryKey(),
  title: text('title'),
  username: text('username'),
  active: integer('active').notNull().default(1),
  // 1 = approved, 0 = disapproved (owner /diss_grp)
  approved: integer('approved').notNull().default(1),
  addedById: integer('added_by_id'),
  addedByName: text('added_by_name'),
  updatedAt: integer('updated_at').notNull(),
});


// XOXO + RPS game tables
// APPEND to schema.js — do not replace existing tables.
// Requires: table, integer, text, uniqueIndex, index from 'sdk/db'


/** Map: pending patrol rewards (claim at Hokage Office). */

/** Map: shinobi resting at BBQ for chakra recovery. */

/** Map: cached Telegram photo file_ids for storage channel messages. */
export const mapMediaCache = table('map_media_cache', {
  storageMessageId: integer('storage_message_id').primaryKey(),
  fileId: text('file_id').notNull(),
});

/** Map gate multi-select: shinobi marked for next patrol dispatch. */
export const mapGateSelection = table('map_gate_selection', {
  telegramId: integer('telegram_id').notNull(),
  shinobi: text('shinobi').notNull(),
}, (t) => ({
  pk: uniqueIndex('uidx_map_gate_sel').on(t.telegramId, t.shinobi),
}));

export const bbqSessions = table('bbq_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull(),
  shinobi: text('shinobi').notNull(),
  bbqStart: integer('bbq_start').notNull().default(0),
  lastRecoveryAt: integer('last_recovery_at').notNull().default(0),
}, (t) => ({
  ownerShinobi: uniqueIndex('uidx_bbq_sessions_owner_shinobi').on(t.telegramId, t.shinobi),
}));

export const pendingPatrolRewards = table('pending_patrol_rewards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull(),
  shinobi: text('shinobi').notNull(),
  kind: text('kind').notNull().default('patrol'),
  reward: integer('reward').notNull().default(0),
  completedAt: integer('completed_at').notNull().default(0),
  claimed: integer('claimed').notNull().default(0),
}, (t) => ({
  ownerShinobi: index('idx_pending_patrol_owner').on(t.telegramId, t.shinobi, t.claimed),
}));

/** Map: prepared field meal for next mission/patrol (one slot per user via shinobi='*'). */
export const fieldMeals = table('field_meals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull(),
  shinobi: text('shinobi').notNull().default('*'),
  mealKey: text('meal_key').notNull(),
  preparedAt: integer('prepared_at').notNull().default(0),
}, (t) => ({
  ownerShinobi: uniqueIndex('uidx_field_meals_owner_shinobi').on(t.telegramId, t.shinobi),
}));

export const gameLobbies = table('game_lobbies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id'),
  creatorId: integer('creator_id').notNull(),
  playerXId: integer('player_x_id'),
  playerOId: integer('player_o_id'),
  playerXUsername: text('player_x_username'),
  playerXFirstName: text('player_x_first_name'),
  playerOUsername: text('player_o_username'),
  playerOFirstName: text('player_o_first_name'),
  status: text('status').notNull(),
  stake: integer('stake').notNull().default(0),
  pot: integer('pot').notNull().default(0),
  board: text('board').notNull().default('["","","","","","","","",""]'),
  currentTurn: text('current_turn'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  turnStartedAt: integer('turn_started_at'),
  winnerId: integer('winner_id'),
  result: text('result'),
  stakesReserved: integer('stakes_reserved').notNull().default(0),
  kind: text('kind').notNull().default('open'),
  gameType: text('game_type').notNull().default('xoxo'),
  gameState: text('game_state').notNull().default('{}'),
}, (t) => ({
  chatIdx: index('idx_game_lobbies_chat').on(t.chatId),
  statusIdx: index('idx_game_lobbies_status').on(t.status),
}));

export const gameActivePlayers = table('game_active_players', {
  userId: integer('user_id').primaryKey(),
  lobbyId: integer('lobby_id').notNull(),
});

export const gameMatches = table('game_matches', {
  lobbyId: integer('lobby_id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  playerXId: integer('player_x_id'),
  playerOId: integer('player_o_id'),
  stake: integer('stake'),
  pot: integer('pot'),
  result: text('result'),
  winnerId: integer('winner_id'),
  finishedAt: integer('finished_at').notNull(),
  gameType: text('game_type').notNull().default('xoxo'),
});

export const xoxoStats = table('xoxo_stats', {
  userId: integer('user_id').primaryKey(),
  games: integer('games').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  coinsWon: integer('coins_won').notNull().default(0),
  coinsLost: integer('coins_lost').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
});

export const rpsStats = table('rps_stats', {
  userId: integer('user_id').primaryKey(),
  games: integer('games').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  coinsWon: integer('coins_won').notNull().default(0),
  coinsLost: integer('coins_lost').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
});

/** Idempotent stake/payout keys (replaces Python transactions for games). */
export const gameTx = table('game_tx', {
  key: text('key').primaryKey(),
  createdAt: integer('created_at').notNull(),
});

// Persistent support inbox routing. Existing topics and conversation history are retained.
export const supportConversations = table('support_conversations', {
  userId: integer('user_id').primaryKey(),
  // NULL only while a first-topic creation reservation is in progress.
  threadId: integer('thread_id'),
  status: text('status').notNull().default('stopped'),
  displayName: text('display_name').notNull().default('User'),
  username: text('username'),
  lastConfirmationMessageId: integer('last_confirmation_message_id'),
  isBanned: integer('is_banned').notNull().default(0),
  introMessageId: integer('intro_message_id'),
  unbanPromptAt: integer('unban_prompt_at').notNull().default(0),
  unbanRequestAt: integer('unban_request_at').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  thread: uniqueIndex('uidx_support_conversations_thread').on(t.threadId),
}));

// Bidirectional message IDs let an admin's topic reply quote the matching user DM.
export const supportMessageLinks = table('support_message_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  threadId: integer('thread_id').notNull(),
  supportMessageId: integer('support_message_id').notNull(),
  userMessageId: integer('user_message_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  uniqueTopicMessage: uniqueIndex('uidx_support_message_links_topic_message').on(t.threadId, t.supportMessageId),
  userIdx: index('idx_support_message_links_user').on(t.userId),
}));
