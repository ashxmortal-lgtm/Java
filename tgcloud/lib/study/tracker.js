import { db } from 'sdk';
import { api } from '../message_api.js';
import { eq, and, inArray } from 'sdk/db';
import { biology_tracker as T } from '../../schema.js';
import { BIOLOGY_TRACKER, getUnit, getChapter } from './tracker_data.js';
import { mention, nowIso, sendBlocks, editBlocks, rp, head, para, bold, divider, row, btn } from './common.js';

const ACTS = {
  revision: { label: 'Revision', done: 'revisionDone', count: 'revisionCount', col: 'revision' },
  practice: { label: 'Practice', done: 'practiceDone', count: 'practiceCount', col: 'practice' },
  pyq: { label: 'PYQ', done: 'pyqDone', count: 'pyqCount', col: 'pyq' },
};

const num = (id) => id.split('_')[1];
const counts = (r) => (r ? [r.revisionCount, r.practiceCount, r.pyqCount] : [0, 0, 0]);
const icon = (r) => {
  const c = counts(r);
  if (c.every((n) => n >= 1)) return '🟢';
  if (c.some((n) => n >= 1)) return '🟡';
  return '🔴';
};
const statusLabel = (r) => ({ '🟢': 'Completed', '🟡': 'In Progress', '🔴': 'Incomplete' }[icon(r)]);
const chStyle = (r) => (icon(r) === '🟢' ? 'success' : icon(r) === '🟡' ? 'primary' : undefined);

const getRow = (uid, chId) =>
  db.select().from(T).where(and(eq(T.userId, uid), eq(T.chapterId, chId))).get();

async function toggle(uid, chId, act) {
  const a = ACTS[act];
  if (!a) return;
  if (!(await getRow(uid, chId))) {
    try { await db.insert(T).values({ userId: uid, chapterId: chId, updatedAt: nowIso() }).run(); }
    catch (e) { /* concurrent insert: row exists now */ }
  }
  await db.run(
    `UPDATE biology_tracker SET ${a.col}_count = ${a.col}_count + (1 - ${a.col}_done), ` +
    `${a.col}_done = 1 - ${a.col}_done, updated_at = :t WHERE user_id = :u AND chapter_id = :c`,
    { ':t': nowIso(), ':u': uid, ':c': chId });
  await db.run(
    'UPDATE biology_tracker SET xp_cycles_awarded = min(revision_count, practice_count, pyq_count) ' +
    'WHERE user_id = :u AND chapter_id = :c AND min(revision_count, practice_count, pyq_count) > xp_cycles_awarded',
    { ':u': uid, ':c': chId });
}

const nav = (backData, backLabel = '⬅️ Back') => row(
  btn(backLabel, backData),
  btn('❌ Close', 'tracker_close', 'danger'),
);

const homeView = (user) => [
  head('🧬 𝐁𝐈𝐎𝐋𝐎𝐆𝐘 𝐓𝐑𝐀𝐂𝐊𝐄𝐑'),
  para('🥷 ', mention(user)),
  para('Track Revision · Practice · PYQ for every chapter.'),
  divider,
  para('🟢 Completed · 🟡 In Progress · 🔴 Incomplete'),
  para('Pick your class to open the planner:'),
  row(
    btn('📗 Class 11', 'tracker_class:11', 'primary'),
    btn('📘 Class 12', 'tracker_class:12', 'primary'),
  ),
  row(btn('❌ Close', 'tracker_close', 'danger')),
];

function classView(key) {
  const c = BIOLOGY_TRACKER[key];
  if (!c) return null;
  const blocks = [
    head(`${c.icon} ${c.label.toUpperCase()} PLANNER`),
    para('Pick a unit:'),
    divider,
  ];
  for (const u of c.units) blocks.push(row(btn(u.short, `tracker_unit:${u.id}`, 'primary')));
  blocks.push(nav('tracker_home'));
  return blocks;
}

