import { db } from 'sdk';
import { api } from '../message_api.js';
import { eq, and, inArray } from 'sdk/db';
import { study_todos as T } from '../../schema.js';
import { mention, userTag, nowIso, istNow, sendBlocks, editBlocks, rp, head, para, bold, divider, quoteText, code, row, btn, fmt12, parseTime } from './common.js';

export const STORAGE_CHAT_ID = -1003889508991;

const ACTIVE = ['collecting', 'choosing', 'custom', 'scheduled', 'asked'];

export const getActiveTodo = (c, u) => db.select().from(T).where(and(eq(T.chatId, c), eq(T.userId, u), inArray(T.status, ACTIVE))).get();
const getById = (id) => db.select().from(T).where(eq(T.todoId, id)).get();

export async function expireDrafts() {
  const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
  await db.run("DELETE FROM study_todos WHERE status IN ('collecting','choosing','custom') AND created_at < :c", { ':c': cutoff });
}

const cancelRow = row(btn('❌ Cancel', 'todo_cancel', 'danger'));
const timeRows = [
  row(
    btn('🕐 8:00 PM', 'todo_preset:20:0', 'primary'),
    btn('🕘 9:00 PM', 'todo_preset:21:0', 'primary'),
    btn('🕙 10:00 PM', 'todo_preset:22:0', 'primary'),
  ),
  row(btn('✏️ Custom Time', 'todo_custom')),
  cancelRow,
];

export async function handleTodo(message) {
  await expireDrafts();
  const c = message.chat.id, u = message.from.id;
  const a = await getActiveTodo(c, u);
  if (a) {
    if (['collecting', 'choosing', 'custom'].includes(a.status)) {
      await sendBlocks(c, [para('⏳ Todo setup chal raha hai. Content bhejo ya Cancel dabao.')], rp(message.message_id));
      return;
    }
    if (a.status === 'scheduled') {
      await sendBlocks(c, [
        head('📌 ACTIVE TODO'),
        para('Tumhara ek active Todo already hai.'),
        para('Report ', bold(fmt12(a.reportHour, a.reportMinute)), ' IST par.'),
        row(btn('change ❄️ todo', `todo_change:${a.todoId}`, 'primary')),
      ], rp(message.message_id));
      return;
    }
    // status === 'asked': show todo again with complete/incomplete + change
    const who = mention(message.from);
    const today = istNow().date;
    const blocks = [
      para(who, "'s todo"),
      para(today),
      para('Todo: ', a.contentText || (a.contentType === 'photo' ? '(image todo)' : '(empty)')),
      row(
        btn('Completed', `todo_done:${a.todoId}`, 'success'),
        btn('incomplete', `todo_missed:${a.todoId}`, 'danger'),
      ),
      row(btn('change ❄️ todo', `todo_change:${a.todoId}`, 'primary')),
    ];
    await sendBlocks(c, blocks, { ...rp(message.message_id), skipEntities: false });
    return;
  }
  const n = nowIso();
  await db.insert(T).values({ chatId: c, userId: u, username: message.from.username || null, firstName: message.from.first_name || null, status: 'collecting', createdAt: n, updatedAt: n }).run();
  await sendBlocks(c, [
    head('📝 CREATE YOUR TODO'),
    para('📚 What do you need to complete today?'),
    para('✍️ Send your Todo as text or image.'),
    divider,
    para(bold('⏰ Report Time')),
    para('Choose when you want me to ask for your progress.'),
    cancelRow,
  ], rp(message.message_id));
}

async function schedule(t, h, m) {
  const n = istNow();
  const passed = n.hour * 60 + n.minute >= h * 60 + m;
  const r = await db.run("UPDATE study_todos SET status='scheduled', report_hour=:h, report_minute=:m, last_sent_date=:l, updated_at=:n WHERE todo_id=:id AND status IN ('choosing','custom')",
    { ':h': h, ':m': m, ':l': passed ? n.date : null, ':n': nowIso(), ':id': t.todoId });
  return r.rowsAffected > 0;
}

const createdBlocks = (h, m) => [
  head('✅ TODO CREATED'),
  para('📚 Your Todo is saved and locked in.'),
  divider,
  para('⏰ I\'ll ask for your report at ', bold(fmt12(h, m) + ' IST'), '.'),
];

