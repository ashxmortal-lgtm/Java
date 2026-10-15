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

const RANKS = [
  [0, 'Academy Student'],
  [500, 'Genin'],
  [1500, 'Chūnin'],
  [3500, 'Jōnin'],
  [6500, 'Anbu'],
  [10000, 'Kage'],
];

/** Return only the caller's profile fields, shared by /profile and the Mini App. */
export async function profileData(user) {
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

  return {
    displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Shinobi',
    username: user.username || '',
    rank: rank[1],
    xp,
    xpText: progress,
    balance: bal,
    chakra,
    kills,
    streak,
    lastClaim,
    narutoPatrols,
    roster: shinobi.map((s) => ({
      name: s.item_name,
      emoji: EMO[s.item_name] || '🥷',
      qty: s.qty,
    })),
    jutsu: jutsu.map((j) => j.item_name),
  };
}

export async function profileText(user) {
  const profile = await profileData(user);
  const roster = profile.roster.length
    ? profile.roster.map((s) => `${s.emoji} ${s.name}`).join('\n')
    : '— none yet —';
  const jutsuLine = profile.jutsu.length
    ? profile.jutsu.map((name) => `🧠 ${name}`).join('\n')
    : '— none —';

  return style(
    `👤 ${mention(user)}\n` +
    `─────────────────⟢\n` +
    `🥷 Rank: <b>${profile.rank}</b>\n` +
    `✨ XP: ${profile.xpText}\n` +
    `🍥 Coins: ${fmt(profile.balance)}\n` +
    `⚡ Chakra: ${fmt(profile.chakra)}\n` +
    `🔪 Kills: ${fmt(profile.kills)}\n` +
    `🔥 Claim streak: ${fmt(profile.streak)} (last: ${profile.lastClaim})\n` +
    (profile.narutoPatrols ? `🍥 Naruto patrols: ${fmt(profile.narutoPatrols)}\n` : '') +
    `─────────────────⟢\n` +
    `👥 Roster\n${roster}\n` +
    `─────────────────⟢\n` +
    `🌀 Jutsu\n${jutsuLine}`,
  );
}
