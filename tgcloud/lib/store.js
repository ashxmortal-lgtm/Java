import { style } from './texts.js';

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
  `ᴛᴀᴘ ᴀɴ ɪᴛᴇᴍ ɴᴀᴍᴇ ᴛᴏ ᴄᴏᴘʏ ɪᴛ.`;

export const SCREENS = ['main', 'jutsu', 'chakra'];

export function screenText(screen) {
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
  return (
    `<b>🏯 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐒𝐓𝐎𝐑𝐄</b>\n` +
    `<i>ʀᴇᴄʀᴜɪᴛ ʏᴏᴜʀ ɴᴇxᴛ ꜱʜɪɴᴏʙɪ</i>\n\n` +
    `<b>⚔️ 𝐒𝐇𝐈𝐍𝐎𝐁𝐈</b>\n\n` +
    `<blockquote>${SHINOBI.map(line).join('\n')}</blockquote>` +
    FOOTER
  );
}

/**
 * @param {string} screen
 * @param {number} ownerId
 * @param {{ fromMap?: boolean }} [opts]
 */
export function screenKeyboard(screen, ownerId, opts = {}) {
  const fromMap = !!opts.fromMap;
  const storeCb = (s) => `store:${s}:${ownerId}`;
  const mapStoreCb = (s) => `map_store:${s}:${ownerId}`;
  const cb = fromMap ? mapStoreCb : storeCb;

  if (screen === 'main') {
    const rows = [
      [
        { text: style('Jutsu'), callback_data: cb('jutsu') },
        { text: style('Chakra'), callback_data: cb('chakra') },
      ],
      [{
        text: style('Shinobi Abilities'),
        callback_data: fromMap ? `map_ability:${ownerId}` : `lv:ab:${ownerId}`,
      }],
    ];
    if (fromMap) {
      rows.push([{ text: style('◂ Back to Map'), callback_data: `map_home:${ownerId}` }]);
    }
    return { inline_keyboard: rows };
  }

  const rows = [[{ text: style('Back'), callback_data: cb('main') }]];
  if (fromMap) {
    rows.push([{ text: style('◂ Back to Map'), callback_data: `map_home:${ownerId}` }]);
  }
  return { inline_keyboard: rows };
}
