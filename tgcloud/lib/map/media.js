/**
 * Map photo helpers — same storage channel as Python map.py.
 * Prefer editMessageMedia when we have a cached file_id; else copyMessage.
 */

import { BotApiError } from 'sdk';
import { api } from '../message_api.js';
import { db } from 'sdk';
import { sql } from 'sdk/db';
import {
  MAP_IMAGE_CHAT_ID,
  MAP_IMAGE_MESSAGE_ID,
  LOCATION_IMAGES,
} from './constants.js';

const memCache = new Map();

async function getCachedFileId(storageMessageId) {
  if (memCache.has(storageMessageId)) return memCache.get(storageMessageId);
  const row = await db.get(
    sql`SELECT file_id FROM map_media_cache WHERE storage_message_id = ${storageMessageId}`,
  );
  if (row?.file_id) {
    memCache.set(storageMessageId, row.file_id);
    return row.file_id;
  }
  return null;
}

async function putCachedFileId(storageMessageId, fileId) {
  if (!fileId) return;
  memCache.set(storageMessageId, fileId);
  await db.run(sql`
    INSERT INTO map_media_cache (storage_message_id, file_id)
    VALUES (${storageMessageId}, ${fileId})
    ON CONFLICT(storage_message_id) DO UPDATE SET file_id = excluded.file_id
  `);
}

/** Extract photo file_id from a copyMessage / sendPhoto result. */
function extractFileId(result) {
  try {
    const msg = result?.result || result;
    const photos = msg?.photo;
    if (Array.isArray(photos) && photos.length) {
      return photos[photos.length - 1].file_id;
    }
  } catch (_) {}
  return null;
}

/**
 * Show main map or location photo.
 * Tries in-place editMessageMedia; falls back to copyMessage (new message).
 * Returns { ok, messageId } where messageId is the visible map message.
 */
export async function showMapPhoto({
  chatId,
  messageId = null,
  storageMessageId = MAP_IMAGE_MESSAGE_ID,
  caption,
  replyMarkup,
}) {
  const markup =
    replyMarkup != null
      ? typeof replyMarkup === 'string'
        ? replyMarkup
        : JSON.stringify(replyMarkup)
      : undefined;

  const fileId = await getCachedFileId(storageMessageId);

  if (fileId && messageId) {
    try {
      const media = {
        type: 'photo',
        media: fileId,
        caption: caption || '',
        parse_mode: 'HTML',
      };
      const payload = {
        chat_id: chatId,
        message_id: messageId,
        media: JSON.stringify(media),
      };
      if (markup) payload.reply_markup = markup;
      await api.editMessageMedia(payload);
      return { ok: true, messageId };
    } catch (e) {
      if (!(e instanceof BotApiError)) console.error('[map editMessageMedia]', e);
    }
  }

  // Caption-only edit if we already have a message and no usable file_id path
  if (messageId && !fileId) {
    try {
      await api.editMessageCaption({
        chat_id: chatId,
        message_id: messageId,
        caption: caption || '',
        parse_mode: 'HTML',
        ...(markup ? { reply_markup: markup } : {}),
      });
      return { ok: true, messageId };
    } catch (_) {
      try {
        await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text: caption || '',
          parse_mode: 'HTML',
          ...(markup ? { reply_markup: markup } : {}),
        });
        return { ok: true, messageId };
      } catch (e2) {
        if (!(e2 instanceof BotApiError)) console.error('[map edit text]', e2);
      }
    }
  }

  // copyMessage from storage channel (seeds file_id cache)
  try {
    if (messageId) {
      try {
        await api.deleteMessage({ chat_id: chatId, message_id: messageId });
      } catch (_) {}
    }
    const result = await api.copyMessage({
      chat_id: chatId,
      from_chat_id: MAP_IMAGE_CHAT_ID,
      message_id: storageMessageId,
      caption: caption || '',
      parse_mode: 'HTML',
      ...(markup ? { reply_markup: markup } : {}),
    });
    const fid = extractFileId(result);
    if (fid) await putCachedFileId(storageMessageId, fid);
    const newId = result?.result?.message_id || result?.message_id || null;
    return { ok: true, messageId: newId };
  } catch (e) {
    console.error('[map copyMessage]', e);
    // Last resort: plain text
    try {
      const sent = await api.sendMessage({
        chat_id: chatId,
        text: caption || '🗺️ Map',
        parse_mode: 'HTML',
        ...(markup ? { reply_markup: markup } : {}),
      });
      return { ok: true, messageId: sent?.message_id || sent?.result?.message_id || null };
    } catch (e2) {
      console.error('[map sendMessage fallback]', e2);
      return { ok: false, messageId: null };
    }
  }
}

export function storageIdForLocation(locKey) {
  if (locKey == null || locKey === 'home') return MAP_IMAGE_MESSAGE_ID;
  const mid = LOCATION_IMAGES[locKey];
  // null → reuse main map image; missing key → main map image
  if (mid == null) return MAP_IMAGE_MESSAGE_ID;
  return mid;
}

export { MAP_IMAGE_MESSAGE_ID, MAP_IMAGE_CHAT_ID };
