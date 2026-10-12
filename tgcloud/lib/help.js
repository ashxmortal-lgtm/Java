import { OWNER_ID } from './admin.js';

// Add one line here for every new command.
const COMMANDS = [
  ['/start', 'welcome message'],
  ['/claim', 'daily reward and streak (also /daily)'],
  ['/balance', 'your coins, rank and chakra'],
  ['/inventory', 'your shinobi, jutsu and chakra'],
  ['/shinobi_store', 'browse the store'],
  ['/buy [item name]', 'buy a shinobi or jutsu'],
  ['/buy chakra [amount]', 'buy chakra, minimum 100'],
  ['/mission [shinobi]', 'group only: 3 hour mission'],
  ['/patrol [shinobi]', 'group only: 1 hour patrol'],
  ['/ability', 'abilities of every shinobi'],
  ['/help', 'this list'],
];

const OWNER_COMMANDS = [
  ['/addcoins', 'add coins: reply, ID or @username'],
];

export function helpText(user) {
  const list = COMMANDS.map(([c, d]) => `${c} — ${d}`).join('\n');
  let s = `📖 𝐇𝐄𝐋𝐏\n\n<blockquote>${list}</blockquote>`;
  if (user.id === OWNER_ID) {
    const own = OWNER_COMMANDS.map(([c, d]) => `${c} — ${d}`).join('\n');
    s += `\n\n👑 𝐎𝐖𝐍𝐄𝐑\n\n<blockquote>${own}</blockquote>`;
  }
  return s;
}
