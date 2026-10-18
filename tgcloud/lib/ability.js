import { style, mention } from './texts.js';

const q = (s) => `<blockquote>${s}</blockquote>`;

export const ROWS = [
  ['⚔️ Sasuke', 'adventurer · /mission → 🍥 300'],
  ['🌸 Sakura', 'booster · /claim bonus grows with level · patrol only (no missions) · healing at Lv. 4'],
  ['🍥 Naruto', 'shadow clones · ×3 on /mission, /patrol · may find Jiraiya · clone window grows with level'],
  ['🐸 Jiraiya', 'protection · /protect → 24h immunity · found via /patrol · trains Naruto'],
  ['👁️ Itachi', 'kill & rob · /kill → 🍥 50–300 · /rob needs a dead target · 5 levels by successful kills · cannot patrol/mission'],
  ['👁️ Hinata', 'byakugan · /byakugan → reveals protection time · once per 24h, private'],
  ['🧠 Mind Transmission', '/mt → hidden message · jutsu owners only'],
  ['🍃 Rank', 'academy → genin → chūnin → jōnin → anbu → kage'],
  ['👤 Profile', '/profile → rank, XP, roster & stats'],
];

// Rich message (HTML table). Styled font, mention on top.
export function abilityHtml(user) {
  const rows = ROWS.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  return style(
    `<p>${mention(user)}</p>` +
    `<p>📖 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐀𝐁𝐈𝐋𝐈𝐓𝐈𝐄𝐒</p>` +
    `<table><tr><th>Shinobi</th><th>Ability</th></tr>${rows}</table>` +
    `<p></p>`,
  );
}

// Classic fallback (no mention; the caller adds it).
export function abilityText() {
  return [
    `📖 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐀𝐁𝐈𝐋𝐈𝐓𝐈𝐄𝐒`,
    ...ROWS.map(([a, b]) => q(`${a}\n${b}`)),
    ``,
  ].join('\n\n');
}

export const abilityKeyboard = (id) => ({
  inline_keyboard: [[{ text: style('Lvl Up'), callback_data: `lv:up:${id}` }]],
});
export const backKeyboard = (id) => ({
  inline_keyboard: [[{ text: style('Back'), callback_data: `lv:ab:${id}` }]],
});
