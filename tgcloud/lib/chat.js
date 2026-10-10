import { api, db } from 'sdk';
import { sql } from 'sdk/db';

export const CLEAN_AFTER = 300; // 5 minutes
// Chat IDs whose bot messages are NOT deleted (exception list, add later).
const EXEMPT_CHATS = new Set();

const now = () => Math.floor(Date.now() / 1000);

export async function trackUser(user) {
  await db.run(sql`INSERT OR IGNORE INTO users (telegram_id, balance) VALUES (${user.id}, 0)`);
  await db.run(sql`UPDATE users SET username = ${user.username ? user.username.toLowerCase() : null}, first_name = ${user.first_name || null} WHERE telegram_id = ${user.id}`);
}

// Group chat IDs are negative; private chats are positive.
async function remember(chatId, sent) {
  if (chatId >= 0 || EXEMPT_CHATS.has(chatId) || !sent || !sent.message_id) return;
  try {
    await db.run(sql`INSERT INTO cleanup (chat_id, message_id, delete_at) VALUES (${chatId}, ${sent.message_id}, ${now() + CLEAN_AFTER})`);
  } catch (e) { console.error(e); }
}

export async function send(chatId, params) {
  const sent = await api.sendMessage({ chat_id: chatId, ...params });
  await remember(chatId, sent);
  return sent;
}

export async function sendRich(chatId, params) {
  const sent = await api.sendRichMessage({ chat_id: chatId, ...params });
  await remember(chatId, sent);
  return sent;
}

// Runs on every incoming message. No scheduler exists, so this is how
// due messages get deleted.
export async function sweepMessages() {
  const due = await db.all(sql`SELECT id, chat_id, message_id FROM cleanup WHERE delete_at <= ${now()} ORDER BY delete_at LIMIT 20`);
  for (const r of due) {
    await db.run(sql`DELETE FROM cleanup WHERE id = ${r.id}`);
    try {
      await api.deleteMessage({ chat_id: r.chat_id, message_id: r.message_id });
    } catch (e) { /* already deleted */ }
  }
}
