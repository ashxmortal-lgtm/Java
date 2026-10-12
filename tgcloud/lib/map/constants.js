/**
 * Map constants — storage channel + message ids match Python map.py.
 * Same private storage channel as the old bot.
 */

export const MAP_ENABLED = true;

// Storage channel that holds Konoha map / location photos (from map.py)
export const MAP_IMAGE_CHAT_ID = -1003889508991;
export const MAP_IMAGE_MESSAGE_ID = 38;

/** Per-location storage message ids. null = text-only (no dedicated image). */
export const LOCATION_IMAGES = {
  hokage: 42,
  ichiraku: 49,
  training: 45,
  gate: 46,
  bbq: null,
  hotsprings: null,
  store: null,
};

export const LOCATIONS = {
  hokage: { key: 'hokage', emoji: '🏯', name: 'Hokage Office' },
  ichiraku: { key: 'ichiraku', emoji: '🍜', name: 'Ichiraku Ramen' },
  bbq: { key: 'bbq', emoji: '🍖', name: 'BBQ' },
  gate: { key: 'gate', emoji: '🚪', name: 'Village Gate' },
  training: { key: 'training', emoji: '🥷', name: 'Training Ground' },
  hotsprings: { key: 'hotsprings', emoji: '♨️', name: 'Hot Springs' },
  store: { key: 'store', emoji: '🏪', name: 'Store' },
};

// Ichiraku menus (pets omitted for now)
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
