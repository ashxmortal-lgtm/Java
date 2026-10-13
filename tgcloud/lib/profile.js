/**
 * /profile — shinobi rank, coins, chakra, roster, and streak from existing data.
 */
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { fmt } from './store.js';
import { mention, style } from './texts.js';
import { rankOf } from './activities.js';

const EMO = {
  Sasuke: '⚔️',
  Sakura: '🌸',
  Naruto: '🍥',
  Itachi: '👁️',
  Hinata: '👁️',
  Jiraiya: '🐸',
  'Starter Shinobi': '🥷',
};

export async function profileText(user) {
  const id = user.id;
  const u = await db.get(sql`
    SELECT balance, xp, kills, claim_streak, last_claim_date, naruto_patrols
    FROM users WHERE telegram_id = ${id}
  `);
  const bal = u ? u.balance : 0;
  const xp = u ? u.xp : 0;
  const kills = u ? (u.kills || 0) : 0;
  const streak = u ? (u.claim_streak || 0) : 0;
  const lastClaim = u && u.last_claim_date ? u.last_claim_date : '—';
  const narutoPatrols = u ? (u.naruto_patrols || 0) : 0;
  const rank = rankOf(xp);

  const chakraRow = await db.get(sql`
    SELECT qty FROM inventory
    WHERE telegram_id = ${id} AND item_name = 'Chakra'
  `);
  const chakra = chakraRow ? chakraRow.qty : 0;

  const shinobi = await db.all(sql`
    SELECT item_name, qty FROM inventory
    WHERE telegram_id = ${id} AND item_type = 'shinobi'
    ORDER BY item_name
  `);
  const jutsu = await db.all(sql`
    SELECT item_name FROM inventory
    WHERE telegram_id = ${id} AND item_type = 'jutsu'
    ORDER BY item_name
  `);

  const roster = shinobi.length
    ? shinobi.map((s) => `${EMO[s.item_name] || '🥷'} ${s.item_name}`).join('\n')
    : '— none yet —';
  const jutsuLine = jutsu.length
    ? jutsu.map((j) => `🧠 ${j.item_name}`).join('\n')
    : '— none —';

  // Next rank threshold
  const RANKS = [
    [0, 'Academy Student'],
    [500, 'Genin'],
    [1500, 'Chūnin'],
    [3500, 'Jōnin'],
    [6500, 'Anbu'],
    [10000, 'Kage'],
  ];
  let nextLabel = 'max rank';
  let nextXp = null;
  for (const [need, name] of RANKS) {
    if (xp < need) {
      nextLabel = name;
      nextXp = need;
      break;
    }
  }
  const progress = nextXp != null
    ? `${fmt(xp)} / ${fmt(nextXp)} XP → ${nextLabel}`
    : `${fmt(xp)} XP (Kage)`;

  return style(
    `👤 ${mention(user)}\n` +
    `─────────────────⟢\n` +
    `🥷 Rank: <b>${rank[1]}</b>\n` +
    `✨ XP: ${progress}\n` +
    `🍥 Coins: ${fmt(bal)}\n` +
    `⚡ Chakra: ${fmt(chakra)}\n` +
    `🔪 Kills: ${fmt(kills)}\n` +
    `🔥 Claim streak: ${fmt(streak)} (last: ${lastClaim})\n` +
    (narutoPatrols ? `🍥 Naruto patrols: ${fmt(narutoPatrols)}\n` : '') +
    `─────────────────⟢\n` +
    `👥 Roster\n${roster}\n` +
    `─────────────────⟢\n` +
    `🌀 Jutsu\n${jutsuLine}`,
  );
}
