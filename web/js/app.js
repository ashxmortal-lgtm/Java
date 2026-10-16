/* Frozen Blooded Mini App. Talks only to the verified miniapp endpoint. */
(function () {
  const C = window.FBContract;
  if (!C) return;

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    try { tg.expand(); } catch (_) {}
    try {
      tg.setHeaderColor('#07111f');
      tg.setBackgroundColor('#07111f');
    } catch (_) {}
  }

  const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  const state = {
    page: 'home',
    stack: [],
    data: null,
    profile: null,
    profileBusy: false,
    profileError: null,
    error: null,
    busy: false,
    classKey: '11',
    lastClaim: null,
    flash: '',
    confirm: null,
    drafts: {},
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const fmt = (v) => {
    if (v == null || v === '') return '—';
    const number = Number(v);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : '—';
  };

  function serverlessAvailable() {
    const api = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.Serverless;
    return !!(api && typeof api.call === 'function');
  }

  function serverlessCall(input, endpointName) {
    return new Promise((resolve, reject) => {
      const api = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.Serverless;
      if (!api || typeof api.call !== 'function') {
        const error = new Error('Telegram Serverless is unavailable. Open this Mini App from the bot inside Telegram.');
        error.type = 'UNAVAILABLE';
        error.status = 0;
        reject(error);
        return;
      }
      // Official contract: callback result is the endpoint return value, already unwrapped.
      api.call(endpointName || 'miniapp', input || { action: 'bootstrap' }, (err, result) => {
        if (err) {
          const error = new Error(err.message || 'The Mini App endpoint could not be reached.');
          error.type = err.type || '';
          error.status = Number(err.status || 0);
          error.parameters = err.parameters || null;
          reject(error);
          return;
        }
        resolve(C.unwrapPayload(result));
      });
    });
  }

  function takeDashboard(payload, label) {
    const data = C.unwrapPayload(payload);
    const dashboard = data && data.dashboard ? data.dashboard : data;
    if (!C.isDashboard(dashboard)) {
      const error = new Error((label || 'Profile') + ' came back in an unexpected shape. Nothing was invented to fill the gap.');
      error.type = 'BAD_PAYLOAD';
      throw error;
    }
    return { envelope: data, dashboard };
  }

  function displayName() {
    const fromAccount = state.data && state.data.profile && state.data.profile.displayName;
    if (fromAccount) return fromAccount;
    if (tgUser) return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
    return '';
  }

  function errorHtml() {
    if (!state.error) return '';
    const code = state.error.parameters && state.error.parameters.code;
    const status = state.error.status
      ? 'HTTP ' + state.error.status
      : (state.error.type || 'Connection error');
    let hint = 'Open the Mini App from the bot inside Telegram, then retry.';
    if (state.error.status === 405) {
      hint = 'This host is not accepting the bot Serverless endpoint. Deploy the bot endpoint and this web folder together on the same TGCloud app.';
    } else if (state.error.status === 401 || state.error.type === 'UNAUTHORIZED') {
      hint = 'Telegram did not verify this session. Account data stays hidden until the app is opened from the bot.';
    } else if (state.error.type === 'ENDPOINT_ERROR' && code) {
      hint = 'The bot rejected this action (' + code + '). Refresh and try again if the record changed.';
    }
    return '<div class="notice error"><strong>' + esc(status) + ' · ' + esc(state.error.message) + '</strong><div style="margin-top:5px">' + esc(hint) + '</div><button class="secondary" data-action="retry" style="margin-top:10px">Retry connection</button></div>';
  }

  function loadingHtml(label) {
    return '<div class="loading"><span class="spinner"></span>' + esc(label || 'Syncing with the bot…') + '</div>';
  }

  function needData(titleText, desc, back) {
    return pageShell(titleText, desc, back) + (errorHtml() || loadingHtml());
  }

  function backBar(label) {
    return '<button class="back" data-action="back">← ' + esc(label || 'Back') + '</button>';
  }

  function pageShell(titleText, desc, back) {
    return backBar(back || 'Back')
      + '<div class="eyebrow">Frozen Blooded</div>'
      + '<h1 class="page-title">' + esc(titleText) + '</h1>'
      + '<p class="page-desc">' + esc(desc || '') + '</p>'
      + (state.busy ? '<div class="sync">Syncing…</div>' : '')
      + (state.flash ? '<div class="notice">' + esc(state.flash) + '</div>' : '');
  }

  function stat(label, value) {
    const shown = value == null || value === '' ? '—' : value;
    return '<div class="stat"><small>' + esc(label) + '</small><strong>' + esc(shown) + '</strong></div>';
  }

  function card(icon, name, desc, attrs) {
    return '<button class="item" ' + attrs + '><span class="item-icon">' + icon + '</span><span class="item-body"><strong>' + esc(name) + '</strong><small>' + esc(desc) + '</small></span><span class="arrow">›</span></button>';
  }

  function linkCard(icon, name, desc, url) {
    return '<button class="link-card" data-url="' + esc(url) + '"><span class="item-icon">' + icon + '</span><span class="copy"><strong>' + esc(name) + '</strong><small>' + esc(desc) + '</small></span><span class="arrow">↗</span></button>';
  }

  function navKey() {
    if (state.page === 'home') return 'home';
    if (state.page === 'study' || state.page === 'tracker' || state.page === 'reports') return 'study';
    return 'game';
  }

  function shell(inner) {
    const name = displayName();
    const key = navKey();
    const tab = (id, label) => '<button class="tab' + (key === id ? ' on' : '') + '" data-nav="' + id + '">' + label + '</button>';
    return '<div class="shell">'
      + '<header class="top"><div class="mark" aria-hidden="true">❄</div><div><div class="brand">FROZEN BLOODED</div><div class="sub">'
      + esc(name ? name + ' · Study · Shinobi' : 'Study · Shinobi · Community')
      + '</div></div></header>'
      + '<nav class="tabs" aria-label="Sections">' + tab('home', 'Home') + tab('game', 'Game') + tab('study', 'Study') + '</nav>'
      + inner
      + '<div class="footer">FROZEN BLOODED · COMMUNITY HUB</div></div>';
  }

  function pageHome() {
    const who = displayName();
    let account = '';
    if (state.error && !state.data) account = errorHtml();
    else if (!state.data) account = serverlessAvailable() ? loadingHtml() : errorHtml() || unavailableNotice();
    else {
      const b = state.data.balance;
      const p = state.data.profile;
      account = '<div class="profile-card"><div class="row-between"><div><div class="card-title">' + esc(p.displayName || who || 'Account') + '</div><div class="muted">' + (p.username ? '@' + esc(p.username) : 'Bot account') + '</div></div><button class="secondary" data-page="profile">Profile</button></div>'
        + '<div class="stats">'
        + stat('Rank', p.rank)
        + stat('Coins', fmt(b.coins) + ' 🍥')
        + stat('Chakra', fmt(b.chakra))
        + stat('Kills', fmt(b.kills))
        + '</div></div>';
    }
    if (!state.data) account += '<button class="secondary" data-page="profile">Open profile without dashboard sync</button>';
    const L = C.LINKS;
    return '<section><div class="hero"><div class="eyebrow">Your world, one hub</div><h1>Stay sharp.<br><span class="ice">Stay frozen.</span></h1><p class="intro">'
      + (who ? 'Welcome, ' + esc(who) + '. Choose a path. This screen does not switch the bot’s operating mode.' : 'Choose a path. Live account data loads only inside Telegram.')
      + '</p><div class="home-actions">'
      + '<button class="mode" data-nav="game"><span class="mode-icon">⚔</span><span><strong>GAME MODE</strong><small>Account, store, abilities</small></span><span class="arrow">›</span></button>'
      + '<button class="mode" data-nav="study"><span class="mode-icon">☰</span><span><strong>STUDY MODE</strong><small>Resources, tracker, reports</small></span><span class="arrow">›</span></button>'
      + '</div></div>'
      + account
      + '<div class="section">Community</div><div class="resource-grid">'
      + linkCard('❄', 'Frozen Blooded', 'Community group', L.frozenBlooded)
      + linkCard('💬', 'Discussion group', 'Quizzes, doubts and support', L.discussion)
      + linkCard('📚', 'Study material', 'Notes, PDFs and resources', L.studyMaterial)
      + '</div></section>';
  }

  function unavailableNotice() {
    return '<div class="notice">Not connected. Open this Mini App from @' + esc(C.BOT_USERNAME) + ' so Telegram can verify your account. Study links and game help still work. No stand-in balance is shown.</div>';
  }

  function pageGame() {
    return '<section>' + pageShell('Game mode', 'Account actions use the bot database. Group games stay in the group chat.', 'Home')
      + errorHtml()
      + '<div class="section">Shinobi and economy</div><div class="list">'
      + card('🍥', 'Daily claim', 'Once per IST day, same record as /claim', 'data-page="claim"')
      + card('🪙', 'Balance', 'Coins, kills, rank and chakra', 'data-page="balance"')
      + card('🥷', 'My profile', 'Rank, XP, roster and streak', 'data-page="profile"')
      + card('🎒', 'Inventory', 'Shinobi, jutsu, gifts and chakra', 'data-page="inventory"')
      + card('🏯', 'Shinobi store', 'Buy a shinobi or jutsu here', 'data-page="store"')
      + card('✨', 'Abilities', 'The /ability list and level progress', 'data-page="abilities"')
      + card('🎁', 'Gift store', 'Catalog only. Sending stays in the group', 'data-page="gifts"')
      + card('🎮', 'Games and group commands', 'How XOXO, RPS, map and missions work', 'data-page="games"')
      + '</div>'
      + (!state.data && !state.error ? loadingHtml() : '')
      + '</section>';
  }

  function pageStudy() {
    const L = C.LINKS;
    return '<section>' + pageShell('Study portal', 'Links match the bot’s /hnc menu. Tracker and reports write the bot database. This does not change a bot mode.', 'Home')
      + errorHtml()
      + '<div class="section">Study material</div><div class="resource-grid">'
      + linkCard('📚', 'Study material', 'Short notes, updates, tricks and PDFs', L.studyMaterial)
      + linkCard('🔒', 'Join this channel first', 'Required before some book posts', L.joinChannel)
      + linkCard('📕', 'PYQ books', 'Previous-year question books', L.pyq)
      + linkCard('📘', 'Modules', 'Module collection', L.modules)
      + linkCard('📗', 'Other books', 'Additional book resources', L.otherBooks)
      + '</div>'
      + '<div class="section">Short notes</div><div class="resource-grid two">'
      + linkCard('🧬', 'Class 11 Biology', 'Short notes', L.bio11)
      + linkCard('🧬', 'Class 12 Biology', 'Short notes', L.bio12)
      + linkCard('⚗', 'Chemistry · Classes 11–12', 'Short notes', L.chemistry)
      + linkCard('⚛', 'Class 11 Physics', 'Short notes', L.physics11)
      + linkCard('⚛', 'Class 12 Physics', 'Short notes', L.physics12)
      + '</div>'
      + '<div class="section">Groups and channels</div><div class="resource-grid two">'
      + linkCard('💬', 'Discussion group', 'Quizzes, doubts and support', L.discussion)
      + linkCard('🎓', 'Hidden NEET Library', 'Book PDFs', L.library)
      + linkCard('📝', 'To-do sharing group', 'Planning and accountability', L.todoGroup)
      + linkCard('⏱', 'YPT study group', 'Study-time tracking', L.ypt)
      + linkCard('🗨', 'Yapping group', 'Community chat', L.yapping)
      + linkCard('❓', 'Hidden NEET Quizzes', 'Quiz updates', L.quiz)
      + linkCard('🧠', 'Konoha NEET MCQs', 'Conceptual polls', L.mcq)
      + linkCard('❄', 'Frozen Blooded', 'Community group', L.frozenBlooded)
      + '</div>'
      + '<div class="section">Inside this Mini App</div><div class="list">'
      + card('🧪', 'Biology tracker', 'Revision, Practice and PYQ, same chapter ids as /tracker', 'data-page="tracker"')
      + card('📝', 'Study report', 'Submit a report and mark goals or todos', 'data-page="reports"')
      + '</div>'
      + '<div class="section">Opens the bot</div><div class="notice">These four flows have no Mini App action. Each button opens @' + esc(C.BOT_USERNAME) + ' with a fixed start payload. The bot then runs that command in the private chat. Nothing is copied.</div><div class="list">'
      + card('☑', 'To-do', 'Opens the bot and starts /todo', 'data-start="mini_todo"')
      + card('⏳', 'Study time', 'Opens the bot and starts /studytime', 'data-start="mini_studytime"')
      + card('📅', 'Study dashboard', 'Opens the bot and starts /study', 'data-start="mini_study"')
      + card('🤝', 'Study duel', 'Opens the bot and starts /duel', 'data-start="mini_duel"')
      + '</div></section>';
  }

  function pageBalance() {
    if (!state.data) return '<section>' + needData('Balance', 'Live economy data shared with the bot.', 'Game mode') + '</section>';
    const b = state.data.balance;
    const p = state.data.profile;
    return '<section>' + pageShell('Balance', 'Live economy data shared with the bot.', 'Game mode')
      + errorHtml()
      + '<div class="profile-card"><div class="card-title">' + esc(p.displayName || displayName() || 'Account') + '</div><div class="stats">'
      + stat('Coins', fmt(b.coins))
      + stat('Kills', fmt(b.kills))
      + stat('Shinobi rank', b.rank)
      + stat('Chakra', fmt(b.chakra))
      + '</div>'
      + (b.pendingRewards ? '<div class="notice">Pending map rewards: ' + esc(fmt(b.pendingRewards)) + '</div>' : '')
      + '<button class="secondary" data-action="retry" style="margin-top:12px">Refresh balance</button></div></section>';
  }

  function pageProfile() {
    const head = pageShell('Your profile', 'Synced from the same getProfile endpoint used by /profile, independently of dashboard bootstrap.', 'Game mode');
    if (!state.profile) {
      const status = state.profileError
        ? '<div class="notice error">Your profile could not be synced. The account was not changed.</div><button class="secondary" data-action="retry" style="margin-top:12px">Retry profile sync</button>'
        : loadingHtml('Syncing your profile with the bot…');
      return '<section>' + head + status + '</section>';
    }
    const d = state.profile;
    const roster = (d.roster || []).length
      ? d.roster.map((x) => (x.emoji || '🥷') + ' ' + x.name + (x.qty > 1 ? ' ×' + x.qty : '')).join('\n')
      : '— none yet —';
    const jutsu = (d.jutsu || []).length ? d.jutsu.map((x) => x).join('\n') : '— none —';
    return '<section>' + head
      + '<div class="profile-card"><div class="row-between"><div><div class="card-title">' + esc(d.displayName || 'Shinobi') + '</div><div class="muted">'
      + (d.username ? '@' + esc(d.username) : 'No public username')
      + '</div></div><div class="mark">❄</div></div><div class="stats">'
      + stat('Rank', d.rank)
      + stat('XP', d.xpText)
      + stat('Coins', fmt(d.balance))
      + stat('Chakra', fmt(d.chakra))
      + stat('Kills', fmt(d.kills))
      + stat('Claim streak', fmt(d.streak) + '/7')
      + stat('Last claim', d.lastClaim)
      + stat('Naruto patrols', fmt(d.narutoPatrols))
      + '</div><div class="divider"></div><div class="card-title">Shinobi roster</div><div class="plain muted" style="margin-top:7px">' + esc(roster) + '</div>'
      + '<div class="divider"></div><div class="card-title">Jutsu</div><div class="plain muted" style="margin-top:7px">' + esc(jutsu) + '</div>'
      + '<button class="secondary" data-action="retry" style="margin-top:12px">Refresh profile</button></div></section>';
  }

  function pageInventory() {
    if (!state.data) return '<section>' + needData('Inventory', 'Owned items are read from the bot database.', 'Game mode') + '</section>';
    const inv = state.data.inventory || [];
    const typeOf = (x) => String(x.type || '').toLowerCase();
    const sections = [
      ['Shinobi', inv.filter((x) => typeOf(x) === 'shinobi' || typeOf(x) === 'character')],
      ['Jutsu', inv.filter((x) => typeOf(x) === 'jutsu')],
      ['Gifts', inv.filter((x) => typeOf(x) === 'gift')],
      ['Chakra', inv.filter((x) => typeOf(x) === 'chakra')],
      ['Other', inv.filter((x) => !['shinobi', 'character', 'jutsu', 'gift', 'chakra'].includes(typeOf(x)))],
    ];
    return '<section>' + pageShell('Inventory', 'Owned items are read from the bot database.', 'Game mode')
      + errorHtml()
      + '<div class="profile-card"><div class="stats">'
      + stat('Coins', fmt(state.data.profile.balance))
      + stat('Chakra', fmt(state.data.profile.chakra))
      + '</div>'
      + sections.map(([label, items]) => '<div class="section">' + esc(label) + '</div><div class="plain">'
        + (items.length ? items.map((x) => esc(x.name) + (x.qty > 1 ? ' × ' + fmt(x.qty) : '')).join('<br>') : '— empty —')
        + '</div>').join('')
      + '<button class="secondary" data-action="retry" style="margin-top:14px">Refresh inventory</button></div></section>';
  }

  function pageStore() {
    if (!state.data) return '<section>' + needData('Shinobi store', 'Prices come from the bot catalogue. This app does not set them.', 'Game mode') + '</section>';
    const items = state.data.store || [];
    const confirm = state.confirm && items.find((i) => i.name === state.confirm);
    const sheet = confirm
      ? '<div class="card"><div class="card-title">Buy ' + esc(confirm.name) + '?</div><p class="muted">' + esc(confirm.emoji || '') + ' ' + fmt(confirm.price) + ' coins will be deducted by the bot. Unique items cannot be bought twice.</p><div class="button-row"><button class="primary" data-action="confirm-purchase" ' + (state.busy ? 'disabled' : '') + '>Confirm purchase</button><button class="secondary" data-action="cancel-purchase">Cancel</button></div></div>'
      : '';
    return '<section>' + pageShell('Shinobi store', 'Balance ' + fmt(state.data.profile.balance) + ' coins. Purchases are checked by the bot.', 'Game mode')
      + errorHtml()
      + sheet
      + '<div class="list">' + items.map((i) => '<div class="item-row"><div class="item"><span class="item-icon">' + esc(i.emoji || '•') + '</span><span class="item-body"><strong>' + esc(i.name) + '</strong><small>' + fmt(i.price) + ' coins · ' + esc(i.type) + '</small></span></div><button class="buy-btn" data-confirm-buy="' + esc(i.name) + '" ' + (i.owned || state.busy ? 'disabled' : '') + '>' + (i.owned ? 'Owned' : 'Buy') + '</button></div>').join('') + '</div>'
      + '<div class="notice">Chakra is not in this catalogue. The bot sells it with /buy in chat (100 minimum, 2 coins each). This Mini App will not pretend to sell it.</div></section>';
  }

  function pageAbilities() {
    if (!state.data) return '<section>' + needData('Abilities', 'The same list /ability shows.', 'Game mode') + '</section>';
    const rows = state.data.abilities || [];
    return '<section>' + pageShell('Abilities', 'Descriptions are informational. Using an ability still happens in chat.', 'Game mode')
      + errorHtml()
      + '<div class="list">' + (rows.length ? rows.map((a) => '<div class="card"><div class="card-title">' + esc(a.name) + '</div><div class="muted" style="margin-top:4px">' + esc(a.description) + '</div></div>').join('') : '<div class="notice">No ability list was returned.</div>') + '</div>'
      + '<button class="primary" data-page="levels" style="margin-top:12px">Check level-up progress</button></section>';
  }

  function pageLevels() {
    if (!state.data || !state.data.levels) return '<section>' + needData('Level-up progress', 'Progress from your bot account.', 'Abilities') + '</section>';
    const d = state.data.levels;
    const miles = d.itachiMilestones || [];
    return '<section>' + pageShell('Level-up progress', 'Itachi milestones and Sakura status from the bot. No extra levels are added here.', 'Abilities')
      + errorHtml()
      + '<div class="card"><div class="card-title">Itachi</div><div class="stats">' + stat('Kills', fmt(d.kills)) + stat('Current', d.current) + '</div><div class="notice">' + esc(d.next || '') + '</div></div>'
      + miles.map((m) => '<div class="card"><div class="row-between"><strong>Level ' + esc(m.level) + ' · ' + esc(m.title) + '</strong><span class="tag">' + esc(m.robGain) + '% rob</span></div><div class="muted">' + fmt(m.kills) + ' kills required</div></div>').join('')
      + '<div class="card"><div class="card-title">Sakura training</div><div class="muted" style="margin-top:5px">' + esc(d.sakura || '—') + '</div></div></section>';
  }

  function pageGifts() {
    if (!state.data) return '<section>' + needData('Gift store', 'Catalog from the bot. Sending a gift is a group command.', 'Game mode') + '</section>';
    const gifts = state.data.gifts || [];
    return '<section>' + pageShell('Gift store', 'Browse only. The Mini App cannot send a gift.', 'Game mode')
      + errorHtml()
      + '<div class="notice">To send a gift, reply to someone in a group where @' + esc(C.BOT_USERNAME) + ' is present and send /gift with the catalog number. Example shape: /gift 3. This page does not copy that command.</div>'
      + '<div class="list">' + (gifts.length ? gifts.map((g) => '<div class="item"><span class="item-icon">' + esc(g.emoji || '🎁') + '</span><span class="item-body"><strong>' + esc(g.name) + '</strong><small>Catalog number ' + esc(g.id) + '</small></span><span class="tag">' + fmt(g.price) + '</span></div>').join('') : '<div class="notice">The gift catalogue was not in the account payload.</div>') + '</div></section>';
  }

  function pageGames() {
    return '<section>' + pageShell('Games and group commands', 'These run in Telegram chat. This Mini App does not start a match or take a stake.', 'Game mode')
      + '<div class="card"><div class="card-title">XOXO · tic-tac-toe</div><p class="muted">In a group where @' + esc(C.BOT_USERNAME) + ' is present, send <span class="command">/xoxo</span>. Two players. The bot’s lobby sets the stake. Cancelling an active match refunds both stakes with <span class="command">/xoxo_cancel</span>.</p></div>'
      + '<div class="card"><div class="card-title">Rock Paper Scissors</div><p class="muted">In that same kind of group, send <span class="command">/rps</span>. Two to four players. Stats: <span class="command">/rps_stats</span> and <span class="command">/xoxo_stats</span>. There is no Mini App action for stats, so none are shown here.</p></div>'
      + '<div class="card"><div class="card-title">Map, mission, patrol</div><p class="muted"><span class="command">/map</span>, <span class="command">/mission</span> and <span class="command">/patrol</span> are bot commands. Mission and patrol are group-only. This app does not run them.</p></div>'
      + '<div class="notice">Minimum documented stake in the bot is 500 coins. This Mini App adds no stake control and will not place a bet.</div></section>';
  }

  function pageClaim() {
    const head = pageShell('Daily claim', 'Once per IST day. The bot and this Mini App share the claim.', 'Game mode');
    if (!state.lastClaim) {
      const prior = state.data && state.data.profile
        ? '<div class="muted">Current streak ' + esc(fmt(state.data.profile.streak)) + '/7 · last claim ' + esc(state.data.profile.lastClaim || '—') + '</div>'
        : '';
      return '<section>' + head + errorHtml() + '<div class="card"><p class="muted">Claim today’s coins and chakra. If you already claimed, the bot will not pay again.</p>' + prior
        + '<button class="primary" data-action="claim" ' + (state.busy ? 'disabled' : '') + '>' + (state.busy ? 'Claiming…' : 'Claim now') + '</button></div>'
        + (!state.data && !state.error ? loadingHtml() : '') + '</section>';
    }
    const r = state.lastClaim.claim || {};
    const rewards = state.lastClaim.rewards || {};
    const streak = Math.max(0, Math.min(7, Number(r.streak) || 0));
    const bar = '●'.repeat(streak) + '○'.repeat(7 - streak);
    const extras = [
      r.sakura ? 'Sakura boost +' + fmt(rewards.sakuraCoins) + ' coins and +' + fmt(rewards.sakuraChakra) + ' chakra' : '',
      r.bonus ? 'day-seven bonus +' + fmt(rewards.bonusCoins) + ' coins and +' + fmt(rewards.bonusChakra) + ' chakra' : '',
    ].filter(Boolean);
    const body = r.claimed
      ? '<div class="success-text">Daily claim added</div><p>+' + fmt(r.coins) + ' Konoha coins<br>+' + fmt(r.chakra) + ' chakra</p>' + (extras.length ? '<div class="muted">Included: ' + esc(extras.join(' · ')) + '</div>' : '')
      : '<div class="gold-text">Already claimed today</div><p class="muted">Come back after 12:00 AM IST. No extra coins were added.</p>';
    return '<section>' + head + errorHtml() + '<div class="profile-card"><div class="card-title">' + esc(displayName() || 'Account') + '</div>' + body
      + '<div class="divider"></div><div>Streak: ' + esc(fmt(r.streak)) + '/7 ' + bar + '</div><div>Balance: ' + esc(fmt(r.balance)) + '</div>'
      + (r.chakraFailed ? '<div class="notice error">Chakra could not be added. Contact the owner. Coins may already have been credited.</div>' : '')
      + '<button class="secondary" data-action="retry" style="margin-top:12px">Refresh account</button></div></section>';
  }

  function trackerStatus(row) {
    if (!row) return 'Incomplete';
    const counts = [row.revisionCount, row.practiceCount, row.pyqCount];
    if (counts.every((n) => Number(n) >= 1)) return 'Completed';
    if (counts.some((n) => Number(n) >= 1)) return 'In progress';
    return 'Incomplete';
  }

  function pageTracker() {
    if (!state.data || !state.data.study || !state.data.study.tracker) {
      return '<section>' + needData('Biology tracker', 'Chapters come from the bot, not a local copy.', 'Study portal') + '</section>';
    }
    const study = state.data.study;
    const cls = study.tracker[state.classKey];
    if (!cls) return '<section>' + pageShell('Biology tracker', 'That class is not in the bot payload.', 'Study portal') + '<div class="notice">No chapter list for this class.</div></section>';
    const by = Object.fromEntries((study.trackerRows || []).map((r) => [r.chapterId, r]));
    const units = (cls.units || []).map((u) => {
      const chapters = (u.chapters || []).map((c) => {
        const r = by[c.id];
        const acts = [['revision', 'Revision', 'revisionDone', 'revisionCount'], ['practice', 'Practice', 'practiceDone', 'practiceCount'], ['pyq', 'PYQ', 'pyqDone', 'pyqCount']];
        const num = String(c.id).split('_')[1] || '';
        return '<div class="chapter"><div class="row-between"><div class="chapter-name">' + esc(num) + '. ' + esc(c.name) + '</div><span class="tag">' + esc(trackerStatus(r)) + '</span></div><div class="button-row">'
          + acts.map(([key, label, done, count]) => {
            const on = r && r[done];
            return '<button class="toggle-btn ' + (on ? 'on' : 'off') + '" data-tracker-toggle="1" data-chapter="' + esc(c.id) + '" data-activity="' + key + '" ' + (state.busy ? 'disabled' : '') + '>' + (on ? 'On' : 'Off') + ' ' + label + ' · ×' + fmt(r && r[count]) + '</button>';
          }).join('')
          + '</div></div>';
      }).join('');
      return '<details class="unit"><summary>' + esc(u.short || u.title) + '</summary>' + chapters + '</details>';
    }).join('');
    return '<section>' + pageShell('Biology tracker', 'Turning a task on increments its count, matching /tracker. Counts stay on the bot.', 'Study portal')
      + errorHtml()
      + '<div class="button-row"><button class="' + (state.classKey === '11' ? 'primary' : 'secondary') + '" data-class="11">Class 11</button><button class="' + (state.classKey === '12' ? 'primary' : 'secondary') + '" data-class="12">Class 12</button></div>'
      + '<div class="notice">Completed means revision, practice and PYQ have each been marked at least once. Empty chapters are not marked complete.</div>'
      + units + '</section>';
  }

  function pageReports() {
    if (!state.data || !state.data.study) {
      return '<section>' + needData('Study report', 'Todos and goals already stored by the bot.', 'Study portal') + '</section>';
    }
    const study = state.data.study;
    const todos = study.todos || [];
    const goals = study.goals || [];
    const todoHtml = todos.length ? todos.map((t) => {
      const closed = t.status === 'closed';
      const actions = closed
        ? '<div class="notice">' + (t.completed ? 'Completed' : 'Not completed') + ' · stored on the bot</div>'
        : '<div class="button-row"><button class="primary" data-todo="' + esc(t.id) + '" data-completed="true" ' + (state.busy ? 'disabled' : '') + '>Completed</button><button class="danger" data-todo="' + esc(t.id) + '" data-completed="false" ' + (state.busy ? 'disabled' : '') + '>Not completed</button></div>';
      const when = t.reportHour != null ? '<div class="muted">Report time ' + String(t.reportHour).padStart(2, '0') + ':' + String(t.reportMinute || 0).padStart(2, '0') + ' IST</div>' : '';
      const photo = t.contentType === 'photo' ? '<div class="muted">Image todo. The picture stays in the bot check-in.</div>' : '';
      return '<div class="card"><div class="row-between"><div class="card-title">' + esc(t.text || 'Todo') + '</div><span class="tag">' + esc(t.status) + '</span></div>' + photo + when + actions + '</div>';
    }).join('') : '<div class="notice">No reportable todo. Create one with the To-do button, which opens the bot. Drafts are not listed.</div>';
    const goalHtml = goals.length ? goals.map((g) => {
      let body = '';
      if (g.goalText) body += '<div class="notice">' + esc(g.goalText) + '</div>';
      if (g.status === 'goal_set' || g.status === 'asked') {
        const draft = state.drafts[String(g.id)] || '';
        body += '<label class="muted" for="goal-' + esc(g.id) + '">Report, 1 to 500 characters</label><textarea class="goal-input" id="goal-' + esc(g.id) + '" maxlength="500" placeholder="What did you study?">' + esc(draft) + '</textarea><button class="primary" data-submit-goal="' + esc(g.id) + '" ' + (state.busy ? 'disabled' : '') + '>Submit report</button>';
      } else if (g.status === 'report_submitted') {
        body += '<div class="notice">Your report: ' + esc(g.reportText) + '</div><div class="button-row"><button class="primary" data-goal="' + esc(g.id) + '" data-completed="true" ' + (state.busy ? 'disabled' : '') + '>Goal completed</button><button class="danger" data-goal="' + esc(g.id) + '" data-completed="false" ' + (state.busy ? 'disabled' : '') + '>Not completed</button></div>';
      } else if (g.status === 'closed') {
        body += '<div class="notice">' + (g.completed ? 'Goal completed' : 'Goal not completed') + (g.reportText ? '. Report: ' + esc(g.reportText) : '') + '</div>';
      }
      return '<div class="card"><div class="row-between"><div class="card-title">Study goal' + (g.goalDate ? ' · ' + esc(g.goalDate) : '') + '</div><span class="tag">' + esc(g.status) + '</span></div>' + body + '</div>';
    }).join('') : '<div class="notice">No study goal is waiting. Use Study Time to create one in the bot.</div>';
    return '<section>' + pageShell('Study report', 'Updates the same todo and goal rows as the bot. It does not post the group completion message.', 'Study portal')
      + errorHtml()
      + '<div class="section">Todos</div>' + todoHtml
      + '<div class="section">Study goals</div>' + goalHtml
      + '<button class="secondary" data-action="retry" style="margin-top:10px">Refresh study data</button></section>';
  }

  const pages = {
    home: pageHome,
    game: pageGame,
    study: pageStudy,
    balance: pageBalance,
    profile: pageProfile,
    inventory: pageInventory,
    store: pageStore,
    abilities: pageAbilities,
    levels: pageLevels,
    gifts: pageGifts,
    games: pageGames,
    claim: pageClaim,
    tracker: pageTracker,
    reports: pageReports,
  };

  let root;

  function render() {
    if (!root) return;
    const view = pages[state.page] || pageHome;
    try {
      root.innerHTML = shell(view());
    } catch (e) {
      state.error = e;
      root.innerHTML = shell('<section>' + pageShell('Something broke while drawing this screen', 'Your last account payload was kept. Retry to load it again.', 'Home') + errorHtml() + '</section>');
    }
  }

  function navigate(page) {
    if (page === state.page) return;
    state.stack.push(state.page);
    state.page = page;
    state.flash = '';
    state.confirm = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'profile') refreshProfile();
  }

  function goNav(page) {
    state.stack = [];
    state.page = page;
    state.flash = '';
    state.confirm = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'profile') refreshProfile();
  }

  function back() {
    state.page = state.stack.pop() || 'home';
    state.flash = '';
    state.confirm = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openExternal(url) {
    if (tg && /^https:\/\/t\.me\//i.test(url) && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(url);
    else if (tg && typeof tg.openLink === 'function') tg.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  function launchStart(payload) {
    if (!C.BOT_STARTS[payload]) return;
    openExternal('https://t.me/' + C.BOT_USERNAME + '?start=' + encodeURIComponent(payload));
  }

  async function refresh() {
    if (state.busy) return;
    state.busy = true;
    state.error = null;
    render();
    try {
      const { dashboard } = takeDashboard(await serverlessCall({ action: 'bootstrap' }), 'Profile');
      state.data = dashboard;
    } catch (e) {
      state.error = e;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function refreshProfile() {
    if (state.profileBusy) return;
    state.profileBusy = true;
    state.profileError = null;
    render();
    try {
      const profile = C.unwrapPayload(await serverlessCall({}, 'getProfile'));
      if (!profile || typeof profile !== 'object' || !Array.isArray(profile.roster)
          || !Array.isArray(profile.jutsu) || typeof profile.rank !== 'string') {
        throw Object.assign(new Error('Profile endpoint returned an unexpected payload.'), { type: 'BAD_PAYLOAD' });
      }
      state.profile = profile;
    } catch (e) {
      state.profileError = e;
    } finally {
      state.profileBusy = false;
      render();
    }
  }

  async function claim() {
    if (state.busy) return;
    state.busy = true;
    state.error = null;
    render();
    try {
      const payload = C.unwrapPayload(await serverlessCall({ action: 'claim' }));
      if (!payload || !payload.claim || !C.isDashboard(payload.dashboard)) {
        throw Object.assign(new Error('Claim returned an unexpected payload. Check the bot before claiming again.'), { type: 'BAD_PAYLOAD' });
      }
      state.lastClaim = payload;
      state.data = payload.dashboard;
      state.page = 'claim';
      state.flash = '';
    } catch (e) {
      state.error = e;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function buy(name) {
    if (state.busy || !name) return;
    state.busy = true;
    state.error = null;
    state.confirm = null;
    render();
    try {
      const payload = C.unwrapPayload(await serverlessCall({ action: 'purchase', itemName: name }));
      if (!payload || !payload.purchase || !C.isDashboard(payload.dashboard)) {
        throw Object.assign(new Error('Purchase returned an unexpected payload. Check your balance in the bot before trying again.'), { type: 'BAD_PAYLOAD' });
      }
      state.data = payload.dashboard;
      const r = payload.purchase;
      if (r.status === 'ok') state.flash = 'Purchased ' + name + '. New balance: ' + fmt(r.balance) + '.';
      else if (r.status === 'owned') state.flash = 'You already own this. No coins were deducted.';
      else if (r.status === 'insufficient') state.flash = 'Not enough coins. Balance: ' + fmt(r.balance) + '.';
      else if (r.status === 'duplicate') state.flash = 'That purchase was already recorded.';
      else if (r.status === 'failed' && !r.safe) state.flash = 'The transaction status is uncertain. Do not retry yet. Check your balance in the bot.';
      else state.flash = 'Purchase was not completed. No coins were deducted.';
    } catch (e) {
      state.error = e;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function update(input) {
    if (state.busy) return;
    state.busy = true;
    state.error = null;
    const page = state.page;
    const classKey = state.classKey;
    render();
    try {
      const payload = C.unwrapPayload(await serverlessCall(input));
      if (!payload || !C.isDashboard(payload.dashboard)) {
        throw Object.assign(new Error('The bot did not return an updated account. Refresh before trying again.'), { type: 'BAD_PAYLOAD' });
      }
      state.data = payload.dashboard;
      if (input && input.action === 'study_report_submit') {
        delete state.drafts[input.goalId];
        delete state.drafts[String(input.goalId)];
      }
      state.flash = payload.changed === false ? 'Already saved. No change.' : 'Saved. The screen is showing the bot’s latest record.';
      state.page = page;
      state.classKey = classKey;
    } catch (e) {
      state.error = e;
    } finally {
      state.busy = false;
      render();
    }
  }

  document.addEventListener('input', (event) => {
    const box = event.target;
    if (!box || !box.id || box.id.indexOf('goal-') !== 0) return;
    state.drafts[box.id.slice(5)] = box.value;
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || !root || !root.contains(button)) return;
    if (button.dataset.action === 'back') { back(); return; }
    if (button.dataset.nav) { goNav(button.dataset.nav); return; }
    if (button.dataset.action === 'retry') {
      if (state.page === 'profile') await refreshProfile();
      else await refresh();
      return;
    }
    if (button.dataset.page) { navigate(button.dataset.page); return; }
    if (button.dataset.url) { openExternal(button.dataset.url); return; }
    if (button.dataset.start) { launchStart(button.dataset.start); return; }
    if (button.dataset.action === 'claim') { await claim(); return; }
    if (button.dataset.confirmBuy) {
      state.confirm = button.dataset.confirmBuy;
      state.flash = '';
      render();
      return;
    }
    if (button.dataset.action === 'cancel-purchase') { state.confirm = null; render(); return; }
    if (button.dataset.action === 'confirm-purchase') { await buy(state.confirm); return; }
    if (button.dataset.class) { state.classKey = button.dataset.class; render(); return; }
    if (button.dataset.trackerToggle) {
      const activity = button.dataset.activity;
      const chapterId = button.dataset.chapter;
      if (!C.TRACKER_ACTIVITIES.includes(activity) || !chapterId) return;
      await update({ action: 'tracker_toggle', chapterId, activity });
      return;
    }
    if (button.dataset.todo) {
      await update({ action: 'todo_update', todoId: Number(button.dataset.todo), completed: button.dataset.completed === 'true' });
      return;
    }
    if (button.dataset.submitGoal) {
      const box = document.getElementById('goal-' + button.dataset.submitGoal);
      const text = box ? box.value.trim() : '';
      state.drafts[button.dataset.submitGoal] = box ? box.value : '';
      if (!text || text.length > 500) {
        state.flash = 'Write a report between 1 and 500 characters.';
        state.error = null;
        render();
        return;
      }
      await update({ action: 'study_report_submit', goalId: Number(button.dataset.submitGoal), text });
      return;
    }
    if (button.dataset.goal) {
      await update({ action: 'study_goal_complete', goalId: Number(button.dataset.goal), completed: button.dataset.completed === 'true' });
    }
  });

  function boot() {
    root = document.getElementById('app');
    if (!root || root.dataset.booted === '1') return;
    root.dataset.booted = '1';
    if (!serverlessAvailable()) {
      state.error = Object.assign(new Error('Telegram Serverless is unavailable in this session.'), { type: 'UNAVAILABLE', status: 0 });
    }
    render();
    if (serverlessAvailable()) refresh();
  }

  window.FrozenBloodedApp = { boot, unwrapPayload: C.unwrapPayload };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
