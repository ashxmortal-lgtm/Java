/**
 * Map constants — storage channel t.me/c/3889508991/<msg>
 * Bot API cannot use private t.me/c links as HTTP image URLs.
 * Strategy: copyMessage(from_chat_id, message_id) → cache file_id → editMessageMedia.
 * Bot must be admin/member of the storage channel (already is).
 */

export const MAP_ENABLED = true;

export const MAP_IMAGE_CHAT_ID = -1003889508991;
export const MAP_IMAGE_MESSAGE_ID = 465;

/** Storage message ids. null → reuse main map image. */
export const LOCATION_IMAGES = {
  home: 465,
  hokage: 466,
  ichiraku: 49,
  training: 45,
  gate: null,       // no dedicated image — use main map
  store: 43,
  bbq: null,        // use main map
  hotsprings: null, // use main map
};

/** Docs / logs only (not usable as sendPhoto URLs). */
export const LOCATION_LINKS = {
  home: 'https://t.me/c/3889508991/465',
  hokage: 'https://t.me/c/3889508991/466',
  ichiraku: 'https://t.me/c/3889508991/49',
  training: 'https://t.me/c/3889508991/45',
  store: 'https://t.me/c/3889508991/43',
};

export const LOCATIONS = {
  hokage: { key: 'hokage', emoji: '🏯', name: 'Hokage Office' },
  ichiraku: { key: 'ichiraku', emoji: '🍜', name: 'Ichiraku Ramen' },
  bbq: { key: 'bbq', emoji: '🍖', name: 'BBQ' },
  gate: { key: 'gate', emoji: '🚪', name: 'Village Gate' },
  training: { key: 'training', emoji: '🥷', name: 'Training Ground' },
  hotsprings: { key: 'hotsprings', emoji: '♨️', name: 'Hot Springs' },
  store: { key: 'store', emoji: '🏪', name: 'Stores' },
};

export const RAMEN_MENU = {
  classic: { emoji: '🍜', name: 'Basic Ramen', cost: 200, chakra: 40 },
  miso: { emoji: '🍥', name: "Naruto's Miso Ramen", cost: 250, chakra: 50 },
  dango: { emoji: '🍡', name: 'Dango Skewers', cost: 300, chakra: 60 },
};

export const FIELD_MEAL_MENU = {
  chakra_ramen: {
    emoji: '🍜', name: 'Chakra Ramen', cost: 1000,
    duration_pct: -10, reward_pct: 0,
  },
  warrior: {
    emoji: '⚔️', name: "Warrior's Ramen", cost: 1200,
    duration_pct: 0, reward_pct: 15,
  },
  spicy: {
    emoji: '🌶️', name: 'Spicy Ramen', cost: 1500,
    duration_pct: 0, reward_pct: 25,
  },
  special: {
    emoji: '🌟', name: 'Ichiraku Special', cost: 2500,
    duration_pct: -10, reward_pct: 15,
  },
};

export const BBQ_RECOVERY_INTERVAL_SEC = 30 * 60;
export const BBQ_RECOVERY_AMOUNT = 20;
export const MAX_CHAKRA = 100;
