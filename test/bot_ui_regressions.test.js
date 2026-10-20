import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asUint8Array, bytesToBase64 } from '../tgcloud/lib/base64.js';
import { groupChatLink } from '../tgcloud/lib/telegram_links.js';
import { screenKeyboard, screenText } from '../tgcloud/lib/store.js';
import { styleOutgoingPayload } from '../tgcloud/lib/message_style.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function allButtons(markup) {
  return markup.inline_keyboard.flat();
}

test('Shinobi Store lists items and launches direct purchases in the Mini App', () => {
  const main = screenKeyboard('main', 123, { includeMiniApp: true });
  const buttons = allButtons(main);
  const mainText = screenText('main', 1800);
  for (const name of ['Sasuke', 'Sakura', 'Naruto', 'Itachi', 'Hinata']) {
    assert(mainText.includes(name), `${name} must appear in the bot store`);
  }
  assert.equal(buttons.filter((button) => button.copy_text).length, 0, 'the bot store must not copy purchase commands');
  const launch = buttons.find((button) => button.web_app?.url);
  assert.equal(launch?.web_app?.url, 'https://app8868570312.tgcloud.ai/?page=store');

  assert.match(screenText('jutsu'), /Mind Transmission Jutsu/);
  assert.match(screenText('chakra'), /Chakra/);
  assert.match(mainText, /Balance: 1,800/);

  const rich = read('tgcloud', 'lib', 'rich.js');
  assert.match(rich, /Buy in Mini App/);
  assert.match(rich, /web_app:\s*\{\s*url: MINI_APP_STORE_URL/);
  const app = read('web', 'js', 'app.js');
  assert.match(app, /data-confirm-buy=/);
  assert.match(app, /action: 'purchase', itemName: name/);
});

test('copy_text content is not altered by font styling and transparent controls stay uncolored', () => {
  const styled = styleOutgoingPayload({
    reply_markup: {
      inline_keyboard: [[{
        text: 'Sasuke',
        copy_text: { text: 'Sasuke' },
        style: 'transparent',
      }]],
    },
  });
  const button = styled.reply_markup.inline_keyboard[0][0];
  assert.equal(button.copy_text.text, 'Sasuke');
  assert.notEqual(button.text, 'Sasuke');
  assert.equal(button.style, undefined);

  const rich = styleOutgoingPayload({
    rich_message: {
      html: '<tg-button-row align="center"><tg-button type="callback_data" data="map_home:1" style="transparent">Back</tg-button></tg-button-row>',
    },
  }).rich_message.html;
  assert.match(rich, /<tg-button-row align="center">/);
  assert.match(rich, /<tg-button type="callback_data" data="map_home:1">/);
  assert.doesNotMatch(rich, /style="primary"/);

  const mapButton = styleOutgoingPayload({
    reply_markup: { inline_keyboard: [[{ text: 'Gate', callback_data: 'map_loc_gate:1', style: 'primary' }]] },
  }).reply_markup.inline_keyboard[0][0];
  assert.equal(mapButton.style, undefined);
  const regularButton = styleOutgoingPayload({
    reply_markup: { inline_keyboard: [[{ text: 'Store', callback_data: 'store:main:1' }]] },
  }).reply_markup.inline_keyboard[0][0];
  assert.equal(regularButton.style, 'primary');
});

test('bot avatar byte encoding works without browser globals', () => {
  assert.equal(bytesToBase64(new Uint8Array([0x4d, 0x61, 0x6e])), 'TWFu');
  assert.equal(bytesToBase64(new Uint8Array([0])), 'AA==');
  assert.equal(bytesToBase64(new Uint8Array([0, 1])), 'AAE=');
  assert.equal(bytesToBase64(asUint8Array(new Uint8Array([0x4d, 0x61, 0x6e]).buffer)), 'TWFu');
  assert.equal(bytesToBase64(asUint8Array(new DataView(new Uint8Array([0, 1]).buffer))), 'AAE=');
});

test('group names link only through valid public usernames or supergroup message permalinks', () => {
  assert.equal(
    groupChatLink({ id: -1001234567890, type: 'supergroup', title: '77 & friends' }, 456),
    '<a href="https://t.me/c/1234567890/456">77 &amp; friends</a>',
  );
  assert.equal(
    groupChatLink({ id: -1001234567890, type: 'supergroup', title: 'Konoha', username: 'konoha_group' }, 456),
    '<a href="https://t.me/konoha_group">Konoha</a>',
  );
  assert.equal(groupChatLink({ id: -1234, type: 'group', title: '<old group>' }, 456), '&lt;old group&gt;');
});

test('Mini App store deep link, profile avatar, and removed /profile launcher are wired', () => {
  const app = read('web', 'js', 'app.js');
  assert.match(app, /want === 'store'[\s\S]*state\.page = 'store'/);
  const profile = read('web', 'js', 'profile.js');
  assert.match(profile, /renderBotAvatar\(profile\.botAvatar\)/);
  assert.match(read('web', 'profile.html'), /id="profile-bot-avatar"/);
  const economy = read('tgcloud', 'lib', 'economy_handler.js');
  assert.doesNotMatch(economy, /Open Profile Mini App|profileAppButton/);
  assert.match(economy, /const isPrivate = message\.chat\.type === 'private'/);
  assert.match(economy, /screenKeyboard\('main',\s*user\.id,\s*\{\s*includeMiniApp:\s*isPrivate\s*\}\)/);
});

test('leaderboards render rich tables and transfer DMs use a group permalink helper', () => {
  const economy = read('tgcloud', 'lib', 'economy_handler.js');
  assert.equal((economy.match(/table\(tableRows\)/g) || []).length, 2);
  assert.match(economy, /groupChatLink\(chat, message\.message_id\)/);
  assert.match(economy, /to \$\{mentionFn\(replied\)\} in \$\{grpName\}/);
});

test('inventory death is shown as user status, equipped shinobi are quoted, and blue controls are transparent', () => {
  const inventory = read('tgcloud', 'lib', 'inventory.js');
  assert.match(inventory, /blocks\.push\(para\(`Status: ☠️ dead/);
  assert.match(inventory, /tableRows\.push\(\[part\.name, part\.status, part\.returns\]\)/);
  assert.match(inventory, /quoteLines\(\[`👤 EQUIPPED/);
  assert.doesNotMatch(inventory, /'primary'/);
  const profile = read('tgcloud', 'lib', 'profile.js');
  assert.match(profile, /Object\.values\(states\).*isDead/);
});

test('Study button stays on the stats view and Study Hub no longer has the external footer', () => {
  const welcome = read('tgcloud', 'lib', 'welcome_ui.js');
  assert.match(welcome, /buildStudyStatsBlocks\(cq\.from\)/);
  assert.match(welcome, /await editTo\(cq, stats, true\)/);
  assert.match(welcome, /ᴜꜱᴇ: \/study ᴛᴏ ᴏᴘᴇɴ ꜱᴛᴜᴅʏ ʜᴜʙ/);
  assert.doesNotMatch(welcome, /handleStudyHub/);
  const hub = read('tgcloud', 'lib', 'study', 'hub.js');
  assert.doesNotMatch(hub, /SHEESH/);
});

test('/search_tsuna allows at most one active session per user, not one per group', () => {
  const source = read('tgcloud', 'lib', 'rpg', 'tsunade.js');
  assert.match(source, /FROM tsunade_search WHERE telegram_id = \$\{telegramId\}/);
  const inProgress = source.indexOf("if (row && row.status === 'active')");
  const newSession = source.indexOf('INSERT OR IGNORE INTO tsunade_search');
  assert(inProgress >= 0 && newSession > inProgress, 'active per-user search must be returned before starting a new one');
  assert.match(source, /WHERE telegram_id = \$\{id\} AND \(status != 'active' OR ends_at <= \$\{t\}\)/);
  assert.doesNotMatch(source, /NOT EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+tsunade_search/i);
});