export async function handleTodoInput(message) {
  const raw = message.text || '';
  if (raw.startsWith('/')) return false;
  const photo = message.photo && message.photo.length;
  if (!raw && !photo) return false;
  const c = message.chat.id, u = message.from.id;
  const t = await db.select().from(T).where(and(eq(T.chatId, c), eq(T.userId, u), inArray(T.status, ['collecting', 'custom']))).get();
  if (!t) return false;
  if (t.createdAt < new Date(Date.now() - 15 * 60000).toISOString()) { await expireDrafts(); return false; }
  if (t.status === 'custom') {
    const p = parseTime(raw);
    if (!p) {
      await sendBlocks(c, [
        para('⚠️ Time samajh nahi aaya.'),
        para('Example: ', code('9:45 PM'), ' ya ', code('21:45')),
      ], rp(message.message_id));
      return true;
    }
    if (await schedule(t, p.hour, p.minute)) await sendBlocks(c, createdBlocks(p.hour, p.minute), rp(message.message_id));
    return true;
  }
  const text = photo ? (message.caption || '') : raw;
  if (text.length > 3500) {
    await sendBlocks(c, [para('⚠️ Todo bahut lamba hai. Chhota karke bhejo.')], rp(message.message_id));
    return true;
  }
  let sid = null;
  try { const r = await api.copyMessage({ chat_id: STORAGE_CHAT_ID, from_chat_id: c, message_id: message.message_id }); sid = r.message_id; }
  catch (e) { console.error('todo storage copy failed', e && (e.description || e.message)); }
  if (photo && !sid) {
    await db.run("DELETE FROM study_todos WHERE todo_id=:id", { ':id': t.todoId });
    await sendBlocks(c, [para('⚠️ Image storage chat mein save nahi hui (bot ko storage chat mein add/admin karo). /todo dobara try karo.')], rp(message.message_id));
    return true;
  }
  const r = await db.run("UPDATE study_todos SET status='choosing', content_type=:ct, content_text=:tx, storage_chat_id=:sc, storage_message_id=:sm, updated_at=:n WHERE todo_id=:id AND status='collecting'",
    { ':ct': photo ? 'photo' : 'text', ':tx': text, ':sc': sid ? STORAGE_CHAT_ID : null, ':sm': sid, ':n': nowIso(), ':id': t.todoId });
  if (r.rowsAffected) {
    await sendBlocks(c, [
      head('📝 CREATE YOUR TODO'),
      para('✅ Todo received!'),
      divider,
      para(bold('⏰ Report Time')),
      para('Choose when you want me to ask for your progress.'),
      ...timeRows,
    ], rp(message.message_id));
  }
  return true;
}

function checkinBlocks(t) {
  const who = userTag(t.userId, t.username, t.firstName);
  const blocks = [
    head('🌙 TODO REPORT'),
    para('🥷 ', who, ', here\'s your Todo for today'),
    divider,
  ];
  if (t.contentType === 'photo' && !t.storageMessageId) blocks.push(para('🖼️ (image Todo)'));
  if (t.contentText) blocks.push(quoteText(t.contentText));
  else if (t.contentType === 'photo') blocks.push(para('🖼️ Image Todo'));
  blocks.push(
    divider,
    para('Have you completed it?'),
    row(
      btn('✅ Completed', `todo_done:${t.todoId}`, 'success'),
      btn('❌ Not Completed', `todo_missed:${t.todoId}`, 'danger'),
    ),
  );
  return blocks;
}

async function sendCheckin(t) {
  if (t.contentType === 'photo' && t.storageMessageId) {
    try { await api.copyMessage({ chat_id: t.chatId, from_chat_id: t.storageChatId, message_id: t.storageMessageId }); }
    catch (e) { console.error('todo photo copy failed', e && (e.description || e.message)); }
  }
  await sendBlocks(t.chatId, checkinBlocks(t));
}

export async function askTodo(t, today) {
  const r = await db.run("UPDATE study_todos SET status='asked', last_sent_date=:d, updated_at=:n WHERE todo_id=:id AND status='scheduled'", { ':d': today, ':n': nowIso(), ':id': t.todoId });
  if (!r.rowsAffected) return false;
  try { await sendCheckin(t); return true; }
  catch (e) {
    await db.run("UPDATE study_todos SET status='scheduled', last_sent_date=:l WHERE todo_id=:id AND status='asked'", { ':l': t.lastSentDate ?? null, ':id': t.todoId });
    throw e;
  }
}

