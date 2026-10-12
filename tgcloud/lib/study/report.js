import { api, db } from 'sdk';
import { eq, and } from 'sdk/db';
import { study_goals as G } from '../../schema.js';
import { mention, istNow, sendBlocks, rp, head, para, divider, row, btn } from './common.js';
import { startStudyReport } from './studytime.js';
import { askTodo, getActiveTodo } from './todo.js';

export async function handleReport(message) {
  const c = message.chat.id, from = message.from;
  const inline = (message.text || '').replace(/^\/report(@\w+)?\s*/i, '').trim();
  const g = await db.select().from(G).where(and(eq(G.chatId, c), eq(G.userId, from.id))).get();
  const t = await getActiveTodo(c, from.id);
  const studyOk = g && ['goal_set', 'asked'].includes(g.status);
  const todoOk = t && t.status === 'scheduled';
  if (studyOk && todoOk && !inline) {
    await sendBlocks(c, [
      head('📝 REPORT'),
      para(mention(from), ', which would you like to report?'),
      para('You\'ve got more than one thing awaiting a report today.'),
      divider,
      row(
        btn('📖 Study Goal', 'report_pick:study', 'primary'),
        btn('🗒️ Todo', 'report_pick:todo', 'primary'),
      ),
      row(btn('❌ Cancel', 'report_pick:cancel', 'danger')),
    ], rp(message.message_id));
    return;
  }
  if (studyOk) { await startStudyReport(c, from, inline, message.message_id); return; }
  if (todoOk) { await askTodo(t, istNow().date); return; }
  const note = g && g.status === 'report_submitted' ? '📥 Tumhari study report mil chuki hai. Result ke buttons dabao.'
    : t && t.status === 'asked' ? '📋 Todo ka check-in already bheja ja chuka hai. Completed/Not Completed dabao.'
    : g && g.status === 'closed' && g.goalDate === istNow().date ? '✅ Aaj ka study goal already close ho chuka hai.'
    : null;
  const blocks = note
    ? [para(note)]
    : [head('📭 NOTHING TO REPORT'), para(mention(from), ', nothing to report right now.'), para('Use /studytime to set a study goal or /todo to create a Todo first.')];
  await sendBlocks(c, blocks, { ...rp(message.message_id), skipEntities: false });
}

export async function handleReportCb(cq) {
  const m = (cq.data || '').match(/^report_pick:(study|todo|cancel)$/);
  if (!m) return false;
  const msg = cq.message;
  const owner = msg && msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.id;
  if (owner && owner !== cq.from.id) { await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'Ye button tumhare liye nahi hai.' }); return true; }
  await api.answerCallbackQuery({ callback_query_id: cq.id });
  if (!msg) return true;
  try { await api.deleteMessage({ chat_id: msg.chat.id, message_id: msg.message_id }); } catch (e) { /* ignore */ }
  if (m[1] === 'study') await startStudyReport(msg.chat.id, cq.from, '', null);
  if (m[1] === 'todo') {
    const t = await getActiveTodo(msg.chat.id, cq.from.id);
    if (t && t.status === 'scheduled') await askTodo(t, istNow().date);
    else await sendBlocks(msg.chat.id, [para('ℹ️ Abhi koi Todo report pending nahi hai.')]);
  }
  return true;
}
