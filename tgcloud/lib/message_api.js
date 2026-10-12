import { api as telegramApi } from 'sdk';
import { styleOutgoingPayload } from './message_style.js';

// Apply the project's default message font and button color at the Telegram
// API boundary so direct sends, edits, rich messages, and callback alerts agree.
export const api = new Proxy(telegramApi, {
  get(target, property) {
    const method = Reflect.get(target, property, target);
    if (typeof method !== 'function') return method;
    return (...args) => {
      if (args.length > 0) args[0] = styleOutgoingPayload(args[0]);
      return Reflect.apply(method, target, args);
    };
  },
});
