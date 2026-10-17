import { api, db, EndpointError } from 'sdk';
import { and, eq } from 'sdk/db';
import {
  biology_tracker,
  inventory,
  study_goals,
  study_todos,
} from '../schema.js';
import { profileData } from '../lib/profile.js';
import { claimDaily } from '../lib/economy.js';
import { DAILY_COINS, DAILY_CHAKRA, BONUS_COINS, BONUS_CHAKRA, SAKURA_COINS, SAKURA_CHAKRA } from '../lib/economy.js';
import { ITEMS, CHAKRA_RATE, CHAKRA_MIN, findItem } from '../lib/store.js';
import { purchase } from '../lib/purchase.js';
import { GIFTS } from '../lib/gift.js';
import { ROWS as ABILITY_ROWS } from '../lib/ability.js';
import { levelUpData } from '../lib/levels.js';
import { pendingRewardTotal } from '../lib/map/pending.js';
import { getChapter, miniAppTrackerCatalog } from '../lib/study/tracker_data.js';
import { toggleTracker, adjustTracker } from '../lib/study/tracker.js';
import { istNow, nowIso } from '../lib/study/common.js';

const fail = (message, code) => { throw new EndpointError(message, { code }); };
const safeId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const drafts = new Set(['collecting', 'choosing', 'custom']);
const todoStatuses = new Set(['scheduled', 'asked', 'closed']);
const goalStatuses = new Set(['goal_set', 'asked', 'report_submitted', 'closed']);
const ERROR_REPORT_OWNER_ID = 8716863150;
const ERROR_REPORT_CHUNK_SIZE = 3500;
const ERROR_REPORT_DEDUPE_MS = 60_000;
const ERROR_REPORT_DEDUPE_LIMIT = 100;
const recentErrorReports = new Map();
const MINIAPP_ACTIONS = new Set([
  'bootstrap', 'claim', 'purchase', 'todo_update', 'study_report_submit',
  'study_goal_complete', 'tracker_toggle', 'tracker_adjust',
]);

function sanitizeDiagnosticText(value, user) {
  let text = String(value ?? '');
  for (const key of ['id', 'username', 'first_name', 'last_name', 'phone_number']) {
    let personalValue;
    try { personalValue = user?.[key]; } catch (_) {}
    if (typeof personalValue === 'string' || typeof personalValue === 'number') {
      const secret = String(personalValue);
      if (secret.length >= 2) text = text.split(secret).join('[redacted user data]');
    }
  }
  return text
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted bot token]')
    .replace(/\bTMA\s+[A-Za-z0-9+/=_-]{16,}/gi, 'TMA [redacted initData]')
    .replace(/\b(initData|init_data|tgWebAppData)\s*[:=]\s*[^,\s;]+/gi, '$1=[redacted]')
    .replace(/\b(authorization)\s*[:=]\s*[^\r\n,;]+/gi, '$1=[redacted]')
    .replace(/\b(token|secret|password)\s*[:=]\s*[^,\s;]+/gi, '$1=[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, '[redacted phone number]')
    .replace(/@[A-Za-z0-9_]{5,}/g, '[redacted handle]')
    .replace(/\b\d{6,20}\b/g, '[redacted numeric identifier]');
}

