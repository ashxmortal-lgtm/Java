import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Support inbox uses /owner as primary command and delivers replies even when paused', () => {
  const code = read('tgcloud', 'lib', 'support_inbox.js');
  assert.match(code, /\/owner/);
  assert.match(code, /https:\/\/t\.me\/frozenblooded/);
  assert.match(code, /𝑭𝒓❄️𝒛𝒆𝒏 𝑩𝒍𝒐𝒐𝒅𝒆𝒅/);
  assert.doesNotMatch(code, /if \(convo && \(convo\.isBanned \|\| convo\.status !== 'active'\)\) return true;/);
});

test('Welcome message has embedded bot link and mini profile labels', () => {
  const code = read('tgcloud', 'lib', 'welcome_ui.js');
  assert.match(code, /is a Naruto-inspired game bot for groups and anime fans/);
  assert.match(code, /🥷 Shinobi:/);
  assert.match(code, /🍥 Balance:/);
  assert.match(code, /⚡ Owned Jutsu:/);
  assert.match(code, /⚔️ Kills:/);
  assert.match(code, /🏆 Global Rank:/);
});

test('Shinobi Store equip instruction and tap-to-copy code blocks', () => {
  const code = read('tgcloud', 'lib', 'rich.js');
  assert.match(code, /ᴜꜱᴇ \/equip <shinobi name> & \/unequip & <shinobi name>/);
  assert.match(code, /ᴍᴀx 3 active shinobis can be ᴇǫᴜɪᴘᴘᴇᴅ, rest shinobis will be passive/);
  assert.match(code, /type: 'code', text: i\.name/);
});

test('Starter Shinobi never dies in state or status derivation', () => {
  const stateCode = read('tgcloud', 'lib', 'rpg', 'state.js');
  assert.match(stateCode, /if \(state\?\.shinobi === 'Starter Shinobi'\) return false;/);
  const statusCode = read('tgcloud', 'lib', 'rpg', 'status.js');
  assert.match(statusCode, /if \(name === 'Starter Shinobi'\)/);
  const invCode = read('tgcloud', 'lib', 'inventory.js');
  assert.match(invCode, /r\.name !== 'Starter Shinobi'/);
});

test('Transfer receipt uses specified wording', () => {
  const code = read('tgcloud', 'lib', 'economy_handler.js');
  assert.match(code, /🕸️ transferred \$\{fmt\(amount\)\} 🍥 to your account\.\\nGrp name:  \$\{grpName\}\\nUse: \/balance to check/);
});

test('Balance layout matches spec without divider and with shinobi rank emoji', () => {
  const code = read('tgcloud', 'lib', 'balance.js');
  assert.doesNotMatch(code, /─────────────────⟢/);
  assert.match(code, /🥷🏻 \$\{mention\(user\)\}/);
  assert.match(code, /🥷🏻 Shinobi Rank:/);
});

test('Coupons module and owner commands exist and are wired', () => {
  const couponCode = read('tgcloud', 'lib', 'coupons.js');
  assert.match(couponCode, /export async function handleCreateCoupon/);
  assert.match(couponCode, /export async function handleListCoupons/);
  assert.match(couponCode, /export async function handleEditCoupon/);
  assert.match(couponCode, /export async function handleRedeemCoupon/);

  const ownerCode = read('tgcloud', 'lib', 'owner_cmds.js');
  assert.match(ownerCode, /\/create_cc/);
  assert.match(ownerCode, /\/list_cc/);
  assert.match(ownerCode, /\/edit_cc/);
});

test('Coupon wizard supports multiple reward types, custom or never expiry, editing and text input routing', () => {
  const couponCode = read('tgcloud', 'lib', 'coupons.js');
  for (const reward of ['shinobi', 'coins', 'chakra', 'gifts']) assert.match(couponCode, new RegExp(reward));
  for (const phase of ['reward_values', 'expiry_days', 'rename', 'edit_ready']) assert.match(couponCode, new RegExp(phase));
  assert.match(couponCode, /cc:expiry:never/);
  assert.match(couponCode, /cc:expiry:custom/);
  assert.match(couponCode, /cc:edit:save_rewards/);
  assert.match(couponCode, /cc:edit:save_expiry/);
  assert.match(couponCode, /export async function handleCouponWizardText/);

  const messages = read('tgcloud', 'handlers', 'message.js');
  assert.match(messages, /if \(await handleCouponWizardText\(message\)\) return/);
  const callbacks = read('tgcloud', 'lib', 'owner_cmds.js');
  assert.match(callbacks, /data\.startsWith\('cc:'\).*handleCouponWizardCallback/);
});

test('Legacy inline keyboards are rendered as Rich Message rows and /help command tokens use plain code font', () => {
  const adapter = read('tgcloud', 'lib', 'message_api.js');
  assert.match(adapter, /function richRows\(keyboard\)/);
  assert.match(adapter, /<tg-button-row align="center">/);
  assert.match(adapter, /tg-button type="\$\{type\}"/);
  assert.match(adapter, /methodName !== 'sendMessage' && methodName !== 'editMessageText'/);
  assert.match(adapter, /sendRichMessage/);

  const help = read('tgcloud', 'lib', 'welcome_ui.js');
  assert.match(help, /const command = \(text\) => \(\{ type: 'code', text \}\)/);
  assert.match(help, /commandLine\('\/search_tsuna'/);
});

test('Mini App feedback launches the /owner support menu through a whitelisted payload', () => {
  const app = read('web', 'js', 'app.js');
  assert.match(app, /\?start=mini_owner/);
  const messages = read('tgcloud', 'handlers', 'message.js');
  assert.match(messages, /mini_owner: '\/owner'/);
  assert.match(messages, /handleSupportCommand\(\{ \.\.\.message, text: '\/owner' \}\)/);
});

test('Games hub includes /rps_cancel and XOXO/RPS winner announcements format', () => {
  const lobbyCode = read('tgcloud', 'lib', 'games', 'lobby.js');
  assert.match(lobbyCode, /export async function abortRpsMatch/);
  assert.match(lobbyCode, /Winner: \$\{winMention\}/);
  assert.match(lobbyCode, /added to your account/);
  assert.match(lobbyCode, /\/rps_cancel/);

  const handlerCode = read('tgcloud', 'lib', 'games', 'handler.js');
  assert.match(handlerCode, /abortRpsMatch/);

  const msgHandler = read('tgcloud', 'handlers', 'message.js');
  assert.match(msgHandler, /rps_cancel/);
});

test('Tsunade search sweep is implemented and announced', () => {
  const tsunadeCode = read('tgcloud', 'lib', 'rpg', 'tsunade.js');
  assert.match(tsunadeCode, /export async function sweepTsunadeSearches/);
  const ecoCode = read('tgcloud', 'lib', 'economy_handler.js');
  assert.match(ecoCode, /sweepTsunadeSearches/);
});

test('Gate and Hokage UI support 2-per-row, Select All, and busy/exhausted filters', () => {
  const mapCode = read('tgcloud', 'lib', 'map', 'handler.js');
  assert.match(mapCode, /map_pall/);
  assert.match(mapCode, /map_mall/);
  assert.match(mapCode, /getEligibleStatus/);
  assert.match(mapCode, /missionPickKeyboard/);
  assert.match(mapCode, /patrolPickKeyboard/);
});
