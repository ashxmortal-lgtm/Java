/**
 * Classic /help fallback text. Prefer welcome_ui.buildUserHelpBlocks (rich)
 * which reads from command_registry. This module stays in sync with the registry.
 */
import { OWNER_ID } from './config.js';
import { listCommands, formatCommandList } from './command_registry.js';

export function helpText(user) {
  const userList = formatCommandList(listCommands('user'));
  let s = `📖 𝐇𝐄𝐋𝐏\n\n<blockquote>${userList}</blockquote>`;
  if (user && user.id === OWNER_ID) {
    const own = formatCommandList(listCommands('owner').filter((c) => c.access === 'owner'));
    s += `\n\n👑 𝐎𝐖𝐍𝐄𝐑\n\n<blockquote>${own}</blockquote>`;
  }
  return s;
}
