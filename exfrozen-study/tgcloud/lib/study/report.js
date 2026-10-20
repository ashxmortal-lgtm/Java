import { db } from 'sdk';
import { api } from '../message_api.js';
import { eq, and } from 'sdk/db';
import { study_goals as G } from '../../schema.js';
import { mention, istNow, sendBlocks, rp, head, para, divider, row, btn } from './common.js';
import { startStudyReport } from './studytime.js';
import { askTodo, getActiveTodo } from './todo.js';

export async function handleReport(message) {
  const c = message.chat.id, from = message.from;
  const inline = (message.text || '').replace(/^\/report(@\w+)?\s*/i, '').trim();
  const today = istNow().date;
  const g = await db.select().from(G).where(and(eq(G.chatId, c), eq(G.userId, from.id))).get();
  const t = await getActiveTodo(c, from.id);
  const hasGoal = g && g.goalDate === today && g.goalText && !['awaiting_goal'].includes(g.status);
  const hasTodo = t && (t.status === 'scheduled' || t.status === 'asked');

  // If inline text provided and study is pending, treat as report submission
  if (inline && g && ['goal_set', 'asked'].includes(g.status)) {
    await startStudyReport(c, from, inline, message.message_id);
    return;
  }

  // Show combined report UI with complete/incomplete buttons when goal or todo is set
  if (hasGoal || hasTodo) {
    const blocks = [head('📝 STUDY REPORT'), para(mention(from))];
    if (hasTodo) {
      blocks.push(
        para(`Your todo for ${today}:`),
        para(t.contentText || (t.contentType === 'photo' ? '(image todo)' : '(empty)')),
        row(
          btn('Completed', `todo_done:${t.todoId}`, 'success'),
          btn('incomplete', `todo_missed:${t.todoId}`, 'danger'),
        ),
      );
    }
    if (hasGoal) {
      blocks.push(
        para(`Your target study time for ${today}:`),
        para(g.goalText || '(no text)'),
        row(
          btn('Completed', `study_done:${c}:${from.id}`, 'success'),
          btn('incomplete', `study_missed:${c}:${from.id}`, 'danger'),
        ),
      );
    }
    blocks.push(row(btn('Close', 'report_pick:cancel', 'primary')));
    await sendBlocks(c, blocks, { ...rp(message.message_id), skipEntities: false });
    return;
  }

  const note = g && g.status === 'report_submitted' ? '📥 Tumhari study report mil chuki hai. Result ke buttons dabao.'
    : t && t.status === 'asked' ? '📋 Todo ka check-in already bheja ja chuka hai. Completed/Not Completed dabao.'
    : g && g.status === 'closed' && g.goalDate === today ? '✅ Aaj ka study goal already close ho chuka hai.'
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
