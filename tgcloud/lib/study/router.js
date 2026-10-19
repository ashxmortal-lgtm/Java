import { handleStudyHub } from './hub.js';
import { handleTrackerCommand, handleTrackerCallback } from './tracker.js';
import { handleStudytime, handleStudyText, handleStudyCb } from './studytime.js';
import { handleTodo, handleTodoInput, handleTodoCb } from './todo.js';
import { handleDuel, handleDuelText, handleDuelCb } from './duel.js';
import { handleReport, handleReportCb } from './report.js';
import { processDue } from './due.js';

const due = async () => { try { await processDue(); } catch (e) { console.error('study due error', e && (e.description || e.message)); } };

export async function handleStudyCommand(message) {
  if (!message.from || message.from.is_bot) return false;
  await due();
  const text = message.text || '';
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  if (cmd === '/study') { await handleStudyHub(message); return true; }
  if (cmd === '/tracker') { await handleTrackerCommand(message); return true; }
  if (cmd === '/studytime') { await handleStudytime(message); return true; }
  if (cmd === '/todo') { await handleTodo(message); return true; }
  if (cmd === '/duel') { await handleDuel(message); return true; }
  if (cmd === '/report') { await handleReport(message); return true; }
  if (text.startsWith('/')) return false;
  if (await handleDuelText(message)) return true;
  if (await handleTodoInput(message)) return true;
  if (await handleStudyText(message)) return true;
  return false;
}

export async function handleStudyCallback(cq) {
  const d = cq.data || '';
  if (!/^(tracker_|study_|todo_|duel_|report_)/.test(d)) return false;
  await due();
  return (await handleTrackerCallback(cq)) || (await handleStudyCb(cq)) || (await handleTodoCb(cq)) || (await handleDuelCb(cq)) || (await handleReportCb(cq));
}