async function unitView(uid, unitId) {
  const u = getUnit(unitId);
  if (!u) return null;
  const rows = await db.select().from(T).where(and(eq(T.userId, uid), inArray(T.chapterId, u.chapters.map((c) => c.id)))).all();
  const by = Object.fromEntries(rows.map((r) => [r.chapterId, r]));
  const blocks = [
    head('🧬 ' + u.title),
    para('🟢 Completed · 🟡 In Progress · 🔴 Incomplete'),
    divider,
    para('Pick a chapter:'),
  ];
  for (const c of u.chapters) {
    const r = by[c.id];
    blocks.push(row(btn(`${icon(r)} ${num(c.id)}. ${c.name}`, `tracker_ch:${c.id}`, chStyle(r))));
  }
  blocks.push(nav(`tracker_class:${unitId.split('_')[0]}`));
  return blocks;
}

async function chapterView(uid, chId) {
  const ch = getChapter(chId);
  if (!ch) return null;
  const r = await getRow(uid, chId);
  const line = (k) => {
    const a = ACTS[k];
    const d = r && r[a.done] ? '✅' : '❌';
    return para(bold(a.label), `  ${d}  × ${r ? r[a.count] : 0}`);
  };
  const blocks = [
    head('🕸️ ' + ch.name),
    para(`${icon(r)} `, bold(statusLabel(r))),
    divider,
    line('revision'),
    line('practice'),
    line('pyq'),
    divider,
    para('Tap a button to toggle. Marking ✅ adds +1 to the count.'),
  ];
  for (const k of Object.keys(ACTS)) {
    const on = r && r[ACTS[k].done];
    blocks.push(row(btn(`${on ? '✅' : '❌'} ${ACTS[k].label}`, `tracker_tog:${chId}:${k}`, on ? 'success' : 'primary')));
  }
  blocks.push(nav(`tracker_unit:${ch.unitId}`, '⬅️ Back to unit'));
  return blocks;
}

export async function handleTrackerCommand(message) {
  await sendBlocks(message.chat.id, homeView(message.from), rp(message.message_id));
}

// Returns true if this callback belonged to the tracker.
export async function handleTrackerCallback(cb) {
  const data = cb.data || '';
  if (!(data === 'tracker_home' || data === 'tracker_close' || /^tracker_(class|unit|ch|tog):/.test(data))) return false;
  const msg = cb.message;
  const owner = msg && msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.id;
  if (owner && owner !== cb.from.id) {
    await api.answerCallbackQuery({ callback_query_id: cb.id, text: 'Ye tumhara tracker nahi hai. /tracker use karo.' });
    return true;
  }
  if (!msg) { await api.answerCallbackQuery({ callback_query_id: cb.id }); return true; }
  const uid = cb.from.id;
  const [kind, a, b] = data.split(':');
  let view = null;
  if (kind === 'tracker_close') {
    try { await api.deleteMessage({ chat_id: msg.chat.id, message_id: msg.message_id }); } catch (e) { /* already gone */ }
    await api.answerCallbackQuery({ callback_query_id: cb.id });
    return true;
  }
  if (kind === 'tracker_home') view = homeView(cb.from);
  else if (kind === 'tracker_class') view = classView(a);
  else if (kind === 'tracker_unit') view = await unitView(uid, a);
  else if (kind === 'tracker_ch') view = await chapterView(uid, a);
  else if (kind === 'tracker_tog') {
    if (getChapter(a) && ACTS[b]) { await toggle(uid, a, b); view = await chapterView(uid, a); }
  }
  if (!view) { await api.answerCallbackQuery({ callback_query_id: cb.id, text: 'Ye button purana hai. /tracker dobara kholo.' }); return true; }
  await editBlocks(msg.chat.id, msg.message_id, view);
  await api.answerCallbackQuery({ callback_query_id: cb.id });
  return true;
}