export async function handleTodoCb(cq) {
  const data = cq.data || '';
  if (!/^todo_(preset:\d+:\d+|custom|cancel|done:\d+|missed:\d+|change:\d+)$/.test(data)) return false;
  const ans = (text) => api.answerCallbackQuery({ callback_query_id: cq.id, ...(text ? { text } : {}) });
  const msg = cq.message, u = cq.from.id;
  if (/^todo_change:/.test(data)) {
    const id = +data.split(':')[1];
    const t = await getById(id);
    if (!t) { await ans('Todo nahi mila.'); return true; }
    if (t.userId !== u) { await ans('Ye button tumhare liye nahi hai.'); return true; }
    // Reset to collecting so user can set a new todo
    await db.run("UPDATE study_todos SET status='collecting', content_type=NULL, content_text=NULL, storage_chat_id=NULL, storage_message_id=NULL, report_hour=NULL, report_minute=NULL, completed=NULL, updated_at=:n WHERE todo_id=:id", { ':n': nowIso(), ':id': id });
    await ans('Todo reset. Send new content.');
    if (msg) {
      await editBlocks(msg.chat.id, msg.message_id, [
        head('📝 CREATE YOUR TODO'),
        para('📚 What do you need to complete today?'),
        para('✍️ Send your Todo as text or image.'),
        divider,
        para(bold('⏰ Report Time')),
        para('Choose when you want me to ask for your progress.'),
        cancelRow,
      ]);
    }
    return true;
  }
  if (/^todo_(done|missed):/.test(data)) {
    const [kind, id] = data.split(':');
    const t = await getById(+id);
    if (!t) { await ans('Todo nahi mila.'); return true; }
    if (t.userId !== u) { await ans('Ye button tumhare liye nahi hai.'); return true; }
    const ok = kind === 'todo_done' ? 1 : 0;
    const r = await db.run("UPDATE study_todos SET completed=:ok, status='closed', updated_at=:n WHERE todo_id=:id AND status IN ('asked','scheduled')", { ':ok': ok, ':n': nowIso(), ':id': t.todoId });
    if (!r.rowsAffected) { await ans('Ye pehle hi process ho chuka hai.'); return true; }
    await ans();
    // Economy: +500 / -500
    try {
      const { adjustBalance } = await import('../economy.js');
      await adjustBalance(u, ok ? 500 : -500, { allowPartial: true, study: true });
    } catch (e) { console.error('todo economy', e); }
    const blocks = ok
      ? [head('🎉 TODO COMPLETED'), para('🥷 ', mention(cq.from)), para('+500 🍥')]
      : [head('😔 TODO NOT COMPLETED'), para('🥷 ', mention(cq.from)), para('-500 🍥 (or remaining)'), para('🔥 𝑻𝒐𝒎𝒐𝒓𝒓𝒐𝒘\'𝒔 𝒂 𝒏𝒆𝒘 𝒅𝒂𝒚. 𝑲𝒆𝒆𝒑 𝒈𝒐𝒊𝒏𝒈.')];
    if (msg) {
      try { await editBlocks(msg.chat.id, msg.message_id, blocks); }
      catch (e) {
        try { await api.editMessageReplyMarkup({ chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }); } catch (_) { /* old photo check-in */ }
        await sendBlocks(t.chatId, blocks);
      }
    } else await sendBlocks(t.chatId, blocks);
    return true;
  }
  if (!msg) { await ans(); return true; }
  const c = msg.chat.id;
  const t = await db.select().from(T).where(and(eq(T.chatId, c), eq(T.userId, u), inArray(T.status, ['collecting', 'choosing', 'custom']))).get();
  if (!t) { await ans('Ye Todo setup expire ho gaya ya tumhara nahi hai. /todo se dobara shuru karo.'); return true; }
  const edit = (blocks) => editBlocks(c, msg.message_id, blocks);
  if (data === 'todo_cancel') {
    await db.run("DELETE FROM study_todos WHERE todo_id=:id AND status IN ('collecting','choosing','custom')", { ':id': t.todoId });
    await ans(); await edit([head('❌ CANCELLED'), para('Todo cancelled.')]); return true;
  }
  if (t.status !== 'choosing') { await ans('Pehle Todo content bhejo.'); return true; }
  if (data === 'todo_custom') {
    const r = await db.run("UPDATE study_todos SET status='custom', updated_at=:n WHERE todo_id=:id AND status='choosing'", { ':n': nowIso(), ':id': t.todoId });
    await ans();
    if (r.rowsAffected) await edit([
      head('✏️ CUSTOM TIME'),
      para('Send the report time you\'d like.'),
      para('Example: ', code('9:45 PM'), ' or ', code('21:45')),
      cancelRow,
    ]);
    return true;
  }
  const [, hs, ms] = data.split(':');
  const h = +hs, m = +ms;
  if (h > 23 || m > 59) { await ans('Invalid time.'); return true; }
  const done = await schedule(t, h, m);
  await ans();
  if (done) await edit(createdBlocks(h, m));
  return true;
}
