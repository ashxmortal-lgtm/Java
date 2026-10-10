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
