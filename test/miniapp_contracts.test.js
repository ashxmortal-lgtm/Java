import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

test('Mini App actions supported in endpoint match contract expectations', () => {
  const miniappJs = fs.readFileSync(path.join(repoRoot, 'tgcloud', 'endpoints', 'miniapp.js'), 'utf8');

  // Verify action handlers in miniapp.js matching web/js/contract.js ACTIONS
  const expectedActions = [
    'bootstrap',
    'claim',
    'purchase',
    'todo_update',
    'study_report_submit',
    'study_goal_complete',
    'tracker_toggle'
  ];

  for (const action of expectedActions) {
    const pattern = new RegExp(`action\\s*===\\s*['"]${action}['"]`);
    assert(pattern.test(miniappJs), `miniapp.js must handle action: ${action}`);
  }
});

test('Existing getProfile endpoint exists and exports default handler', () => {
  const getProfileJs = fs.readFileSync(path.join(repoRoot, 'tgcloud', 'endpoints', 'getProfile.js'), 'utf8');
  assert(getProfileJs.includes('export default async function'), 'getProfile.js must export default function');
  assert(getProfileJs.includes('profileData'), 'getProfile.js must call shared profileData');
});

test('Frontend app and contract files exist and define expected constants', () => {
  const contractJs = fs.readFileSync(path.join(repoRoot, 'web', 'js', 'contract.js'), 'utf8');
  assert(contractJs.length > 0, 'web/js/contract.js must not be empty');

  const appJs = fs.readFileSync(path.join(repoRoot, 'web', 'js', 'app.js'), 'utf8');
  assert(appJs.length > 0, 'web/js/app.js must not be empty');

  const indexHtml = fs.readFileSync(path.join(repoRoot, 'web', 'index.html'), 'utf8');
  assert(indexHtml.includes('js/contract.js'), 'web/index.html must load js/contract.js');
  assert(indexHtml.includes('js/app.js'), 'web/index.html must load js/app.js');
  assert(indexHtml.includes('css/app.css'), 'web/index.html must load css/app.css');

  assert(appJs.includes('Game mode'), 'home must offer Game mode');
  assert(appJs.includes('Study mode'), 'home must offer Study mode');
  assert(appJs.includes('https://t.me/frozenblooded'), 'footer credit must link to the Frozen Blooded chat');
  assert(appJs.includes("data-start=\"mini_todo\""), 'Create todo must open the bot /todo payload');
  assert(appJs.includes("data-start=\"mini_studytime\""), 'Study time must open the bot /studytime payload');

  const messageJs = fs.readFileSync(path.join(repoRoot, 'tgcloud', 'handlers', 'message.js'), 'utf8');
  assert(messageJs.includes('mini_todo'), 'bot must accept the todo deep link');
  assert(messageJs.includes('mini_studytime'), 'bot must accept the studytime deep link');
});

test('Mini App tracker catalog uses serializer-safe class keys and preserves both classes', async () => {
  const { BIOLOGY_TRACKER, miniAppTrackerCatalog } = await import('../tgcloud/lib/study/tracker_data.js');
  const catalog = miniAppTrackerCatalog();
  assert.deepEqual(Object.keys(catalog), ['class_11', 'class_12']);
  assert.deepEqual(catalog.class_11, BIOLOGY_TRACKER['11']);
  assert.deepEqual(catalog.class_12, BIOLOGY_TRACKER['12']);
  assert.equal(JSON.parse(JSON.stringify(catalog)).class_11.label, 'Class 11');
  assert.equal(JSON.parse(JSON.stringify(catalog)).class_12.label, 'Class 12');

  const endpointJs = fs.readFileSync(path.join(repoRoot, 'tgcloud', 'endpoints', 'miniapp.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(repoRoot, 'web', 'js', 'app.js'), 'utf8');
  assert.match(endpointJs, /tracker:\s*miniAppTrackerCatalog\(\)/);
  assert.match(appJs, /study\.tracker\['class_' \+ state\.classKey\]/);
});