function errorField(error, field, fallback) {
  try {
    const value = error?.[field];
    return typeof value === 'string' && value ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function errorFingerprint(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isDuplicateErrorReport(fingerprint, now) {
  for (const [key, expiresAt] of recentErrorReports) {
    if (expiresAt <= now) recentErrorReports.delete(key);
  }
  if (recentErrorReports.has(fingerprint)) return true;
  recentErrorReports.set(fingerprint, now + ERROR_REPORT_DEDUPE_MS);
  while (recentErrorReports.size > ERROR_REPORT_DEDUPE_LIMIT) {
    recentErrorReports.delete(recentErrorReports.keys().next().value);
  }
  return false;
}

function splitTelegramText(text, limit = ERROR_REPORT_CHUNK_SIZE) {
  const chunks = [];
  let chunk = '';
  for (const character of text) {
    if (chunk.length + character.length > limit) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

async function reportMiniAppRuntimeError(error, action, user) {
  try {
    const safeAction = MINIAPP_ACTIONS.has(action) ? action : 'unknown';
    const name = sanitizeDiagnosticText(
      errorField(error, 'name', 'NonErrorThrow'), user,
    );
    const message = sanitizeDiagnosticText(
      errorField(error, 'message', String(error)), user,
    );
    const stack = sanitizeDiagnosticText(
      errorField(error, 'stack', '(stack unavailable)'), user,
    );
    const fingerprint = errorFingerprint(`${safeAction}\n${name}\n${message}\n${stack}`);
    const now = Date.now();
    if (isDuplicateErrorReport(fingerprint, now)) return;

    const timestamp = new Date(now).toISOString();
    const report = [
      'Frozen Blooded Mini App runtime error',
      'Endpoint: miniapp',
      `Action: ${safeAction}`,
      `Timestamp: ${timestamp}`,
      `Error name: ${name}`,
      `Error message: ${message}`,
      'Stack:',
      stack,
    ].join('\n');
    const chunks = splitTelegramText(report);
    for (let i = 0; i < chunks.length; i += 1) {
      await api.sendMessage({
        chat_id: ERROR_REPORT_OWNER_ID,
        text: `[Mini App error ${fingerprint} | part ${i + 1}/${chunks.length}]\n${chunks[i]}`,
      });
    }
  } catch (reportError) {
    try { console.error('Mini App owner error report failed; preserving original exception.', reportError); } catch (_) {}
  }
}


function byUpdatedAt(a, b) {
  return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
}

async function dashboard(user) {
  const uid = user.id;
  // Profile is required. Study/economy extras are isolated so one failure
  // cannot turn the entire Mini App bootstrap into HTTP 500.
  const profile = await profileData(user);

  async function safe(label, fn, fallback) {
    try { return await fn(); }
    catch (err) {
      try { console.error('miniapp dashboard partial failure:', label, err && err.message); } catch (_) {}
      return fallback;
    }
  }

  const [owned, rawTodos, rawGoals, trackerRows, levels, pendingRewards] = await Promise.all([
    safe('inventory', () => db.select().from(inventory).where(eq(inventory.telegramId, uid)).all(), []),
    safe('study_todos', () => db.select().from(study_todos).where(eq(study_todos.userId, uid)).all(), []),
    safe('study_goals', () => db.select().from(study_goals).where(eq(study_goals.userId, uid)).all(), []),
    safe('biology_tracker', () => db.select().from(biology_tracker).where(eq(biology_tracker.userId, uid)).all(), []),
    safe('levels', () => levelUpData(user), null),
    safe('pendingRewards', () => pendingRewardTotal(uid), 0),
  ]);

  const todos = rawTodos
    .filter((t) => !drafts.has(t.status) && todoStatuses.has(t.status))
    .sort(byUpdatedAt)
    .slice(0, 30)
    .map((t) => ({
      id: t.todoId,
      chatId: t.chatId,
      text: t.contentText || (t.contentType === 'photo' ? 'Image todo' : ''),
      contentType: t.contentType || 'text',
      status: t.status,
      completed: t.completed == null ? null : !!t.completed,
      reportHour: t.reportHour,
      reportMinute: t.reportMinute,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

  const goals = rawGoals
    .filter((g) => goalStatuses.has(g.status))
    .sort(byUpdatedAt)
    .slice(0, 20)
    .map((g) => ({
      id: g.id,
      chatId: g.chatId,
      goalText: g.goalText || '',
      goalDate: g.goalDate || '',
      status: g.status,
      reportText: g.reportText || '',
      completed: g.completed == null ? null : !!g.completed,
      updatedAt: g.updatedAt,
    }));

  const ownedByName = new Map(owned.map((item) => [item.itemName, item]));
  return {
    profile,
    balance: {
      coins: profile.balance,
      kills: profile.kills,
      rank: profile.rank,
      chakra: profile.chakra,
      pendingRewards,
    },
    inventory: owned.map((item) => ({ type: item.itemType, name: item.itemName, qty: item.qty || 1 })),
    store: [
      ...ITEMS.map((item) => ({ ...item, owned: ownedByName.has(item.name) })),
      { name: 'Chakra', emoji: '⚡', price: CHAKRA_MIN * CHAKRA_RATE, type: 'chakra', qty: CHAKRA_MIN, owned: false },
    ],
    abilities: ABILITY_ROWS.map(([name, description]) => ({ name, description })),
    levels,
    gifts: GIFTS.map(({ id, emoji, name, price }) => ({ id, emoji, name, price })),
    study: {
      today: istNow().date,
      tracker: miniAppTrackerCatalog(),
      trackerRows: trackerRows.map((r) => ({
        chapterId: r.chapterId,
        revisionCount: r.revisionCount,
        practiceCount: r.practiceCount,
        pyqCount: r.pyqCount,
        revisionDone: !!r.revisionDone,
        practiceDone: !!r.practiceDone,
        pyqDone: !!r.pyqDone,
      })),
      todos,
      goals,
    },
  };
}

async function handleMiniApp(input, ctx) {
  // The platform verifies initData. Never accept an account ID from the browser.
  const user = ctx?.initData?.user;
  if (!user || !safeId(user.id)) {
    fail('Open the Mini App from Telegram to access your account.', 'UNAUTHORIZED');
  }

  const action = String(input?.action || 'bootstrap');
  if (action === 'bootstrap') return dashboard(user);

  if (action === 'claim') {
    const claim = await claimDaily(user.id);
    return { claim, rewards: {
      dailyCoins: DAILY_COINS,
      dailyChakra: DAILY_CHAKRA,
      bonusCoins: BONUS_COINS,
      bonusChakra: BONUS_CHAKRA,
      sakuraCoins: SAKURA_COINS,
      sakuraChakra: SAKURA_CHAKRA,
    }, dashboard: await dashboard(user) };
  }

  if (action === 'purchase') {
    const name = String(input?.itemName || '').trim();
    // Chakra is multi-buy: each tap buys CHAKRA_MIN units at CHAKRA_RATE coins each.
    if (name.toLowerCase() === 'chakra') {
      const qty = CHAKRA_MIN;
      const cost = qty * CHAKRA_RATE;
      const result = await purchase(user.id, null, {
        type: 'chakra',
        name: 'Chakra',
        qty,
        cost,
      });
      return {
        purchase: result,
        item: { name: 'Chakra', emoji: '⚡', type: 'chakra', price: cost, qty },
        dashboard: await dashboard(user),
      };
    }
    const item = ITEMS.find((candidate) => candidate.name === name);
    if (!item) fail('That item is not available in the Shinobi Store.', 'ITEM_NOT_FOUND');
    const result = await purchase(user.id, null, {
      type: item.type,
      name: item.name,
      qty: 1,
      cost: item.price,
    });
    return { purchase: result, item, dashboard: await dashboard(user) };
  }

  if (action === 'todo_update') {
    const todoId = Number(input?.todoId);
    if (!Number.isSafeInteger(todoId) || todoId <= 0 || typeof input?.completed !== 'boolean') {
      fail('Choose a valid todo and completion status.', 'INVALID_TODO');
    }
    const todo = await db.select().from(study_todos)
      .where(and(eq(study_todos.todoId, todoId), eq(study_todos.userId, user.id))).get();
    if (!todo) fail('That todo does not belong to your Telegram account.', 'TODO_NOT_FOUND');
    if (todo.status === 'closed') {
      if (!!todo.completed === input.completed) return { changed: false, dashboard: await dashboard(user) };
      fail('This todo has already been reported to the bot.', 'TODO_CLOSED');
    }
    if (!['scheduled', 'asked'].includes(todo.status)) fail('This todo is not ready to be reported.', 'TODO_NOT_ACTIVE');
    const r = await db.run(
      "UPDATE study_todos SET completed=:done, status='closed', updated_at=:now WHERE todo_id=:id AND user_id=:uid AND status IN ('scheduled','asked')",
      { ':done': input.completed ? 1 : 0, ':now': nowIso(), ':id': todoId, ':uid': user.id },
    );
    if (!r.rowsAffected) fail('This todo changed in another session. Refresh and try again.', 'TODO_CONFLICT');
    return { changed: true, dashboard: await dashboard(user) };
  }

  if (action === 'study_report_submit') {
    const goalId = Number(input?.goalId);
    const text = String(input?.text || '').trim();
    if (!Number.isSafeInteger(goalId) || goalId <= 0) fail('Choose a valid study goal.', 'INVALID_GOAL');
    if (!text || text.length > 500) fail('Write a report between 1 and 500 characters.', 'INVALID_REPORT');
    const goal = await db.select().from(study_goals)
      .where(and(eq(study_goals.id, goalId), eq(study_goals.userId, user.id))).get();
    if (!goal) fail('That study goal does not belong to your Telegram account.', 'GOAL_NOT_FOUND');
    if (!['goal_set', 'asked'].includes(goal.status)) fail('This study goal is not waiting for a report.', 'GOAL_NOT_PENDING');
    const r = await db.run(
      "UPDATE study_goals SET report_text=:text, status='report_submitted', updated_at=:now WHERE id=:id AND user_id=:uid AND status IN ('goal_set','asked')",
      { ':text': text, ':now': nowIso(), ':id': goalId, ':uid': user.id },
    );
    if (!r.rowsAffected) fail('This study goal changed in another session. Refresh and try again.', 'GOAL_CONFLICT');
    return { changed: true, dashboard: await dashboard(user) };
  }

  if (action === 'study_goal_complete') {
    const goalId = Number(input?.goalId);
    if (!Number.isSafeInteger(goalId) || goalId <= 0 || typeof input?.completed !== 'boolean') {
      fail('Choose a valid goal result.', 'INVALID_GOAL_RESULT');
    }
    const goal = await db.select().from(study_goals)
      .where(and(eq(study_goals.id, goalId), eq(study_goals.userId, user.id))).get();
    if (!goal) fail('That study goal does not belong to your Telegram account.', 'GOAL_NOT_FOUND');
    if (goal.status === 'closed') {
      if (!!goal.completed === input.completed) return { changed: false, dashboard: await dashboard(user) };
      fail('This study goal has already been closed.', 'GOAL_CLOSED');
    }
    if (goal.status !== 'report_submitted') fail('Submit your study report before choosing a result.', 'REPORT_REQUIRED');
    const r = await db.run(
      "UPDATE study_goals SET completed=:done, status='closed', updated_at=:now WHERE id=:id AND user_id=:uid AND status='report_submitted'",
      { ':done': input.completed ? 1 : 0, ':now': nowIso(), ':id': goalId, ':uid': user.id },
    );
    if (!r.rowsAffected) fail('This study goal changed in another session. Refresh and try again.', 'GOAL_CONFLICT');
    return { changed: true, dashboard: await dashboard(user) };
  }

  if (action === 'tracker_toggle') {
    const chapterId = String(input?.chapterId || '');
    const activity = String(input?.activity || '');
    if (!getChapter(chapterId) || !['revision', 'practice', 'pyq'].includes(activity)) {
      fail('Choose a valid tracker chapter and activity.', 'INVALID_TRACKER_ACTION');
    }
    await toggleTracker(user.id, chapterId, activity);
    return { changed: true, dashboard: await dashboard(user) };
  }

  if (action === 'tracker_adjust') {
    const chapterId = String(input?.chapterId || '');
    const activity = String(input?.activity || '');
    const delta = Number(input?.delta);
    if (!getChapter(chapterId) || !['revision', 'practice', 'pyq'].includes(activity) || (delta !== 1 && delta !== -1)) {
      fail('Choose a valid tracker chapter, activity and delta.', 'INVALID_TRACKER_ADJUST');
    }
    await adjustTracker(user.id, chapterId, activity, delta);
    return { changed: true, dashboard: await dashboard(user) };
  }

  fail('Unknown Mini App action.', 'UNKNOWN_ACTION');
}

export default async function (input, ctx) {
  const rawAction = input?.action;
  const requestedAction = typeof rawAction === 'string'
    ? (rawAction || 'bootstrap')
    : (rawAction == null ? 'bootstrap' : 'unknown');
  const action = MINIAPP_ACTIONS.has(requestedAction) ? requestedAction : 'unknown';
  try {
    return await handleMiniApp(input, ctx);
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    try { console.error(`[miniapp] ${action} runtime exception`, error); } catch (_) {}
    try { await reportMiniAppRuntimeError(error, action, ctx?.initData?.user); } catch (_) {}
    // Rethrow the original: TGCloud returns a generic 500 to the Mini App.
    throw error;
  }
}
