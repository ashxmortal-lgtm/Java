/* Frozen Blooded Mini App. Identity comes from verified Telegram init data. */
(function () {
  const C = window.FBContract;
  if (!C) return;

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    try { tg.expand(); } catch (_) {}
    try {
      tg.setHeaderColor('#9ec4dc');
      tg.setBackgroundColor('#aec8dc');
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
    '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;',
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
        const error = new Error('Open this Mini App from the bot inside Telegram.');
        error.type = 'UNAVAILABLE';
        error.status = 0;
        reject(error);
        return;
      }
      api.call(endpointName || 'miniapp', input || { action: 'bootstrap' }, (err, result) => {
        if (err) {
          const error = new Error(err.message || 'The Mini App could not reach the bot.');
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

  function takeDashboard(payload) {
    const data = C.unwrapPayload(payload);
    const dashboard = data && data.dashboard ? data.dashboard : data;
    if (!C.isDashboard(dashboard)) {
      const error = new Error('The bot returned an unexpected account payload.');
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

  function initial() {
    const name = displayName() || 'F';
    return name.trim().charAt(0).toUpperCase() || 'F';
  }

  function errorHtml() {
    if (!state.error) return '';
    const code = state.error.parameters && state.error.parameters.code;
    let hint = 'Open the Mini App from the bot, then retry.';
    if (state.error.status === 401 || state.error.type === 'UNAUTHORIZED') {
      hint = 'Telegram did not verify this session.';
    } else if (state.error.type === 'ENDPOINT_ERROR' && code) {
      hint = 'The bot rejected this action (' + code + ').';
    }
    return '<div class="notice error"><strong>' + esc(state.error.message) + '</strong><div>' + esc(hint) + '</div><button class="secondary" data-action="retry">Retry</button></div>';
  }

  function loadingHtml(label) {
    return '<div class="loading"><span class="spinner"></span>' + esc(label || 'Syncing with the bot…') + '</div>';
  }

  function backBar(label) {
    return '<button class="back" data-action="back">← ' + esc(label || 'Back') + '</button>';
  }

  function pageHead(titleText, desc, back) {
    return backBar(back || 'Home')
      + '<h1>' + esc(titleText) + '</h1>'
      + (desc ? '<p class="lead">' + esc(desc) + '</p>' : '')
      + (state.busy ? '<div class="sync">Syncing with the bot…</div>' : '')
      + (state.flash ? '<div class="notice">' + esc(state.flash) + '</div>' : '');
  }

  function card(icon, name, desc, attrs) {
    return '<button class="item" ' + attrs + '><span class="item-icon">' + icon + '</span><span class="item-body"><strong>' + esc(name) + '</strong><small>' + esc(desc) + '</small></span><span class="arrow">›</span></button>';
  }

  function footer() {
    return '<p class="credit">created by <a href="https://t.me/frozenblooded" data-url="https://t.me/frozenblooded">𝑭𝒓❄️𝒛𝒆𝒏 𝑩𝒍𝒐𝒐𝒅𝒆𝒅</a></p>';
  }

  function shell(inner) {
    return '<div class="shell"><header class="top"><div class="snow" aria-hidden="true">❄️</div><div><div class="brand">FROZEN BLOODED</div><div class="sub">pastel ice · synced with the bot</div></div></header>'
      + inner
      + footer()
      + '</div>';
  }

  function avatarHtml() {
    const photo = tgUser && tgUser.photo_url ? String(tgUser.photo_url).trim() : '';
    const letter = esc(initial());
    // photo_url is provided by Telegram when available. Fallback initial always sits under the image.
    const img = photo
      ? '<img src="' + esc(photo) + '" alt="" width="76" height="76" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
      : '';
    return '<div class="avatar" role="img" aria-label="' + letter + '">' + img + '<span class="avatar-fallback">' + letter + '</span></div>';
  }

  function pageHome() {
    const id = tgUser && tgUser.id ? String(tgUser.id) : '';
    const name = displayName() || 'Shinobi';
    const idLine = id
      ? 'ID <strong>' + esc(id) + '</strong>'
      : 'Open from Telegram to see your ID';
    return '<section class="hero-card"><div class="identity">'
      + avatarHtml()
      + '<div><h1 class="who">' + esc(name) + '</h1><p class="id-line">' + idLine + '</p></div>'
      + '</div></section>'
      + (state.error && !state.data ? errorHtml() : '')
      + '<div class="modes">'
      + '<button class="mode game" data-nav="game"><span class="mode-icon">🍥</span><span><strong>Game mode</strong><small>Streak, store, abilities</small></span><span class="arrow">›</span></button>'
      + '<button class="mode study" data-nav="study"><span class="mode-icon">📘</span><span><strong>Study mode</strong><small>Todo, study time, tracker</small></span><span class="arrow">›</span></button>'
      + '</div>';
  }

  function claimedToday() {
    const profile = state.data && state.data.profile;
    const today = state.data && state.data.study && state.data.study.today;
    return !!(profile && today && profile.lastClaim === today);
  }

  function streakDots(streak) {
    const n = Math.max(0, Math.min(7, Number(streak) || 0));
    let html = '';
    for (let i = 0; i < 7; i += 1) html += '<span class="dot' + (i < n ? ' on' : '') + '"></span>';
    return html;
  }

  function pageGame() {
    const head = pageHead('Game mode', 'Same coins, chakra and claim as the bot.', 'Home');
    if (!state.data) {
      return '<section>' + head + (errorHtml() || loadingHtml('Loading your economy…')) + '</section>';
    }
    const p = state.data.profile;
    const b = state.data.balance;
    const already = claimedToday() || (state.lastClaim && state.lastClaim.claim && !state.lastClaim.claim.claimed);
    const claimLabel = state.busy ? 'Claiming…' : (already ? 'Claimed' : 'Claim');
    const claimNote = state.lastClaim && state.lastClaim.claim && state.lastClaim.claim.claimed
      ? '<div class="success-text">+' + esc(fmt(state.lastClaim.claim.coins)) + ' coins · +' + esc(fmt(state.lastClaim.claim.chakra)) + ' chakra</div>'
      : '';
    return '<section>' + head + errorHtml()
      + '<div class="streak"><div><small>Streak</small><strong>' + esc(fmt(p.streak)) + '<span style="font-size:16px;color:#6a879c"> / 7</span></strong><div class="dots">' + streakDots(p.streak) + '</div></div>'
      + '<button class="claim" data-action="claim" ' + (already || state.busy ? 'disabled' : '') + '>' + esc(claimLabel) + '</button></div>'
      + claimNote
      + '<div class="pair"><div class="stat-tile"><small>Balance</small><strong>' + esc(fmt(b.coins)) + ' 🍥</strong></div><div class="stat-tile"><small>Chakra</small><strong>' + esc(fmt(b.chakra)) + ' ⚡</strong></div></div>'
      + '<div class="list">'
      + card('🥷', 'Profile', 'Rank, XP, roster and streak', 'data-page="profile"')
      + card('🎒', 'Inventory', 'Shinobi, jutsu, gifts and chakra', 'data-page="inventory"')
      + card('🏯', 'Shinobi store', 'Buy directly. Same catalogue as /buy', 'data-page="store"')
      + card('✨', 'Ability', 'All abilities, with Lvl Up', 'data-page="abilities"')
      + card('🎁', 'Gift store', 'List and prices. Group only', 'data-page="gifts"')
      + '</div></section>';
  }

  function pageStudy() {
    return '<section>' + pageHead('Study mode', 'Creates open in the bot. Reports and the tracker write the same database.', 'Home')
      + errorHtml()
      + '<div class="list">'
      + card('☑️', 'Create todo', 'Opens the bot and the /todo menu', 'data-start="mini_todo"')
      + card('⏳', 'Set study time target', 'Opens the bot and the /studytime menu', 'data-start="mini_studytime"')
      + card('📝', 'Report', 'Mark a todo or study time complete or not', 'data-page="reports"')
      + card('🧬', 'Biology tracker', 'Class 11 and 12 study menu', 'data-page="tracker"')
      + '</div></section>';
  }

  function pageProfile() {
    const head = pageHead('Profile', 'Same record as /profile.', 'Game mode');
    if (!state.profile) {
      const status = state.profileError
        ? '<div class="notice error">Profile could not be synced.</div><button class="secondary" data-action="retry">Retry</button>'
        : loadingHtml('Syncing profile…');
      return '<section>' + head + status + '</section>';
    }
    const d = state.profile;
    const roster = (d.roster || []).length
      ? d.roster.map((x) => (x.emoji || '🥷') + ' ' + x.name + (x.qty > 1 ? ' ×' + x.qty : '')).join('\n')
      : '— none yet —';
    const jutsu = (d.jutsu || []).length ? d.jutsu.join('\n') : '— none —';
    return '<section>' + head
      + '<div class="card"><div class="card-title">' + esc(d.displayName || 'Shinobi') + '</div><div class="muted">' + (d.username ? '@' + esc(d.username) : 'No public username') + '</div>'
      + '<div class="stats">'
      + stat('Rank', d.rank) + stat('XP', d.xpText) + stat('Coins', fmt(d.balance)) + stat('Chakra', fmt(d.chakra))
      + stat('Kills', fmt(d.kills)) + stat('Streak', fmt(d.streak) + '/7') + stat('Last claim', d.lastClaim) + stat('Patrols', fmt(d.narutoPatrols))
      + '</div><div class="section">Roster</div><div class="plain">' + esc(roster) + '</div>'
      + '<div class="section">Jutsu</div><div class="plain">' + esc(jutsu) + '</div>'
      + '<button class="secondary" data-action="retry" style="margin-top:12px">Refresh</button></div></section>';
  }

  function stat(label, value) {
    return '<div class="stat"><small>' + esc(label) + '</small><strong>' + esc(value == null || value === '' ? '—' : value) + '</strong></div>';
  }

  function pageInventory() {
    if (!state.data) return '<section>' + pageHead('Inventory', 'Owned items from the bot.', 'Game mode') + (errorHtml() || loadingHtml()) + '</section>';
    const inv = state.data.inventory || [];
    const typeOf = (x) => String(x.type || '').toLowerCase();
    const sections = [
      ['Shinobi', inv.filter((x) => typeOf(x) === 'shinobi' || typeOf(x) === 'character')],
      ['Jutsu', inv.filter((x) => typeOf(x) === 'jutsu')],
      ['Gifts', inv.filter((x) => typeOf(x) === 'gift')],
      ['Chakra', inv.filter((x) => typeOf(x) === 'chakra')],
      ['Other', inv.filter((x) => !['shinobi', 'character', 'jutsu', 'gift', 'chakra'].includes(typeOf(x)))],
    ];
    return '<section>' + pageHead('Inventory', 'Owned items from the bot.', 'Game mode') + errorHtml()
      + sections.map(([label, items]) => '<div class="card"><div class="card-title">' + esc(label) + '</div><div class="plain muted">'
        + (items.length ? items.map((x) => esc(x.name) + (x.qty > 1 ? ' × ' + fmt(x.qty) : '')).join('\n') : '— empty —')
        + '</div></div>').join('')
      + '<button class="secondary" data-action="retry" style="margin-top:12px">Refresh</button></section>';
  }

  function pageStore() {
    if (!state.data) return '<section>' + pageHead('Shinobi store', 'Buy here. The bot checks the price.', 'Game mode') + (errorHtml() || loadingHtml()) + '</section>';
    const items = state.data.store || [];
    const confirm = state.confirm && items.find((i) => i.name === state.confirm);
    const sheet = confirm
      ? '<div class="card"><div class="card-title">Buy ' + esc(confirm.emoji || '') + ' ' + esc(confirm.name) + '?</div><p class="muted">' + fmt(confirm.price) + ' coins. Unique items cannot be bought twice.</p><div class="button-row"><button class="primary" data-action="confirm-purchase" ' + (state.busy ? 'disabled' : '') + '>Buy</button><button class="secondary" data-action="cancel-purchase">Cancel</button></div></div>'
      : '';
    return '<section>' + pageHead('Shinobi store', 'Balance ' + fmt(state.data.profile.balance) + ' coins.', 'Game mode')
      + errorHtml() + sheet
      + '<div class="list">' + items.map((i) => '<div class="item-row"><div class="item"><span class="item-icon">' + esc(i.emoji || '•') + '</span><span class="item-body"><strong>' + esc(i.name) + '</strong><small>' + fmt(i.price) + ' 🍥 · ' + esc(i.type) + '</small></span></div><button class="buy-btn" data-confirm-buy="' + esc(i.name) + '" ' + (i.owned || state.busy ? 'disabled' : '') + '>' + (i.owned ? 'Owned' : 'Buy') + '</button></div>').join('') + '</div>'
      + '<div class="notice">Chakra is not sold here. The bot still sells it with /buy in chat.</div></section>';
  }

  function pageAbilities() {
    if (!state.data) return '<section>' + pageHead('Ability', 'Same list as /ability.', 'Game mode') + (errorHtml() || loadingHtml()) + '</section>';
    const rows = state.data.abilities || [];
    return '<section>' + pageHead('Ability', 'Using an ability still happens in chat.', 'Game mode') + errorHtml()
      + '<div class="list">' + (rows.length ? rows.map((a) => '<div class="card"><div class="card-title">' + esc(a.name) + '</div><div class="muted">' + esc(a.description) + '</div></div>').join('') : '<div class="notice">No ability list was returned.</div>') + '</div>'
      + '<button class="primary" data-page="levels" style="margin-top:12px">Lvl Up</button></section>';
  }

  function pageLevels() {
    if (!state.data || !state.data.levels) return '<section>' + pageHead('Lvl Up', 'Same screen as the ability menu.', 'Ability') + (errorHtml() || loadingHtml()) + '</section>';
    const d = state.data.levels;
    const miles = d.itachiMilestones || [];
    return '<section>' + pageHead('Lvl Up', 'Itachi milestones and Sakura status from the bot.', 'Ability') + errorHtml()
      + '<div class="card"><div class="card-title">Itachi</div><div class="stats">' + stat('Kills', fmt(d.kills)) + stat('Current', d.current) + '</div><div class="notice">' + esc(d.next || '') + '</div></div>'
      + miles.map((m) => '<div class="card"><div class="row-between"><strong>Lv. ' + esc(m.level) + ' · ' + esc(m.title) + '</strong><span class="tag">' + esc(m.robGain) + '% rob</span></div><div class="muted">' + fmt(m.kills) + ' kills</div></div>').join('')
      + '<div class="card"><div class="card-title">Sakura training</div><div class="muted">' + esc(d.sakura || '—') + '</div><div class="notice">Only shinobi with a level system are listed. This does not spend coins.</div></div></section>';
  }

  function pageGifts() {
    if (!state.data) return '<section>' + pageHead('Gift store', 'Prices from the bot catalogue.', 'Game mode') + (errorHtml() || loadingHtml()) + '</section>';
    const gifts = state.data.gifts || [];
    return '<section>' + pageHead('Gift store', "Ino's catalogue. Sending stays in the group.", 'Game mode') + errorHtml()
      + '<div class="list">' + (gifts.length ? gifts.map((g) => '<div class="item"><span class="item-icon">' + esc(g.emoji || '🎁') + '</span><span class="item-body"><strong>' + esc(g.id) + '. ' + esc(g.name) + '</strong><small>Catalog number ' + esc(g.id) + '</small></span><span class="tag">' + fmt(g.price) + ' 🍥</span></div>').join('') : '<div class="notice">The gift catalogue was not returned.</div>') + '</div>'
      + '<div class="notice"><strong>How to use — group only.</strong><br>Reply to someone in a group where @' + esc(C.BOT_USERNAME) + ' is present, then send /gift and the catalog number. Example: /gift 3. You cannot send a gift from this Mini App, and you cannot gift yourself.</div></section>';
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
      return '<section>' + pageHead('Biology tracker', 'The same study menu as /tracker.', 'Study mode') + (errorHtml() || loadingHtml()) + '</section>';
    }
    const study = state.data.study;
    const cls = study.tracker['class_' + state.classKey];
    if (!cls) return '<section>' + pageHead('Biology tracker', 'That class is not in the bot payload.', 'Study mode') + '<div class="notice">No chapter list.</div></section>';
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
      return '<details class="unit" open><summary>' + esc(u.short || u.title) + '</summary>' + chapters + '</details>';
    }).join('');
    return '<section>' + pageHead('Biology tracker', 'Toggle Revision, Practice and PYQ. Counts stay on the bot.', 'Study mode')
      + errorHtml()
      + '<div class="button-row"><button class="' + (state.classKey === '11' ? 'primary' : 'secondary') + '" data-class="11">Class 11</button><button class="' + (state.classKey === '12' ? 'primary' : 'secondary') + '" data-class="12">Class 12</button></div>'
      + '<div class="notice">🟢 all three done · 🟡 started · 🔴 not started. Turning a task on adds +1, same as /tracker.</div>'
      + units + '</section>';
  }

  function pageReports() {
    if (!state.data || !state.data.study) {
      return '<section>' + pageHead('Report', 'Mark todos and study time from the bot database.', 'Study mode') + (errorHtml() || loadingHtml()) + '</section>';
    }
    const study = state.data.study;
    const todos = study.todos || [];
    const goals = study.goals || [];
    const todoHtml = todos.length ? todos.map((t) => {
      const closed = t.status === 'closed';
      const actions = closed
        ? '<div class="notice">' + (t.completed ? 'Completed' : 'Not completed') + '</div>'
        : '<div class="button-row"><button class="primary" data-todo="' + esc(t.id) + '" data-completed="true" ' + (state.busy ? 'disabled' : '') + '>Completed</button><button class="danger" data-todo="' + esc(t.id) + '" data-completed="false" ' + (state.busy ? 'disabled' : '') + '>Not completed</button></div>';
      return '<div class="card"><div class="row-between"><div class="card-title">' + esc(t.text || 'Todo') + '</div><span class="tag">' + esc(t.status) + '</span></div>' + actions + '</div>';
    }).join('') : '<div class="notice">No todo to report. Create one with the button that opens /todo.</div>';
    const goalHtml = goals.length ? goals.map((g) => {
      let body = '';
      if (g.goalText) body += '<div class="notice">' + esc(g.goalText) + '</div>';
      if (g.status === 'goal_set' || g.status === 'asked') {
        const draft = state.drafts[String(g.id)] || '';
        body += '<label class="muted" for="goal-' + esc(g.id) + '">What did you study?</label><textarea class="goal-input" id="goal-' + esc(g.id) + '" maxlength="500">' + esc(draft) + '</textarea><button class="primary" data-submit-goal="' + esc(g.id) + '" ' + (state.busy ? 'disabled' : '') + '>Submit report</button>';
      } else if (g.status === 'report_submitted') {
        body += '<div class="notice">' + esc(g.reportText) + '</div><div class="button-row"><button class="primary" data-goal="' + esc(g.id) + '" data-completed="true" ' + (state.busy ? 'disabled' : '') + '>Completed</button><button class="danger" data-goal="' + esc(g.id) + '" data-completed="false" ' + (state.busy ? 'disabled' : '') + '>Not completed</button></div>';
      } else if (g.status === 'closed') {
        body += '<div class="notice">' + (g.completed ? 'Completed' : 'Not completed') + '</div>';
      }
      return '<div class="card"><div class="row-between"><div class="card-title">Study time' + (g.goalDate ? ' · ' + esc(g.goalDate) : '') + '</div><span class="tag">' + esc(g.status) + '</span></div>' + body + '</div>';
    }).join('') : '<div class="notice">No study-time target is waiting. Set one with the button that opens /studytime.</div>';
    return '<section>' + pageHead('Report', 'Completed and not completed write the same rows as the bot.', 'Study mode')
      + errorHtml()
      + '<div class="section">Todos</div>' + todoHtml
      + '<div class="section">Study time</div>' + goalHtml
      + '<button class="secondary" data-action="retry" style="margin-top:10px">Refresh</button></section>';
  }

  const pages = {
    home: pageHome,
    game: pageGame,
    study: pageStudy,
    profile: pageProfile,
    inventory: pageInventory,
    store: pageStore,
    abilities: pageAbilities,
    levels: pageLevels,
    gifts: pageGifts,
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
      root.innerHTML = shell('<section>' + pageHead('This screen could not be drawn', '', 'Home') + errorHtml() + '</section>');
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
      const { dashboard } = takeDashboard(await serverlessCall({ action: 'bootstrap' }));
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
      if (!profile || typeof profile !== 'object' || !Array.isArray(profile.roster) || typeof profile.rank !== 'string') {
        throw Object.assign(new Error('Profile came back in an unexpected shape.'), { type: 'BAD_PAYLOAD' });
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
    if (state.busy || claimedToday()) return;
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
      state.flash = payload.claim.claimed
        ? 'Daily reward added. Streak ' + fmt(payload.claim.streak) + '/7.'
        : 'Already claimed today. Come back after 12:00 AM IST.';
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
        throw Object.assign(new Error('Purchase returned an unexpected payload. Check your balance in the bot.'), { type: 'BAD_PAYLOAD' });
      }
      state.data = payload.dashboard;
      const r = payload.purchase;
      if (r.status === 'ok') state.flash = 'Purchased ' + name + '. Balance: ' + fmt(r.balance) + '.';
      else if (r.status === 'owned') state.flash = 'You already own this. No coins were taken.';
      else if (r.status === 'insufficient') state.flash = 'Not enough coins. Balance: ' + fmt(r.balance) + '.';
      else if (r.status === 'duplicate') state.flash = 'That purchase was already recorded.';
      else if (r.status === 'failed' && !r.safe) state.flash = 'Uncertain result. Do not retry yet. Check the bot balance.';
      else state.flash = 'Purchase was not completed. No coins were taken.';
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
        throw Object.assign(new Error('The bot did not return an updated account.'), { type: 'BAD_PAYLOAD' });
      }
      state.data = payload.dashboard;
      if (input && input.action === 'study_report_submit') delete state.drafts[String(input.goalId)];
      state.flash = payload.changed === false ? 'Already saved.' : 'Saved on the bot.';
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
    const link = event.target.closest('a[data-url]');
    if (link && root && root.contains(link)) {
      event.preventDefault();
      openExternal(link.dataset.url);
      return;
    }
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
    if (button.dataset.start) { launchStart(button.dataset.start); return; }
    if (button.dataset.action === 'claim') { await claim(); return; }
    if (button.dataset.confirmBuy) { state.confirm = button.dataset.confirmBuy; state.flash = ''; render(); return; }
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
      if (!text || text.length > 500) {
        state.flash = 'Write a report between 1 and 500 characters.';
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
    render();
    if (serverlessAvailable()) refresh();
    else state.error = Object.assign(new Error('Open this Mini App from the bot inside Telegram.'), { type: 'UNAVAILABLE', status: 0 });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
