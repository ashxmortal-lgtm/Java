import { api, db } from 'sdk';
import { eq, and } from 'sdk/db';
import { study_goals as G } from '../../schema.js';
import { mention, nowIso, istNow, sendBlocks, editBlocks, rp, head, para, bold, divider, quoteText, row, btn } from './common.js';

const getGoal = (c, u) => db.select().from(G).where(and(eq(G.chatId, c), eq(G.userId, u))).get();

const resultRow = (c, u) => row(
  btn('✅ Completed', `study_done:${c}:${u}`, 'success'),
  btn('❌ Not completed', `study_missed:${c}:${u}`, 'danger'),
);

export async function handleStudytime(message) {
  const c = message.chat.id, u = message.from.id, today = istNow().date;
  const g = await getGoal(c, u);
  const who = mention(message.from);
  if (g && g.goalDate === today && g.status !== 'awaiting_goal') {
    const note = g.status === 'closed' ? '✅ Aaj ka goal already complete ho chuka hai.'
      : g.status === 'report_submitted' ? '📥 Report mil chuki hai. Result ke buttons dabao.'
      : '🎯 Aaj ka goal already set hai. /report se kabhi bhi report do.';
    const blocks = [
      head('📚 𝐃𝐚𝐢𝐥𝐲 𝐒𝐭𝐮𝐝𝐲 𝐆𝐨𝐚𝐥'),
      para('🥷 ', who),
      para(note),
    ];
    if (g.goalText) blocks.push(quoteText(g.goalText));
    await sendBlocks(c, blocks, { ...rp(message.message_id), skipEntities: false });
    return;
  }
  const vals = { username: message.from.username || null, firstName: message.from.first_name || null, goalText: null,
    goalDate: today, status: 'awaiting_goal', reportText: null, completed: null, updatedAt: nowIso() };
  if (g) await db.update(G).set(vals).where(and(eq(G.chatId, c), eq(G.userId, u))).run();
  else await db.insert(G).values({ chatId: c, userId: u, ...vals }).run();
  await sendBlocks(c, [
    head('📚 𝐃𝐚𝐢𝐥𝐲 𝐒𝐭𝐮𝐝𝐲 𝐆𝐨𝐚𝐥'),
    para('🥷 ', who),
    para('✍️ Send your study goal for today.'),
    divider,
    para('⏰ At ', bold('22:00'), " I'll ask you to report back."),
  ], rp(message.message_id));
}

async function submitReport(c, from, text, replyTo) {
  if (text.length > 500) {
    await sendBlocks(c, [para('⚠️ Report 500 characters se chhoti rakho.')], rp(replyTo));
    return;
  }
  const r = await db.run("UPDATE study_goals SET report_text=:t, status='report_submitted', updated_at=:n WHERE chat_id=:c AND user_id=:u AND status IN ('goal_set','asked')",
    { ':t': text, ':n': nowIso(), ':c': c, ':u': from.id });
  if (!r.rowsAffected) return;
  await sendBlocks(c, [
    head('📥 REPORT RECEIVED'),
    para('From ', mention(from)),
    divider,
    quoteText(text),
    para('Did you complete today\'s goal?'),
    resultRow(c, from.id),
  ], rp(replyTo));
}

export async function startStudyReport(c, from, inlineText, replyTo) {
  const g = await getGoal(c, from.id);
  if (!g || !['goal_set', 'asked'].includes(g.status)) {
    await sendBlocks(c, [para('ℹ️ Abhi koi study report pending nahi hai.')], rp(replyTo));
    return;
  }
  if (inlineText) { await submitReport(c, from, inlineText, replyTo); return; }
  await db.run("UPDATE study_goals SET status='asked', updated_at=:n WHERE chat_id=:c AND user_id=:u AND status='goal_set'", { ':n': nowIso(), ':c': c, ':u': from.id });
  await sendBlocks(c, [
    head('📝 STUDY REPORT'),
    para(mention(from), ', send your study report.'),
    para('Max ', bold('500'), ' characters.'),
  ], { ...rp(replyTo), skipEntities: false });
}

export async function handleStudyText(message) {
  const text = (message.text || '').trim();
  if (!text || text.startsWith('/')) return false;
  const c = message.chat.id, from = message.from;
  const g = await getGoal(c, from.id);
  if (!g) return false;
  if (g.status === 'awaiting_goal') {
    if (text.length > 300) {
      await sendBlocks(c, [para('⚠️ Goal 300 characters se chhota rakho.')], rp(message.message_id));
      return true;
    }
    const r = await db.run("UPDATE study_goals SET goal_text=:t, status='goal_set', goal_date=:d, updated_at=:n WHERE chat_id=:c AND user_id=:u AND status='awaiting_goal'",
      { ':t': text, ':d': istNow().date, ':n': nowIso(), ':c': c, ':u': from.id });
    if (r.rowsAffected) {
      await sendBlocks(c, [
        head('✅ GOAL LOCKED IN'),
        para('🥷 ', mention(from)),
        quoteText(text),
        divider,
        para('⏰ I\'ll check in with you at ', bold('22:00'), ' for your report.'),
        para('💡 Done early? Use /report anytime to submit before the check-in.'),
      ], { ...rp(message.message_id), skipEntities: false });
    }
    return true;
  }
  if (g.status === 'asked') { await submitReport(c, from, text, message.message_id); return true; }
  return false;
}

export async function askStudy(g) {
  const r = await db.run("UPDATE study_goals SET status='asked', updated_at=:n WHERE chat_id=:c AND user_id=:u AND status='goal_set'", { ':n': nowIso(), ':c': g.chatId, ':u': g.userId });
  if (!r.rowsAffected) return;
  try {
    await sendBlocks(g.chatId, [
      head('🌙 DAILY REPORT'),
      para('🥷 ', mention({ id: g.userId, username: g.username, first_name: g.firstName }), ', time to report!'),
      g.goalText ? quoteText(g.goalText) : para('🎯 ', bold('(no goal text)')),
      divider,
      para('Send your report here (max 500 characters), or use /report.'),
    ], { skipEntities: false });
  } catch (e) {
    await db.run("UPDATE study_goals SET status='goal_set' WHERE chat_id=:c AND user_id=:u AND status='asked'", { ':c': g.chatId, ':u': g.userId });
    throw e;
  }
}

export async function handleStudyCb(cq) {
  const m = (cq.data || '').match(/^study_(done|missed):(-?\d+):(\d+)$/);
  if (!m) return false;
  const c = +m[2], u = +m[3];
  if (cq.from.id !== u) { await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Ye button tumhare liye nahi hai.' }); return true; }
  const ok = m[1] === 'done' ? 1 : 0;
  const r = await db.run("UPDATE study_goals SET completed=:ok, status='closed', updated_at=:n WHERE chat_id=:c AND user_id=:u AND status='report_submitted'",
    { ':ok': ok, ':n': nowIso(), ':c': c, ':u': u });
  if (!r.rowsAffected) { await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Ye pehle hi process ho chuka hai.' }); return true; }
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  const blocks = ok
    ? [head('🎉 GOAL COMPLETED'), para('🥷 ', mention(cq.from))]
    : [head('😔 GOAL NOT COMPLETED'), para('🥷 ', mention(cq.from)), para('🔥 𝑻𝒐𝒎𝒐𝒓𝒓𝒐𝒘\'𝒔 𝒂 𝒏𝒆𝒘 𝒅𝒂𝒚. 𝑲𝒆𝒆𝒑 𝒈𝒐𝒊𝒏𝒈.')];
  if (cq.message) await editBlocks(cq.message.chat.id, cq.message.message_id, blocks);
  return true;
}
