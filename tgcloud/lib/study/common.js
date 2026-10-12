// Shared helpers for the Study module.
// IST = UTC+5:30 (no DST). Rich menus use the same block shape as /topic and /hnc.
import { api, BotApiError } from 'sdk';

export const esc = (s) => String(s ?? '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');

export const nowIso = () => new Date().toISOString();

export function istNow(d = new Date()) {
  const t = new Date(d.getTime() + 330 * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`,
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  };
}

export const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
export const fmt12 = (h, m) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
export function nextDate(d) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }

// Accepts "9:45 PM", "9PM", "21:45". A bare "9" is rejected (ambiguous).
export function parseTime(s) {
  const m = String(s || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m || (!m[2] && !m[3])) return null;
  let h = +m[1]; const mi = m[2] ? +m[2] : 0;
  if (mi > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; }
  else if (h > 23) return null;
  return { hour: h, minute: mi };
}

export const plainName = (username, firstName) => (username ? '@' + username : firstName || 'User');

// ---- rich blocks (https://core.telegram.org/bots/api#inputrichmessage) ----
export const bold = (text) => ({ type: 'bold', text });
export const code = (text) => ({ type: 'code', text });
export const para = (...t) => ({ type: 'paragraph', text: t.length === 1 ? t[0] : t });
export const head = (text, size = 2) => ({ type: 'heading', text, size });
export const divider = { type: 'divider' };

export function quoteText(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = (lines.length ? lines : ['']).map((l) => para(l.length ? l : ' '));
  return { type: 'blockquote', blocks };
}

// Rich mention. Same shape the store already sends.
export function mention(u) {
  const name = (u && (u.first_name || u.firstName)) || 'User';
  const id = u && (u.id || u.userId);
  if (!id) return name;
  return { type: 'text_mention', text: name, user: { id, first_name: name } };
}
export const tag = mention;
export const userTag = (id, username, firstName) => mention({ id, username, first_name: firstName });

// Rich message button. style: primary | success | danger | link. callback_data ≤ 64 bytes.
export const btn = (text, data, style) => {
  const b = { text: fit(text, 64), callback_data: data };
  if (style) b.style = style;
  return b;
};
// One row, 1–8 buttons. align: left | center | right.
export const row = (...buttons) => ({ type: 'buttons', buttons, align: 'center' });

export const SHEESH = {
  type: 'footer',
  text: ['────⧼ ', { type: 'url', text: bold('𝑨𝒘𝒘 𒉭 𝒔𝒉𝒆𝒆𝒔𝒉'), url: 'https://t.me/aww_sheesh' }, ' ⧽────'],
};

function fit(s, n) {
  const t = String(s ?? '');
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

export const rp = (id) => (id ? { reply_parameters: { message_id: id, allow_sending_without_reply: true } } : {});

export function sendBlocks(chat_id, blocks, extra = {}) {
  const skip = extra.skipEntities !== false;
  const rest = { ...extra };
  delete rest.skipEntities;
  return api.sendRichMessage({
    chat_id,
    rich_message: skip ? { blocks, skip_entity_detection: true } : { blocks },
    ...rest,
  });
}

export async function editBlocks(chat_id, message_id, blocks) {
  try {
    await api.editMessageText({
      chat_id,
      message_id,
      rich_message: { blocks, skip_entity_detection: true },
    });
  } catch (e) {
    const desc = String((e && (e.description || e.message)) || '');
    if (e instanceof BotApiError && e.code === 400 && /not modified/i.test(desc)) return;
    throw e;
  }
}
