/**
 * Map keyboards + captions (mirrors Python map.py layout, no pets).
 */

function btn(text, data) {
  return { text, callback_data: data };
}

/** Embed user_id so only the opener can press the button. */
export function guard(prefix, userId) {
  return `${prefix}:${userId}`;
}

const LONG = 18;

function rowsPair(items) {
  const rows = [];
  let i = 0;
  while (i < items.length) {
    const [t1, d1] = items[i];
    const long1 = t1.length >= LONG;
    if (long1 || i + 1 >= items.length) {
      rows.push([btn(t1, d1)]);
      i += 1;
      continue;
    }
    const [t2, d2] = items[i + 1];
    if (t2.length >= LONG) {
      rows.push([btn(t1, d1)]);
      i += 1;
      continue;
    }
    rows.push([btn(t1, d1), btn(t2, d2)]);
    i += 2;
  }
  return rows;
}

export function mapKeyboard(userId) {
  const items = [
    ['🏯 ʜᴏᴋᴀɢᴇ', guard('map_loc_hokage', userId)],
    ['🍜 ɪᴄʜɪʀᴀᴋᴜ', guard('map_loc_ichiraku', userId)],
    ['🍖 ʙʙǫ', guard('map_loc_bbq', userId)],
    ['🚪 ɢᴀᴛᴇ', guard('map_loc_gate', userId)],
    ['🥷 ᴛʀᴀɪɴɪɴɢ', guard('map_loc_training', userId)],
    ['♨️ ʜᴏᴛ sᴘʀɪɴɢs', guard('map_loc_hotsprings', userId)],
    ['🏪 sᴛᴏʀᴇ', guard('map_loc_store', userId)],
  ];
  return { inline_keyboard: rowsPair(items) };
}

export function backToMapRow(userId) {
  return [btn('🗺 ʙᴀᴄᴋ ᴛᴏ ᴍᴀᴘ', guard('map_home', userId))];
}

export function hokageKeyboard(userId) {
  return {
    inline_keyboard: [
      [btn('🥷 sʜɪɴᴏʙɪ ᴍɪssɪᴏɴ', guard('map_mission_hub', userId))],
      [btn('🎯 ᴅᴀɪʟʏ ᴍɪssɪᴏɴ', guard('map_daily', userId))],
      [btn('💰 ᴄʟᴀɪᴍ ᴘᴀᴛʀᴏʟ', guard('map_claim_patrol', userId))],
      backToMapRow(userId),
    ],
  };
}

export function gateKeyboard(userId) {
  return {
    inline_keyboard: [
      [btn('🚪 sᴛᴀʀᴛ ᴘᴀᴛʀᴏʟ', guard('map_patrol_select', userId))],
      backToMapRow(userId),
    ],
  };
}

export function ichirakuKeyboard(userId) {
  return {
    inline_keyboard: [
      [btn('🍜 ʀᴀᴍᴇɴ', guard('map_ichi_cat_ramen', userId))],
      [btn('⚡ ғɪᴇʟᴅ ᴍᴇᴀʟs', guard('map_ichi_cat_field', userId))],
      // Pet food omitted for now
      backToMapRow(userId),
    ],
  };
}

export function bbqKeyboard(userId) {
  return {
    inline_keyboard: [
      [btn('🍖 sᴇɴᴅ ᴛᴏ ʙʙǫ', guard('map_bbq_select', userId))],
      [btn('🏠 ʀᴇᴄᴀʟʟ ғʀᴏᴍ ʙʙǫ', guard('map_bbq_recall', userId))],
      backToMapRow(userId),
    ],
  };
}

export function trainingKeyboard(userId) {
  return {
    inline_keyboard: [
      [btn('🌸 ᴛʀᴀɪɴ sᴀᴋᴜʀᴀ', guard('map_train_sakura', userId))],
      backToMapRow(userId),
    ],
  };
}

export function hotspringsKeyboard(userId) {
  return {
    inline_keyboard: [backToMapRow(userId)],
  };
}

export function storeKeyboard(userId) {
  return {
    inline_keyboard: [
      [btn('🏯 sʜɪɴᴏʙɪ sᴛᴏʀᴇ', guard('map_open_shinobi_store', userId))],
      backToMapRow(userId),
    ],
  };
}

export function mapCaption(mentionHtml) {
  return (
    `🗺️ <b>KONOHA MAP</b>\n\n` +
    `🍃 ${mentionHtml}\n` +
    `Choose a location to explore.`
  );
}

export function locationCaption(locKey, mentionHtml) {
  const lines = {
    hokage:
      `🏯 <b>HOKAGE OFFICE</b>\n\n🍃 ${mentionHtml}\n` +
      `🥷 Shinobi missions · 🎯 Daily Mission · 💰 patrol claims.`,
    ichiraku:
      `🍜 <b>ICHIRAKU RAMEN</b>\n\n🍃 ${mentionHtml}\n` +
      `Restore chakra with ramen or prepare a Field Meal.`,
    bbq:
      `🍖 <b>BBQ</b>\n\n🍃 ${mentionHtml}\n` +
      `Send shinobi here to recover chakra over time.`,
    gate:
      `🚪 <b>VILLAGE GATE</b>\n\n🍃 ${mentionHtml}\n` +
      `Dispatch a team patrol. Claim rewards at the Hokage Office.`,
    training:
      `🥷 <b>TRAINING GROUND</b>\n\n🍃 ${mentionHtml}\n` +
      `Sakura training (requires Tsunade) — coming soon.`,
    hotsprings:
      `♨️ <b>HOT SPRINGS</b>\n\n🍃 ${mentionHtml}\n` +
      `Pet rest area — coming soon.`,
    store:
      `🏪 <b>STORE</b>\n\n🍃 ${mentionHtml}\n` +
      `Open the shinobi store from the map.`,
  };
  return lines[locKey] || mapCaption(mentionHtml);
}
