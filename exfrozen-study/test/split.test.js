import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
function walk(dir) {
  const out = [];
  for (const i of fs.readdirSync(path.join(root, dir))) {
    const p = `${dir}/${i}`;
    if (fs.statSync(path.join(root, p)).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const runtime = [...walk('tgcloud'), ...walk('web')].filter((f) => f.endsWith('.js') && !f.includes('source_snapshot'));

test('ExFrozen identity: app id, username, Mini App URL', () => {
  const cfg = read('tgcloud/lib/config.js');
  assert.match(cfg, /app8868570312/);
  assert.match(cfg, /exfrozen_bot/);
  assert.match(cfg, /https:\/\/app8868570312\.tgcloud\.ai\//);
  assert.doesNotMatch(cfg, /app8888370613|missfrozen_bot/);
  assert.match(read('web/js/contract.js'), /exfrozen_bot/);
});

test('study commands registered; gaming commands absent', () => {
  const reg = read('tgcloud/lib/command_registry.js');
  for (const c of ['/study', '/tracker', '/studytime', '/todo', '/duel', '/report', '/reminder', '/hnc', '/balance', '/leaderboard', '/imfrozen', '/announce', '/topic', '/qu', '/addadmingrp', '/start', '/help', '/owner', '/stats', '/groups', '/backup', '/ow_announce']) {
    assert.ok(reg.includes(`'${c}'`), `registry missing ${c}`);
  }
  for (const c of ['/eco', '/games', '/xoxo', '/rps', '/map', '/shinobi_store', '/claim', '/inventory', '/gift', '/kill', '/transfer', '/redeem', '/addcoins', '/create_cc']) {
    assert.ok(!reg.includes(`'${c}'`), `registry must not contain ${c}`);
  }
  const msg = read('tgcloud/handlers/message.js');
  assert.match(msg, /handleStudyCommand/);
  assert.doesNotMatch(msg, /games\/handler|map\/handler|rpg\/|economy_handler|handleGiftCommand|handleSocialCommand/);
});

test('/imfrozen present, /eco not registered', () => {
  const ga = read('tgcloud/lib/groupadmin.js');
  assert.match(ga, /cmd !== '\/imfrozen'/);
  assert.doesNotMatch(ga, /cmd !== '\/eco'|handleEco/);
  assert.match(ga, /isRegisteredAdmin/);
});

test('no Game/Study chooser; welcome/help are study-direct', () => {
  const w = read('tgcloud/lib/welcome_ui.js');
  assert.doesNotMatch(w, /Choose mode|Game ❄️ mode/);
  assert.match(w, /Study help/);
});

test('study economy is independent (no gaming claim/store imports)', () => {
  const eco = read('tgcloud/lib/economy.js');
  assert.match(eco, /adjustBalance/);
  assert.match(eco, /getStudyCoins/);
  assert.doesNotMatch(eco, /claimDaily|rpg\/levels/);
  // study rewards still credit balance via adjustBalance(..., {study:true})
  assert.match(read('tgcloud/lib/study/tracker.js'), /adjustBalance\(uid, 5000/);
  assert.match(read('tgcloud/lib/study/todo.js'), /adjustBalance\(u, ok \? 500 : -500/);
});

test('schema has study tables, no gaming tables, no deprecations', () => {
  const s = read('tgcloud/schema.js');
  for (const t of ['study_goals', 'study_todos', 'study_duels', 'biology_tracker', 'study_reminders', 'group_admins', 'quiz_topic_suggestions', 'users', 'known_groups', 'support_conversations']) {
    assert.ok(s.includes(`table('${t}'`), `schema missing ${t}`);
  }
  for (const t of ['inventory', 'shinobi_state', 'game_lobbies', 'coupons', 'clone_pending', 'map_gate_selection', 'group_settings']) {
    assert.ok(!s.includes(`table('${t}'`), `schema must not contain gaming table ${t}`);
  }
  assert.doesNotMatch(s, /\.deprecated\(/);
});

test('Mini App endpoint: study actions only, initData-authenticated', () => {
  const ep = read('tgcloud/endpoints/miniapp.js');
  assert.match(ep, /ctx\?\.initData\?\.user/);
  assert.match(ep, /'tracker_toggle'/);
  assert.match(ep, /'todo_update'/);
  assert.doesNotMatch(ep, /action === 'purchase'|action === 'claim'/);
  assert.doesNotMatch(ep, /store:|inventory:/);
  assert.ok(!exists('tgcloud/endpoints/getProfile.js'));
  const contract = read('web/js/contract.js');
  assert.doesNotMatch(contract, /'purchase'|'claim'|mini_map/);
});

test('no gaming callbacks/modules in runtime tree; no secrets', () => {
  for (const f of runtime) {
    const c = read(f);
    assert.doesNotMatch(c, /from\s+['"][^'"]*(games\/|map\/|rpg\/|coupons\.js|gift\.js|inventory\.js|shinobi)/, f);
    assert.doesNotMatch(c, /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/, `possible bot token in ${f}`);
    assert.doesNotMatch(c, /TGCLOUD_TOKEN\s*=\s*['"][^'"]+['"]/, f);
  }
  assert.ok(!exists('tgcloud/lib/games'));
  assert.ok(!exists('tgcloud/lib/rpg'));
  assert.ok(!exists('.env'));
});

test('deployment targets only app8868570312 with its own secret', () => {
  const wf = read('.github/workflows/deploy.yml');
  assert.match(wf, /TGCLOUD_TOKEN_EXFROZEN/);
  assert.match(wf, /app8868570312/);
  assert.doesNotMatch(wf, /app8888370613|TGCLOUD_TOKEN_MISSFROZEN/);
});
