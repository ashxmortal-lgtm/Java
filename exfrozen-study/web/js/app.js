/* ExFrozen Study Mini App. Identity comes from verified Telegram init data. */
(function () {
  const C = window.FBContract;
  if (!C) return;

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    try { tg.expand(); } catch (_) {}
    try {
      tg.setHeaderColor('#122033');
      tg.setBackgroundColor('#0b1622');
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
    const isHome = state.page === 'home';
    return '<div class="shell' + (isHome ? ' shell-home' : '') + '">'
      + '<header class="top">' + botHeaderAvatarHtml()
      + '<div><div class="brand">Ex Fr❄️zen</div><div class="sub">synced with the bot</div></div></header>'
      + inner
      + footer()
      + '</div>';
  }

  function currentProfile() {
    return state.profile || (state.data && state.data.profile) || null;
  }

  // 🔴 Header: bot profile picture (always in sync via botAvatar data URI).
  function botHeaderAvatarHtml() {
    const p = currentProfile();
    const src = p && typeof p.botAvatar === 'string' && p.botAvatar.indexOf('data:image/') === 0 ? p.botAvatar : '';
    const img = src
      ? '<img src="' + esc(src) + '" alt="" width="40" height="40" decoding="async" onerror="this.style.display=\'none\'">'
      : '';
    return '<div class="bot-avatar snow" role="img" aria-label="Ex Frozen">' + img + '<span class="avatar-fallback">❄️</span></div>';
  }

  // 🟡 Identity: user's Telegram profile photo (initData or API).
  function userAvatarHtml() {
    let src = '';
    try {
      const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u && u.photo_url) src = u.photo_url;
    } catch (_) {}
    const p = currentProfile();
    if (!src && p && typeof p.userPhoto === 'string' && p.userPhoto) src = p.userPhoto;
    const img = src
      ? '<img src="' + esc(src) + '" alt="" width="76" height="76" decoding="async" onerror="this.style.display=\'none\'">'
      : '';
    const letter = (displayName() || 'S').charAt(0).toUpperCase();
    return '<div class="avatar user-avatar" role="img" aria-label="You">' + img + '<span class="avatar-fallback">' + esc(letter) + '</span></div>';
  }

  function statusBlockHtml() {
    const b = state.data && state.data.balance;
    const coins = b ? fmt(b.coins) : '—';
    const rank = b && b.rank != null ? '#' + b.rank : '—';
    return '<p class="life alive">🍥 ' + esc(String(coins)) + ' study coins</p>'
      + '<p class="id-line">GLOBAL RANK: ' + esc(String(rank)) + '</p>';
  }

  function pageHome() {
    const name = displayName() || 'Student';
    return '<section class="hero-card"><div class="identity">'
      + userAvatarHtml()
      + '<div><h1 class="who">' + esc(name) + '</h1>' + statusBlockHtml() + '</div>'
      + '</div></section>'
      + (state.error && !state.data ? errorHtml() : '')
      + (state.flash ? '<div class="notice">' + esc(state.flash) + '</div>' : '')
      + '<div class="list">'
      + card('☑️', 'Create todo', 'Opens the bot and the /todo menu', 'data-start="mini_todo"')
      + card('⏳', 'Set study time target', 'Opens the bot and the /studytime menu', 'data-start="mini_studytime"')
      + card('📝', 'Report', 'Mark a todo or study time complete or not', 'data-page="reports"')
      + card('🧬', 'Biology tracker', 'Class 11 and 12 study planner', 'data-page="tracker"')
      + card('🎓', 'Hidden NEET community', 'Groups, library & study material', 'data-page="hnc"')
      + '</div>'
      + '<section class="feedback-card">'
      + '<p class="fb-title">💬 Have feedback? We’re listening!</p>'
      + '<p class="fb-body">🐛 Report bugs, 💡 suggest new features, or ⭐ share your review to help us improve.</p>'
      + '<p class="fb-body">👇 Tap “Send Feedback” to share your thoughts with us!</p>'
      + '<a class="fb-btn primary" href="https://t.me/' + esc(C.BOT_USERNAME) + '?start=owner">Send ❄️ Feedback</a>'
      + '<p class="fb-body" style="margin-top:12px">📢 Join our official updates channel for the latest news, announcements, and new features.</p>'
      + '<a class="fb-btn channel" href="https://t.me/frozenblooded" target="_blank" rel="noopener">Join 𝑭𝒓❄️𝒛𝒆𝒏 𝑩𝒍𝒐𝒐𝒅𝒆𝒅 channel</a>'
      + '</section>';
  }


  function stat(label, value) {
    return '<div class="stat"><small>' + esc(label) + '</small><strong>' + esc(value == null || value === '' ? '—' : value) + '</strong></div>';
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
      return '<section>' + pageHead('Biology tracker', 'The same study menu as /tracker.', 'Home') + (errorHtml() || loadingHtml()) + '</section>';
    }
    const study = state.data.study;
    const cls = study.tracker['class_' + state.classKey];
    if (!cls) return '<section>' + pageHead('Biology tracker', 'That class is not in the bot payload.', 'Home') + '<div class="notice">No chapter list.</div></section>';
    const by = Object.fromEntries((study.trackerRows || []).map((r) => [r.chapterId, r]));
    const units = (cls.units || []).map((u) => {
      const chapters = (u.chapters || []).map((c) => {
        const r = by[c.id] || {};
        const num = String(c.id || '').split('_')[1] || '';
        const acts = [
          ['revision', 'Revision', r.revisionCount || 0],
          ['practice', 'Practice', r.practiceCount || 0],
          ['pyq', 'PYQ', r.pyqCount || 0],
        ].map(([key, label, count]) => {
          const has = count > 0;
          return '<div class="act-row">'
            + '<button class="act-btn minus" data-tracker-adjust="1" data-delta="-1" data-chapter="' + esc(c.id) + '" data-activity="' + key + '" ' + (state.busy || count <= 0 ? 'disabled' : '') + '>−</button>'
            + '<div class="act-label' + (has ? ' has' : '') + '">' + esc(label) + ' · ×' + fmt(count) + '</div>'
            + '<button class="act-btn plus" data-tracker-adjust="1" data-delta="1" data-chapter="' + esc(c.id) + '" data-activity="' + key + '" ' + (state.busy ? 'disabled' : '') + '>+</button>'
            + '</div>';
        }).join('');
        return '<div class="chapter"><div class="row-between"><div class="chapter-name">' + esc(num) + '. ' + esc(c.name) + '</div><span class="tag">' + esc(trackerStatus(r)) + '</span></div>' + acts + '</div>';
      }).join('');
      return '<details class="unit" open><summary>▼ ' + esc(u.title || u.short || 'Unit') + '</summary>' + chapters + '</details>';
    }).join('');
    return '<section>' + pageHead('Biology tracker', 'Tap +1 for a session, −1 to undo. Counts never go below 0.', 'Home')
      + errorHtml()
      + '<div class="class-tabs">'
      + '<button class="' + (state.classKey === '11' ? 'active' : '') + '" data-class="11">Class 11</button>'
      + '<button class="' + (state.classKey === '12' ? 'active' : '') + '" data-class="12">Class 12</button>'
      + '</div>'
      + '<div class="notice">🟢 all three done · 🟡 started · 🔴 not started. Same counts as /tracker.</div>'
      + units
      + '</section>';
  }

  function pageReports() {
    if (!state.data || !state.data.study) {
      return '<section>' + pageHead('Report', 'Mark todos and study time from the bot database.', 'Home') + (errorHtml() || loadingHtml()) + '</section>';
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
    return '<section>' + pageHead('Report', 'Completed and not completed write the same rows as the bot.', 'Home')
      + errorHtml()
      + '<div class="section">Todos</div>' + todoHtml
      + '<div class="section">Study time</div>' + goalHtml
      + '<button class="secondary" data-action="retry" style="margin-top:10px">Refresh</button></section>';
  }


  function pageHnc() {
    const L = C.LINKS;
    const groups = [
      ['📚', 'Study Material', L.studyMaterial, 'Short notes, updates, tricks & PDFs'],
      ['💬', 'Discussion group', L.discussion, 'Quizzes, doubts & support'],
      ['🎓', 'NEET Library', L.library, 'Book PDFs — join channel first'],
      ['📝', 'To-do sharing', L.todoGroup, 'Share daily todos'],
      ['📱', 'YPT app group', L.ypt, 'Yeolpumta study app'],
      ['🗯️', 'Yapping group', L.yapping, 'Off-topic fun'],
      ['❓', 'NEET Quiz', L.quiz, 'Migrator quizzes'],
      ['🧠', 'NEET MCQs', L.mcq, 'Conceptual polls'],
    ];
    const open = (url, title, desc, emoji) =>
      '<a class="link-card" href="' + esc(url) + '" data-url="' + esc(url) + '" target="_blank" rel="noopener">'
      + '<strong><span class="emoji">' + emoji + '</span>' + esc(title) + '</strong>'
      + (desc ? '<small>' + esc(desc) + '</small>' : '')
      + '</a>';
    const cell = (url, title, emoji) =>
      '<a class="link-card" href="' + esc(url) + '" data-url="' + esc(url) + '" target="_blank" rel="noopener">'
      + '<strong><span class="emoji">' + emoji + '</span>' + esc(title) + '</strong></a>';
    return '<section>' + pageHead('Hidden NEET community', 'Same links as /hnc in the bot.', 'Home')
      + errorHtml()
      + '<div class="join-banner">'
      + '<div class="join-title">🔒 Must join Study Material channel first</div>'
      + '<div class="join-sub">Library and short-notes links stay locked until you join. Tap below to open the channel.</div>'
      + '<a class="join-btn" href="' + esc(L.joinChannel) + '" data-url="' + esc(L.joinChannel) + '" target="_blank" rel="noopener">Join channel · Hidden NEET library</a>'
      + '</div>'
      + '<div class="section">Community</div>'
      + groups.map(([e, t, u, d]) => open(u, t, d, e)).join('')
      + '<div class="section">Study material · Books</div>'
      + '<div class="link-grid">'
      + cell(L.pyq, 'PYQ Books', '📖')
      + cell(L.modules, 'Modules', '📘')
      + '</div>'
      + '<div class="link-grid single">'
      + cell(L.otherBooks, 'Other books', '📚')
      + '</div>'
      + '<div class="section">Study material · Short notes</div>'
      + '<div class="link-grid">'
      + cell(L.bio11, '11th Bio SN ❄️', '❄️')
      + cell(L.bio12, '12th Bio SN ❄️', '❄️')
      + '</div>'
      + '<div class="link-grid single">'
      + cell(L.chemistry, 'Chemistry SN [11+12] ❄️', '❄️')
      + '</div>'
      + '<div class="link-grid">'
      + cell(L.physics11, '11th Physics SN ❄️', '❄️')
      + cell(L.physics12, '12th Physics SN ❄️', '❄️')
      + '</div>'
      + '</section>';
  }


  const pages = {
    home: pageHome,
    tracker: pageTracker,
    hnc: pageHnc,
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
    if (button.dataset.action === 'retry') { await refresh(); return; }
    if (button.dataset.page) { navigate(button.dataset.page); return; }
    if (button.dataset.start) { launchStart(button.dataset.start); return; }
    if (button.dataset.class) { state.classKey = button.dataset.class; render(); return; }
    if (button.dataset.trackerToggle) {
      const activity = button.dataset.activity;
      const chapterId = button.dataset.chapter;
      if (!C.TRACKER_ACTIVITIES.includes(activity) || !chapterId) return;
      await update({ action: 'tracker_toggle', chapterId, activity });
      return;
    }
    if (button.dataset.trackerAdjust) {
      const activity = button.dataset.activity;
      const chapterId = button.dataset.chapter;
      const delta = Number(button.dataset.delta);
      if (!C.TRACKER_ACTIVITIES.includes(activity) || !chapterId || (delta !== 1 && delta !== -1)) return;
      await update({ action: 'tracker_adjust', chapterId, activity, delta });
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

  // ?page=tracker lands straight on the tracker, with Home behind it.
  function openDeepLink() {
    let want = '';
    try { want = new URLSearchParams(window.location.search).get('page') || ''; } catch (_) {}
    if (!want && tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) want = String(tg.initDataUnsafe.start_param);
    if (want === 'tracker') {
      state.stack = ['home'];
      state.page = 'tracker';
    }
  }

  function boot() {
    root = document.getElementById('app');
    if (!root || root.dataset.booted === '1') return;
    root.dataset.booted = '1';
    openDeepLink();
    render();
    if (serverlessAvailable()) refresh();
    else state.error = Object.assign(new Error('Open this Mini App from the bot inside Telegram.'), { type: 'UNAVAILABLE', status: 0 });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
