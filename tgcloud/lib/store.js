import { style } from './texts.js';
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

// 100 Chakra = 200 coins -> 2 coins per Chakra, minimum 100.
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

// 20000 -> "20,000"
export function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
// 20000 -> "𝟐𝟎,𝟎𝟎𝟎"
export function boldNum(n) {
  return fmt(n).replace(/\d/g, (d) => DIGITS[d]);
}

function line(item) {
  return `✦ <code>${item.name}</code> ${item.emoji} : ${boldNum(item.price)} 🍥`;
}

const FOOTER =
  `\n\n───────────────\n` +
  `🛒 /buy [ɪᴛᴇᴍ ɴᴀᴍᴇ]\n\n` +
  `ᴛᴀᴘ ᴀɴ ɪᴛᴇᴍ ɴᴀᴍᴇ ᴛᴏ ᴄᴏᴘʏ ɪᴛ.`;

export const SCREENS = ['main', 'jutsu', 'chakra'];

export function screenText(screen) {
  if (screen === 'jutsu') {
    return `🌀 𝐉𝐔𝐓𝐒𝐔\n\n` + JUTSU.map(line).join('\n') + FOOTER;
  }
  if (screen === 'chakra') {
    return `⚡ 𝐂𝐇𝐀𝐊𝐑𝐀\n\n` +
      `✦ <code>Chakra</code> × 100 : ${boldNum(100 * CHAKRA_RATE)} 🍥` + FOOTER;
  }
  return (
    `🏯 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐒𝐓𝐎𝐑𝐄\n` +
    `ʀᴇᴄʀᴜɪᴛ ʏᴏᴜʀ ɴᴇxᴛ ꜱʜɪɴᴏʙɪ\n\n` +
    `⚔️ 𝐒𝐇𝐈𝐍𝐎𝐁𝐈\n\n` +
    SHINOBI.map(line).join('\n') + FOOTER
  );
}

// callback_data = "store:<screen>:<ownerId>" (well under the 64-byte limit)
export function screenKeyboard(screen, ownerId) {
  const cb = (s) => `store:${s}:${ownerId}`;
  if (screen === 'main') {
    return { inline_keyboard: [[
      { text: style('Jutsu'), callback_data: cb('jutsu') },
      { text: style('Chakra'), callback_data: cb('chakra') },
    ]] };
  }
  return { inline_keyboard: [[{ text: style('Back'), callback_data: cb('main') }]] };
}
