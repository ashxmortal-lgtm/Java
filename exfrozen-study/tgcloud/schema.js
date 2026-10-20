import { table, integer, text, uniqueIndex, index, sql } from 'sdk/db';


// ExFrozen (Study) database schema — app8868570312
// Fresh-database schema: only tables this bot uses. Apply with `npx tgcloud migrate`
// on THIS app's own database. No cross-bot tables.


export const users = table('users', {
  telegramId: integer('telegram_id').primaryKey(),
  // ExFrozen study economy: coins earned ONLY from study tasks/activities.
  balance: integer('balance').notNull().default(0),
  studyCoins: integer('study_coins').notNull().default(0),
  username: text('username'),
  firstName: text('first_name'),
  // 1 = user blocked the bot (set via my_chat_member); cleared on /start
  blocked: integer('blocked').notNull().default(0),
}, (t) => ({
  usernameIdx: index('idx_users_username').on(t.username),
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

export const study_goals = table('study_goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  userId: integer('user_id').notNull(),
  username: text('username'),
  firstName: text('first_name'),
  goalText: text('goal_text'),
  goalDate: text('goal_date'),
  status: text('status').notNull().default('awaiting_goal'),
  reportText: text('report_text'),
  completed: integer('completed'),
  updatedAt: text('updated_at'),
}, (t) => ({ uq: uniqueIndex('uq_study_goals').on(t.chatId, t.userId) }));

export const study_duels = table('study_duels', {
  duelId: integer('duel_id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  challengerId: integer('challenger_id').notNull(),
  challengerUsername: text('challenger_username'),
  challengerFirstName: text('challenger_first_name'),
  opponentId: integer('opponent_id').notNull(),
  opponentUsername: text('opponent_username'),
  opponentFirstName: text('opponent_first_name'),
  goalText: text('goal_text'),
  reportTime: text('report_time'),
  status: text('status').notNull().default('awaiting_goal'),
  challengerResult: integer('challenger_result'),
  opponentResult: integer('opponent_result'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
}, (t) => ({ idx: index('idx_study_duels_chat_status').on(t.chatId, t.status) }));

export const study_todos = table('study_todos', {
  todoId: integer('todo_id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  userId: integer('user_id').notNull(),
  username: text('username'),
  firstName: text('first_name'),
  storageChatId: integer('storage_chat_id'),
  storageMessageId: integer('storage_message_id'),
  contentType: text('content_type'),
  contentText: text('content_text'),
  reportHour: integer('report_hour'),
  reportMinute: integer('report_minute'),
  status: text('status').notNull().default('collecting'),
  lastSentDate: text('last_sent_date'),
  completed: integer('completed'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
}, (t) => ({
  idxUser: index('idx_study_todos_user').on(t.chatId, t.userId),
  idxDue: index('idx_study_todos_due').on(t.status, t.reportHour, t.reportMinute),
}));

export const biology_tracker = table('biology_tracker', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  revisionCount: integer('revision_count').notNull().default(0),
  practiceCount: integer('practice_count').notNull().default(0),
  pyqCount: integer('pyq_count').notNull().default(0),
  revisionDone: integer('revision_done').notNull().default(0),
  practiceDone: integer('practice_done').notNull().default(0),
  pyqDone: integer('pyq_done').notNull().default(0),
  xpCyclesAwarded: integer('xp_cycles_awarded').notNull().default(0),
  updatedAt: text('updated_at'),
}, (t) => ({
  uq: uniqueIndex('uq_biology_tracker').on(t.userId, t.chapterId),
  idxUser: index('idx_biology_tracker_user').on(t.userId),
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

// ---- Frozen Blooded shinobi RPG state (all additive; unix-epoch seconds) ----

/** Per-shinobi persistent state: level, exhaustion, death, robbery, training. */

export const supportMessageLinks = table('support_message_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  threadId: integer('thread_id').notNull(),
  supportMessageId: integer('support_message_id').notNull(),
  userMessageId: integer('user_message_id').notNull(),
  sourceChatId: integer('source_chat_id'),
  sourceThreadId: integer('source_thread_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  uniqueTopicMessage: uniqueIndex('uidx_support_message_links_topic_message').on(t.threadId, t.supportMessageId),
  userIdx: index('idx_support_message_links_user').on(t.userId),
}));

/** Coupon codes created by owner; redeemable by any user once. */

// Declared here so a fresh database gets it via `tgcloud migrate`.
// (reminder.js also keeps its CREATE TABLE IF NOT EXISTS guard for safety.)
export const studyReminders = table('study_reminders', {
  reminderId: integer('reminder_id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  userId: integer('user_id').notNull(),
  username: text('username'),
  firstName: text('first_name'),
  storageChatId: integer('storage_chat_id'),
  storageMessageId: integer('storage_message_id'),
  contentType: text('content_type'),
  contentText: text('content_text'),
  dueAt: integer('due_at'),
  status: text('status').notNull().default('collecting'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
}, (t) => ({
  dueIdx: index('idx_study_reminders_due').on(t.status, t.dueAt),
}));
