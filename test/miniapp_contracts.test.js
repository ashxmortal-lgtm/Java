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

  const profileHtml = fs.readFileSync(path.join(repoRoot, 'web', 'profile.html'), 'utf8');
  assert(profileHtml.includes('js/profile.js'), 'web/profile.html must load js/profile.js');
});
