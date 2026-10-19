import { style } from './texts.js';
import { MINI_APP_STORE_URL } from './config.js';
// To add a new item later: add one line to SHINOBI or JUTSU.
export const SHINOBI = [
  { name: 'Sasuke', emoji: '⚔️', price: 1500 },
  { name: 'Sakura', emoji: '🌸', price: 1900 },
  { name: 'Naruto', emoji: '🍥', price: 2200 },
  { name: 'Itachi', emoji: '👁️', price: 2600 },
  { name: 'Hinata', emoji: '👁️', price: 20000 },
];
export const JUTSU = [
  { name: 'Mind Transmission Jutsu', emoji: '🧠', price: 1000 },
];

export const CHAKRA_RATE = 2;
export const CHAKRA_MIN = 100;

export const ITEMS = [
  ...SHINOBI.map((i) => ({ ...i, type: 'shinobi' })),
  ...JUTSU.map((i) => ({ ...i, type: 'jutsu' })),
];

export function findItem(name) {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return ITEMS.find((i) => i.name.toLowerCase() === key) || null;
}

const DIGITS = ['𝟎','𝟏','𝟐','𝟑','𝟒','𝟓','𝟔','𝟕','𝟖','𝟗'];

export function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function boldNum(n) {
  return fmt(n).replace(/\d/g, (d) => DIGITS[d]);
}

function line(item) {
  return `✦ <code>${item.name}</code> ${item.emoji} : ${boldNum(item.price)} 🍥`;
}

const FOOTER =
  `\n\n───────────────\n` +
  `🛒 /buy [ɪᴛᴇᴍ ɴᴀᴍᴇ]\n\n` +
  `ᴛᴀᴘ ᴀɴ ɪᴛᴇᴍ ɴᴀᴍᴇ ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏᴘʏ ɪᴛ.`;

export const SCREENS = ['main', 'jutsu', 'chakra'];

export function screenText(screen, balance = null) {
  if (screen === 'jutsu') {
    return (
      `<b>🌀 𝐉𝐔𝐓𝐒𝐔</b>\n\n` +
      `<blockquote>${JUTSU.map(line).join('\n')}</blockquote>` +
      FOOTER
    );
  }
  if (screen === 'chakra') {
    return (
      `<b>⚡ 𝐂𝐇𝐀𝐊𝐑𝐀</b>\n\n` +
      `<blockquote>✦ <code>Chakra</code> × 100 : ${boldNum(100 * CHAKRA_RATE)} 🍥</blockquote>` +
      FOOTER
    );
  }
  const balanceLine = balance == null ? '' : `🍥 Balance: ${fmt(balance)}\n\n`;
  return (
    `<b>🏯 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐒𝐓𝐎𝐑𝐄</b>\n` +
    `<i>ʀᴇᴄʀᴜɪᴛ ʏᴏᴜʀ ɴᴇxᴛ ꜱʜɪɴᴏʙɪ</i>\n\n` +
    balanceLine +
    `<b>⚔️ 𝐒𝐇𝐈𝐍𝐎𝐁𝐈</b>\n\n` +
    `<blockquote>${SHINOBI.map(line).join('\n')}</blockquote>` +
    FOOTER
  );
}

function copyRows(names) {
  const buttons = names.map((name) => ({
    text: style(name),
    copy_text: { text: name },
    style: 'transparent',
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

export function screenKeyboard(screen, ownerId, options = {}) {
  const cb = (s) => `store:${s}:${ownerId}`;
  const { includeMiniApp = false, fromMap = false } = options;
  const navStyle = fromMap ? 'transparent' : 'primary';
  if (screen === 'main') {
    const rows = copyRows(SHINOBI.map((item) => item.name));
    rows.push([
      { text: style('Jutsu'), callback_data: cb('jutsu'), style: navStyle },
      { text: style('Chakra'), callback_data: cb('chakra'), style: navStyle },
    ]);
    if (includeMiniApp) {
      rows.push([{
        text: style('Buy in Mini App'),
        web_app: { url: MINI_APP_STORE_URL },
        style: 'success',
      }]);
    }
    return { inline_keyboard: rows };
  }
  const names = screen === 'jutsu' ? JUTSU.map((item) => item.name) : ['Chakra'];
  return {
    inline_keyboard: [
      ...copyRows(names),
      [{ text: style('Back'), callback_data: cb('main'), style: navStyle }],
    ],
  };
}
