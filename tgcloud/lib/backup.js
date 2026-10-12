import { db, InputFile, BotApiError } from 'sdk';
import { api } from './message_api.js';
import { sql } from 'sdk/db';
import { OWNER_ID } from './config.js';
import { SOURCE_SNAPSHOT } from './source_snapshot.js';

const MAX_BYTES = 45 * 1024 * 1024; // stay under the 50 MB upload limit

// Manual UTF-8 encoder
function utf8(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

// Blobs can't go into JSON directly, so store them as hex
function replacer(_k, v) {
  if (v instanceof Uint8Array) {
    return { __blob_hex: Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('') };
  }
  return v;
}

async function dumpTables() {
  const metas = await db.all(
    sql`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
  );
  const tables = {};
  for (const m of metas) {
    if (!/^[A-Za-z0-9_]+$/.test(m.name)) continue; // safety: only plain names
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await db.all(sql.raw(`SELECT * FROM "${m.name}" LIMIT 1000 OFFSET ${offset}`));
      rows.push(...page);
      if (page.length < 1000) break;
    }
    tables[m.name] = { create_sql: m.sql, row_count: rows.length, rows };
  }
  return tables;
}

export async function runBackup(requesterChatId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    const tables = await dumpTables();
    const full = utf8(JSON.stringify({ created: stamp, tables }, replacer, 2));

    if (full.length <= MAX_BYTES) {
      await api.sendDocument({
        chat_id: OWNER_ID,
        document: new InputFile(full, `backup-${stamp}.json`, { type: 'application/json' }),
        caption: `Database backup: ${Object.keys(tables).length} table(s)`,
      });
    } else {
      // Too big for one file: send one file per table
      for (const [name, t] of Object.entries(tables)) {
        const bytes = utf8(JSON.stringify({ table: name, ...t }, replacer, 2));
        await api.sendDocument({
          chat_id: OWNER_ID,
          document: new InputFile(bytes, `backup-\( {stamp}- \){name}.json`, { type: 'application/json' }),
        });
      }
    }
    if (requesterChatId !== OWNER_ID) {
      await notice(requesterChatId, 'Backup sent to your DM.');
    }
  } catch (e) {
    console.error('backup failed', e);
    const dmBlocked = e instanceof BotApiError && (e.code === 403 || e.code === 400);
    await notice(requesterChatId, dmBlocked
      ? 'I cannot DM you. Open the bot privately and press Start first.'
      : 'Backup failed. Check the logs.');
  }
}


// Status texts go out as rich messages; plain text only if Telegram refuses the rich one.
async function notice(chatId, text) {
  try {
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: { blocks: [{ type: 'paragraph', text }], skip_entity_detection: true },
    });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    await api.sendMessage({ chat_id: chatId, text });
  }
}

// Sends a bundled snapshot of the project source. Refresh source_snapshot.js
// after changing project files, then redeploy. This does not read the runtime filesystem.
export async function runFullBackup(requesterChatId) {
  if (requesterChatId !== OWNER_ID) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    const bytes = utf8(JSON.stringify({
      format: 'tgcloud-source-snapshot-v1',
      created: stamp,
      note: 'Bundled source snapshot. Refresh and redeploy after source changes.',
      files: SOURCE_SNAPSHOT,
    }, null, 2));
    if (bytes.length > MAX_BYTES) throw new Error('Source snapshot exceeds Telegram upload limit.');
    await api.sendDocument({
      chat_id: OWNER_ID,
      document: new InputFile(bytes, `my_bot_full_source-${stamp}.json`, { type: 'application/json' }),
      caption: `Full source snapshot: ${SOURCE_SNAPSHOT.length} file(s). Includes source, schema, docs and project config; excludes dependencies and secrets.`,
    });
  } catch (e) {
    console.error('full source backup failed', e);
    try {
      await notice(requesterChatId, 'Full source backup failed. Check the deployment logs.');
    } catch (_) {}
  }
}



