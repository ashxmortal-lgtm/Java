/**
 * Rich Message helpers for the map layer (Bot API 10.3+).
 * Buttons live inside the rich HTML via <tg-button-row> / <tg-button>,
 * not only as classic reply_markup.
 *
 * Docs: https://core.telegram.org/bots/api#richmessage
 *       https://core.telegram.org/bots/api#richmessagebutton
 */

import { BotApiError } from 'sdk';
import { api } from '../message_api.js';
import { escapeHtml, style, mention } from '../texts.js';

/** Plain text for a button label (no HTML). */
function btnLabel(text) {
  return String(text).replace(/</g, '').replace(/>/g, '');
}

/**
 * One callback button inside a rich message.
 * @param {string} text visible label
 * @param {string} data callback_data (≤64 bytes)
 * @param {'primary'|'success'|'danger'|'link'|null} style
 */
export function richBtn(text, data, btnStyle = null) {
  const styleAttr = btnStyle ? ` style="${btnStyle}"` : '';
  return `<tg-button type="callback_data"${styleAttr} data="${escapeHtml(data)}">${btnLabel(text)}</tg-button>`;
}

/** One row of rich buttons (1–8). align: left|center|right */
export function richRow(buttonsHtml, align = 'left') {
  return `<tg-button-row align="${align}">${buttonsHtml.join('')}</tg-button-row>`;
}

/**
 * Convert classic { inline_keyboard: [[{text, callback_data}]] }
 * into rich <tg-button-row> HTML.
 */
export function keyboardToRichRows(keyboard) {
  const rows = keyboard?.inline_keyboard || [];
  return rows
    .map((row) => {
      const btns = row.map((b) => richBtn(b.text, b.callback_data));
      return richRow(btns);
    })
    .join('');
}

/** Build full rich HTML: body paragraphs + button rows. */
export function richHtml(bodyHtml, keyboard) {
  const body = bodyHtml || '';
  const rows = keyboard ? keyboardToRichRows(keyboard) : '';
  return `${body}${rows}`;
}

/**
 * Send a rich map message. Falls back to classic sendMessage + reply_markup.
 * Returns the sent message object (or null).
 */
export async function sendMapRich(chatId, bodyHtml, keyboard, extra = {}) {
  const html = richHtml(bodyHtml, keyboard);
  try {
    return await api.sendRichMessage({
      chat_id: chatId,
      rich_message: { html },
      ...extra,
    });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    console.error('[map rich send fallback]', e);
    // Classic fallback: strip button tags from body for text, keep reply_markup
    const plain = bodyHtml
      .replace(/<tg-button-row[\s\S]*?<\/tg-button-row>/gi, '')
      .replace(/<tg-button[\s\S]*?<\/tg-button>/gi, '');
    return await api.sendMessage({
      chat_id: chatId,
      text: plain || '🗺️ Map',
      parse_mode: 'HTML',
      reply_markup: keyboard || undefined,
      ...extra,
    });
  }
}

/**
 * Edit an existing message to rich content (+ embedded buttons).
 * Falls back to classic editMessageText / editMessageCaption.
 */
export async function editMapRich(chatId, messageId, bodyHtml, keyboard) {
  const html = richHtml(bodyHtml, keyboard);
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      rich_message: { html },
    });
    return true;
  } catch (e) {
    if (!(e instanceof BotApiError)) console.error('[map rich edit]', e);
  }
  // Classic text edit
  const plain = bodyHtml
    .replace(/<tg-button-row[\s\S]*?<\/tg-button-row>/gi, '')
    .replace(/<tg-button[\s\S]*?<\/tg-button>/gi, '');
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: plain,
      parse_mode: 'HTML',
      reply_markup: keyboard ? JSON.stringify(keyboard) : undefined,
    });
    return true;
  } catch (_) {}
  try {
    await api.editMessageCaption({
      chat_id: chatId,
      message_id: messageId,
      caption: plain,
      parse_mode: 'HTML',
      reply_markup: keyboard ? JSON.stringify(keyboard) : undefined,
    });
    return true;
  } catch (e2) {
    if (!(e2 instanceof BotApiError && e2.code === 400)) console.error(e2);
    // Last resort: new rich message
    await sendMapRich(chatId, bodyHtml, keyboard);
    return false;
  }
}

/** Mention + blank line + body, in bot style font. */
export function mapBody(user, innerHtml) {
  return style(`<p>${mention(user)}</p>${innerHtml}`);
}
