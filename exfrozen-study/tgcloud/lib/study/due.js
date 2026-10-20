import { db } from 'sdk';
import { eq } from 'sdk/db';
import { study_goals as G, study_todos as T, study_duels as D } from '../../schema.js';
import { istNow } from './common.js';
import { askStudy } from './studytime.js';
import { askTodo, expireDrafts } from './todo.js';
import { askDuel, duelIsDue } from './duel.js';

const safe = async (fn) => { try { await fn(); } catch (e) { console.error('study due error', e && (e.description || e.message)); } };

// Idempotent: every item is claimed with a conditional UPDATE, so parallel runs cannot double-send.
export async function processDue() {
  const now = istNow(), today = now.date, nowMin = now.hour * 60 + now.minute;
  await safe(expireDrafts);
  for (const g of await db.select().from(G).where(eq(G.status, 'goal_set')).all()) {
    if (g.goalDate > today || (g.goalDate === today && nowMin < 22 * 60)) continue;
    await safe(() => askStudy(g));
  }
  for (const t of await db.select().from(T).where(eq(T.status, 'scheduled')).all()) {
    if (t.lastSentDate === today || nowMin < t.reportHour * 60 + t.reportMinute) continue;
    await safe(() => askTodo(t, today));
  }
  for (const d of await db.select().from(D).where(eq(D.status, 'active')).all()) {
    if (duelIsDue(d, now)) await safe(() => askDuel(d));
  }
}
