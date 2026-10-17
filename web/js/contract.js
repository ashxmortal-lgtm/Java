/* Shared Mini App contract. No secrets. Used by the UI and the local verifier. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Canonical community URLs from Java tgcloud/lib/hnc.js and universal_buttons.js.
  // The hub's library invite (+lxR4mMxK-1s4MGJl) is older than the bot's current HNC library link.
  const LINKS = {
    studyMaterial: 'https://t.me/neet_hideout',
    joinChannel: 'https://t.me/+ULRn7kZy-uFhNzQ1',
    pyq: 'https://t.me/c/4471291233/243',
    modules: 'https://t.me/c/4471291233/152',
    otherBooks: 'https://t.me/c/4471291233/368',
    bio11: 'https://t.me/c/2994306672/735',
    bio12: 'https://t.me/c/2994306672/752',
    chemistry: 'https://t.me/c/2994306672/778',
    physics11: 'https://t.me/c/2994306672/823',
    physics12: 'https://t.me/c/2994306672/824',
    discussion: 'https://t.me/+ChxNR6ShlzRjMjA1',
    library: 'https://t.me/+ULRn7kZy-uFhNzQ1',
    todoGroup: 'https://t.me/+hRDedaMqU2liNmM1',
    ypt: 'https://link.yeolpumta.com/P3R5cGU9Z3JvdXBJbnZpdGUmaWQ9NjE3OTA4Mw==',
    yapping: 'https://t.me/+mlp94tMHi29jMmFl',
    quiz: 'https://t.me/The_Migrator_Quizzes',
    mcq: 'https://t.me/konoha_quizzes',
    frozenBlooded: 'https://t.me/+ihpNjYxHXUBlYWY9',
  };

  // Actions implemented by tgcloud/endpoints/miniapp.js. Do not add names that are not there.
  const ACTIONS = [
    'bootstrap',
    'claim',
    'purchase',
    'todo_update',
    'study_report_submit',
    'study_goal_complete',
    'tracker_toggle',
    'tracker_adjust',
  ];

  const TRACKER_ACTIVITIES = ['revision', 'practice', 'pyq'];

  // Whitelisted /start payloads handled in tgcloud/handlers/message.js. Not arbitrary commands.
  const BOT_STARTS = {
    mini_todo: '/todo',
    mini_studytime: '/studytime',
    mini_study: '/study',
    mini_duel: '/duel',
    mini_map: '/map',
  };

  const BOT_USERNAME = 'exfrozen_bot';

  function unwrapPayload(result) {
    // Official telegram-web-app.js already unwraps { ok, result } before the callback.
    // Some hosts and raw HTTP responses do not. Accept both. Never invent fields.
    if (
      result &&
      typeof result === 'object' &&
      result.ok === true &&
      Object.prototype.hasOwnProperty.call(result, 'result')
    ) {
      return result.result;
    }
    return result;
  }

  function isDashboard(data) {
    return !!(
      data &&
      typeof data === 'object' &&
      data.profile &&
      typeof data.profile === 'object' &&
      data.balance &&
      typeof data.balance === 'object' &&
      Array.isArray(data.inventory) &&
      Array.isArray(data.store) &&
      data.study &&
      typeof data.study === 'object'
    );
  }

  return {
    LINKS,
    ACTIONS,
    TRACKER_ACTIVITIES,
    BOT_STARTS,
    BOT_USERNAME,
    unwrapPayload,
    isDashboard,
  };
});
