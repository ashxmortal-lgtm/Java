import { api, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { study_duels as D } from '../../schema.js';
import { mention, userTag, plainName, nowIso, istNow, sendBlocks, editBlocks, rp, parseTime, hhmm, nextDate, head, para, bold, divider, quoteText, code, row, btn } from './common.js';

const getDuel = (id) => db.select().from(D).where(eq(D.duelId, id)).get();
const nm = (d, w) => userTag(d[w + 'Id'], d[w + 'Username'], d[w + 'FirstName']);
const label = (d, w) => plainName(d[w + 'Username'], d[w + 'FirstName']);
const openDuel = (uid) => db.get(sql`SELECT duel_id FROM study_duels WHERE status IN ('awaiting_goal','awaiting_time','pending_opponent','active','awaiting_reports') AND (challenger_id = ${uid} OR opponent_id = ${uid}) LIMIT 1`);

const say = (c, blocks, replyId) => sendBlocks(c, blocks, rp(replyId));

function fitName(s) {
  const t = String(s || 'User');
  return t.length > 22 ? t.slice(0, 21) + '…' : t;
}

export async function handleDuel(message) {
  const c = message.chat.id, me = message.from, text = message.text || '';
  let opp = null, unknown = false;
  const rf = message.reply_to_message && message.reply_to_message.from;
  if (rf && !rf.is_bot) opp = rf;
  if (!opp) for (const e of message.entities || []) if (e.type === 'text_mention' && e.user) { opp = e.user; break; }
  if (!opp) {
    const m = text.match(/^\/duel(?:@\w+)?\s+@(\w{3,32})/i);
    if (m) {
      const n = m[1].toLowerCase();
      const rowU = await db.get(sql`SELECT user_id, username, first_name FROM (SELECT user_id, username, first_name FROM study_goals UNION SELECT user_id, username, first_name FROM study_todos UNION SELECT challenger_id, challenger_username, challenger_first_name FROM study_duels UNION SELECT opponent_id, opponent_username, opponent_first_name FROM study_duels) WHERE lower(username) = ${n} LIMIT 1`);
      if (rowU) opp = { id: rowU.user_id, username: rowU.username, first_name: rowU.first_name }; else unknown = true;
    }
  }
  const mine = mention(me);
  if (unknown) { await say(c, [para('⚠️ ', mine, ", that user hasn't used the bot yet. Reply to their message instead.")], message.message_id); return; }
  if (!opp) {
    await say(c, [
      head('⚔️ STUDY DUEL'),
      para(mine, ', how to start a duel:'),
      divider,
      para('Reply to a user\'s message: ', code('/duel')),
      para('Or use: ', code('/duel @username')),
    ], message.message_id);
    return;
  }
  if (opp.id === me.id) { await say(c, [para('⚠️ Khud se duel nahi ho sakta.')], message.message_id); return; }
  if (opp.is_bot) { await say(c, [para('⚠️ Bot se duel nahi ho sakta.')], message.message_id); return; }
  if (await openDuel(me.id)) { await say(c, [para('⚠️ Tumhara ek duel already open hai.')], message.message_id); return; }
  if (await openDuel(opp.id)) { await say(c, [para('⚠️ Us user ka ek duel already open hai.')], message.message_id); return; }
  const n = nowIso();
  await db.insert(D).values({ chatId: c, challengerId: me.id, challengerUsername: me.username || null, challengerFirstName: me.first_name || null,
    opponentId: opp.id, opponentUsername: opp.username || null, opponentFirstName: opp.first_name || null, status: 'awaiting_goal', createdAt: n, updatedAt: n }).run();
  await say(c, [
    head('⚔️ STUDY DUEL — STEP 1/2'),
    para('🥷 ', mine, ' is challenging ', mention(opp), '!'),
    divider,
    para('📖 ', mine, ', reply here with the study goal you\'re both dueling on.'),
    para('Goal limit: ', bold('300'), ' characters.'),
  ], message.message_id);
}

export async function handleDuelText(message) {
  const text = (message.text || '').trim();
  if (!text || text.startsWith('/')) return false;
  const c = message.chat.id, u = message.from.id;
  const d = await db.get(sql`SELECT duel_id FROM study_duels WHERE chat_id = ${c} AND challenger_id = ${u} AND status IN ('awaiting_goal','awaiting_time') LIMIT 1`);
  if (!d) return false;
  const duel = await getDuel(d.duel_id);
  if (duel.status === 'awaiting_goal') {
    if (text.length > 300) { await say(c, [para('⚠️ Goal 300 characters se chhota rakho.')], message.message_id); return true; }
    const r = await db.run("UPDATE study_duels SET goal_text=:g, status='awaiting_time', updated_at=:n WHERE duel_id=:id AND status='awaiting_goal'", { ':g': text, ':n': nowIso(), ':id': duel.duelId });
    if (r.rowsAffected) {
      await say(c, [
        head('⚔️ STUDY DUEL — STEP 2/2'),
        para(bold('🎯 Goal')),
        quoteText(text),
        divider,
        para('⏰ Reply with the report time in 24-hour IST, e.g. ', code('22:00'), '.'),
        para('This is the time you\'ll BOTH report back. Once set, it\'s locked in.'),
      ], message.message_id);
    }
    return true;
  }
  const p = parseTime(text);
  if (!p) { await say(c, [para('⚠️ Time samajh nahi aaya. 24-hour format use karo, e.g. ', code('22:00'))], message.message_id); return true; }
  const r = await db.run("UPDATE study_duels SET report_time=:t, status='pending_opponent', updated_at=:n WHERE duel_id=:id AND status='awaiting_time'", { ':t': hhmm(p.hour, p.minute), ':n': nowIso(), ':id': duel.duelId });
  if (!r.rowsAffected) return true;
  await sendBlocks(c, [
    head('⚔️ STUDY DUEL CHALLENGE'),
    para('🥷 ', nm(duel, 'challenger'), '  ', bold('VS'), '  ', nm(duel, 'opponent')),
    divider,
    para(bold('🎯 Goal')),
    quoteText(duel.goalText || ''),
    para('⏰ Report time: ', bold(hhmm(p.hour, p.minute) + ' IST')),
    divider,
    para(nm(duel, 'opponent'), ', do you accept?'),
    row(
      btn('✅ Accept', `duel_accept:${duel.duelId}:${duel.opponentId}`, 'success'),
      btn('❌ Decline', `duel_decline:${duel.duelId}:${duel.opponentId}`, 'danger'),
    ),
  ], rp(message.message_id));
  return true;
}

function reportBlocks(d) {
  const blocks = [
    head('🌙 DUEL REPORT'),
    para(bold('🎯 Goal')),
    quoteText(d.goalText || ''),
    divider,
  ];
  const rows = [];
  for (const w of ['challenger', 'opponent']) {
    const r = d[w + 'Result'];
    if (r === null || r === undefined) {
      blocks.push(para('⏳ ', nm(d, w), ': awaiting report'));
      const lab = fitName(label(d, w));
      rows.push(row(
        btn(`✅ ${lab}: done`, `duel_done:${d.duelId}:${d[w + 'Id']}`, 'success'),
        btn(`❌ ${lab}: missed`, `duel_missed:${d.duelId}:${d[w + 'Id']}`, 'danger'),
      ));
    } else blocks.push(para(r ? '✅ ' : '❌ ', nm(d, w), r ? ': Passed' : ': Failed'));
  }
  return blocks.concat(rows);
}

function finalBlocks(d) {
  const a = d.challengerResult, b = d.opponentResult;
  let end;
  if (a && b) end = '🤝 Both passed! Dono winner hain 🏆';
  else if (!a && !b) end = '💀 Both failed. Is baar koi winner nahi.';
  else end = para('🏆 Winner: ', nm(d, a ? 'challenger' : 'opponent'));
  const blocks = reportBlocks(d);
  blocks.push(divider);
  blocks.push(typeof end === 'string' ? para(bold(end)) : end);
  return blocks;
}

export async function askDuel(d) {
  const r = await db.run("UPDATE study_duels SET status='awaiting_reports', updated_at=:n WHERE duel_id=:id AND status='active'", { ':n': nowIso(), ':id': d.duelId });
  if (!r.rowsAffected) return;
  try { await sendBlocks(d.chatId, reportBlocks(d)); }
  catch (e) { await db.run("UPDATE study_duels SET status='active', updated_at=:u WHERE duel_id=:id AND status='awaiting_reports'", { ':u': d.updatedAt, ':id': d.duelId }); throw e; }
}

export function duelIsDue(d, now) {
  const [h, m] = String(d.reportTime || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const act = istNow(new Date(d.updatedAt));
  let dd = act.date;
  if (act.hour * 60 + act.minute >= h * 60 + m) dd = nextDate(dd);
  const nowMin = now.hour * 60 + now.minute;
  return now.date > dd || (now.date === dd && nowMin >= h * 60 + m);
}

export async function handleDuelCb(cq) {
  const mt = (cq.data || '').match(/^duel_(accept|decline|done|missed):(\d+):(\d+)$/);
  if (!mt) return false;
  const kind = mt[1], id = +mt[2], pid = +mt[3];
  const ans = (text) => api.answerCallbackQuery({ callback_query_id: cq.id, ...(text ? { text } : {}) });
  const msg = cq.message;
  const edit = (blocks) => msg && editBlocks(msg.chat.id, msg.message_id, blocks);
  if (cq.from.id !== pid) { await ans('Ye button tumhare liye nahi hai.'); return true; }
  const d = await getDuel(id);
  if (!d) { await ans('Duel nahi mila.'); return true; }
  if (kind === 'accept' || kind === 'decline') {
    if (pid !== d.opponentId) { await ans('Ye button tumhare liye nahi hai.'); return true; }
    const st = kind === 'accept' ? 'active' : 'declined';
    const r = await db.run("UPDATE study_duels SET status=:s, updated_at=:n WHERE duel_id=:id AND status='pending_opponent'", { ':s': st, ':n': nowIso(), ':id': id });
    if (!r.rowsAffected) { await ans('Ye challenge ab available nahi hai.'); return true; }
    await ans();
    await edit(kind === 'accept'
      ? [
          head('⚔️ DUEL ACCEPTED'),
          para('🥷 ', nm(d, 'challenger'), '  ', bold('VS'), '  ', nm(d, 'opponent')),
          divider,
          para(bold('🎯 Goal')),
          quoteText(d.goalText || ''),
          para('⏰ Report time: ', bold((d.reportTime || '') + ' IST')),
        ]
      : [head('❌ DUEL DECLINED'), para(nm(d, 'opponent'), ' ne duel decline kar diya.')]);
    return true;
  }
  if (pid !== d.challengerId && pid !== d.opponentId) { await ans('Tum is duel ke participant nahi ho.'); return true; }
  const col = pid === d.challengerId ? 'challenger_result' : 'opponent_result';
  const r = await db.run(`UPDATE study_duels SET ${col}=:r, updated_at=:n WHERE duel_id=:id AND status='awaiting_reports' AND ${col} IS NULL`, { ':r': kind === 'done' ? 1 : 0, ':n': nowIso(), ':id': id });
  if (!r.rowsAffected) { await ans('Result already record ho chuka hai ya duel band hai.'); return true; }
  await ans();
  const nd = await getDuel(id);
  if (nd.challengerResult !== null && nd.opponentResult !== null) {
    const c2 = await db.run("UPDATE study_duels SET status='completed', updated_at=:n WHERE duel_id=:id AND status='awaiting_reports'", { ':n': nowIso(), ':id': id });
    if (c2.rowsAffected) await edit(finalBlocks(nd));
    return true;
  }
  if (nd.status !== 'awaiting_reports') return true;
  await edit(reportBlocks(nd));
  return true;
}
