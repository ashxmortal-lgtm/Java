import { db } from 'sdk';
import { sql } from 'sdk/db';
import { render } from './texts.js';

// [kills needed, rob %, title]
const ITACHI = [
  [0, 20, 'anbu itachi'],
  [25, 30, 'sharingan itachi'],
  [75, 40, 'mangekyō itachi'],
  [150, 55, 'akatsuki itachi'],
  [300, 70, 'uchiha prodigy'],
];

export async function levelsText(user) {
  const rows = await db.all(sql`SELECT item_name FROM inventory WHERE telegram_id = ${user.id} AND item_name IN ('Itachi', 'Sakura')`);
  const own = new Set(rows.map((r) => r.item_name));
  const u = await db.get(sql`SELECT kills FROM users WHERE telegram_id = ${user.id}`);
  const kills = u ? u.kills : 0;

  let lv = 0;
  ITACHI.forEach((l, i) => { if (kills >= l[0]) lv = i; });

  const table = ['level | kill count | rob gain']
    .concat(ITACHI.map((l, i) => `lv. ${i + 1} | ${l[0]} kills | ${l[1]}%`))
    .join('\n');
  const current = own.has('Itachi')
    ? `📈 current: lv. ${lv + 1} — ${ITACHI[lv][2]}`
    : `📈 current: itachi not owned`;
  const next = lv < ITACHI.length - 1
    ? `⏳ next level at ${ITACHI[lv + 1][0]} kills`
    : `✅ all itachi milestones complete`;

  const body =
    `⬆️ 𝐋𝐕𝐋 𝐔𝐏𝐒\n\n` +
    `🩸 𝐈𝐓𝐀𝐂𝐇𝐈\n<blockquote>${table}</blockquote>\n` +
    `${current}\n🔪 kill count: ${kills}\n${next}\n\n` +
    `🌸 𝐒𝐀𝐊𝐔𝐑𝐀 𝐓𝐑𝐀𝐈𝐍𝐈𝐍𝐆 (via tsunade)\n` +
    `📈 current: ${own.has('Sakura') ? 'training not available yet' : 'sakura not owned'}\n` +
    `✅ sessions: —\n\n` +
    `<blockquote>🐌 𝐊𝐚𝐭𝐬𝐮𝐲𝐮'𝐬 𝐇𝐞𝐚𝐥𝐢𝐧𝐠 (tsunade)\n✅ unlock when — sakura reached lv.4</blockquote>\n` +
    `─────────────────⟢\n` +
    `only shinobi with level systems are listed here.`;
  return render(user, body);
}
