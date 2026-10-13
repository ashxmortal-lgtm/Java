import { style, mention } from './texts.js';

const q = (s) => `<blockquote>${s}</blockquote>`;

/** Compact rows so the rich table stays more horizontal. */
export const ROWS = [
  ['⚔️ Sasuke', 'adventurer · /mission → 300 🍥'],
  ['🌸 Sakura', 'booster · +100 🍥 / +50 ⚡ daily·mission·patrol'],
  ['🍥 Naruto', 'clones · ×3 mission/patrol · may find Jiraiya'],
  ['🐸 Jiraiya', 'protect · 24h immunity · found via /patrol'],
  ['👁️ Itachi', 'kill 50–300 🍥 · rob (≥500) · 1 kill/target/day'],
  ['👁️ Hinata', 'byakugan · reveal protect · 1×/day DM'],
  ['🧠 Mind Transmission', '/mt hidden msg · jutsu owners'],
  ['🍃 Rank', 'academy → genin → chūnin → jōnin → anbu → kage'],
  ['👤 Profile', '/profile → rank, XP, roster & stats'],
];

export function abilityHtml(user) {
  const rows = ROWS.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  return style(
    `<p>${mention(user)}</p>` +
    `<p>📖 𝐒𝐇𝐈𝐍𝐎𝐁𝐈 𝐀𝐁𝐈𝐋𝐈𝐓𝐈𝐄𝐒</p>` +
    `<table><tr><th>Shinobi</th><th>Ability</th></tr>${rows}</table>` +
    `<p></p>`,
  );
}

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

/** Map context — includes Back to Map. Manual /ability uses abilityKeyboard only. */
export function abilityKeyboardFromMap(id) {
  return {
    inline_keyboard: [
      [{ text: style('Lvl Up'), callback_data: `lv:up:${id}` }],
      [{ text: style('◂ Back to Map'), callback_data: `map_home:${id}` }],
    ],
  };
}

export const backKeyboard = (id) => ({
  inline_keyboard: [[{ text: style('Back'), callback_data: `lv:ab:${id}` }]],
});
