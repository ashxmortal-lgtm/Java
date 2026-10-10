import { api, BotApiError } from 'sdk';
import { render } from '../lib/texts.js';
import { SCREENS, screenText, screenKeyboard } from '../lib/store.js';
import { abilityHtml, abilityText, abilityKeyboard, backKeyboard } from '../lib/ability.js';
import { levelsText } from '../lib/levels.js';

// Try a rich edit first, then the classic edit.
async function show(msg, rich, classic, markup) {
  const base = { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: markup };
  try {
    await api.editMessageText({ ...base, rich_message: { html: rich } });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    await api.editMessageText({ ...base, text: classic, parse_mode: 'HTML' });
  }
}

export default async function (cb) {
  const answer = (text) =>
    api.answerCallbackQuery({ callback_query_id: cb.id, ...(text ? { text } : {}) });

  const [kind, a, b] = String(cb.data || '').split(':');
  const msg = cb.message;
  const isStore = kind === 'store' && SCREENS.includes(a);
  const isLv = kind === 'lv' && (a === 'up' || a === 'ab');
  if (!msg || !(isStore || isLv)) {
    await answer();
    return;
  }
  if (cb.from.id !== Number(b)) {
    await answer("This menu isn't yours. Send the command to open your own.");
    return;
  }
  try {
    if (isStore) {
      await api.editMessageText({
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: render(cb.from, screenText(a)),
        parse_mode: 'HTML',
        reply_markup: screenKeyboard(a, cb.from.id),
      });
    } else if (a === 'up') {
      const classic = await levelsText(cb.from);
      await show(msg, classic.replace(/\n/g, '<br>'), classic, backKeyboard(cb.from.id));
    } else {
      await show(msg, abilityHtml(cb.from), render(cb.from, abilityText()), abilityKeyboard(cb.from.id));
    }
  } catch (e) {
    if (!(e instanceof BotApiError && e.code === 400)) {
      console.error(e);
      await answer('Something went wrong. Try again.');
      return;
    }
  }
  await answer();
}
