/* Profile-only Mini App: read the signed-in user's existing /profile data. */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const state = document.getElementById('profile-state');
  const content = document.getElementById('profile-content');
  const retry = document.getElementById('profile-retry');

  if (tg) {
    try { tg.ready(); } catch (_) {}
    try { tg.expand(); } catch (_) {}
    try { tg.setHeaderColor('#07111f'); tg.setBackgroundColor('#07111f'); } catch (_) {}
  }

  function setState(message, isError) {
    state.textContent = message;
    state.className = isError ? 'notice error' : 'notice';
  }

  function setLoading() {
    content.replaceChildren();
    retry.hidden = true;
    setState('Loading your profile from the bot…', false);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function displayNumber(value) {
    if (value == null || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : String(value);
  }

  function addStat(target, label, value) {
    const box = element('div', 'profile-stat');
    box.append(element('div', 'profile-stat-label', label));
    box.append(element('div', 'profile-stat-value', value));
    target.append(box);
  }

  function addCollection(target, title, values, renderItem, emptyText) {
    const section = element('section', 'profile-section');
    section.append(element('h2', '', title));
    if (!values.length) {
      section.append(element('p', 'profile-empty', emptyText));
    } else {
      const list = element('ul', 'profile-list');
      for (const value of values) list.append(element('li', 'profile-chip', renderItem(value)));
      section.append(list);
    }
    target.append(section);
  }

  function renderProfile(profile) {
    if (!profile || typeof profile !== 'object' ||
        !Array.isArray(profile.roster) || !Array.isArray(profile.jutsu) ||
        typeof profile.rank !== 'string') {
      throw new Error('Unexpected profile response');
    }

    content.replaceChildren();
    const identity = element('section', 'profile-identity');
    identity.append(element('div', 'profile-avatar', '🥷'));
    const nameBlock = element('div', '');
    nameBlock.append(element('div', 'profile-name', profile.displayName || 'Shinobi'));
    nameBlock.append(element('div', 'profile-username', profile.username ? `@${profile.username}` : 'Telegram profile'));
    identity.append(nameBlock);
    content.append(identity);

    const rank = element('section', 'profile-rank');
    rank.append(element('div', 'profile-rank-label', 'Current rank'));
    rank.append(element('div', 'profile-rank-value', profile.rank));
    rank.append(element('div', 'profile-xp', profile.xpText || 'XP progress unavailable'));
    content.append(rank);

    const stats = element('section', 'profile-section');
    stats.append(element('h2', '', 'Profile stats'));
    const grid = element('div', 'profile-stats');
    addStat(grid, 'Coins', displayNumber(profile.balance));
    addStat(grid, 'Chakra', displayNumber(profile.chakra));
    addStat(grid, 'XP', displayNumber(profile.xp));
    addStat(grid, 'Kills', displayNumber(profile.kills));
    addStat(grid, 'Claim streak', displayNumber(profile.streak));
    addStat(grid, 'Last claim', profile.lastClaim || '—');
    if (Number(profile.narutoPatrols) > 0) addStat(grid, 'Naruto patrols', displayNumber(profile.narutoPatrols));
    stats.append(grid);
    content.append(stats);

    addCollection(content, 'Shinobi roster', profile.roster,
      (item) => `${item.emoji || '🥷'} ${item.name || 'Shinobi'}${Number(item.qty) > 1 ? ` ×${displayNumber(item.qty)}` : ''}`,
      'No shinobi in your roster yet.');
    addCollection(content, 'Jutsu', profile.jutsu,
      (name) => `🌀 ${name}`,
      'No jutsu unlocked yet.');
    content.append(element('p', 'profile-footnote', 'Synced from your bot profile.'));

    setState('Profile loaded from the bot.', false);
    retry.hidden = true;
  }

  function loadProfile() {
    setLoading();
    if (!tg || !tg.initData) {
      setState('Open this page from the bot inside Telegram to load your private profile.', true);
      retry.hidden = false;
      return;
    }
    const serverless = tg.Serverless;
    if (!serverless || typeof serverless.call !== 'function') {
      setState('Telegram profile service is unavailable in this client. Open the bot and try again.', true);
      retry.hidden = false;
      return;
    }
    try {
      serverless.call('getProfile', {}, (error, result) => {
        if (error) {
          setState('Your profile could not be loaded. Your bot data was not changed; please retry.', true);
          retry.hidden = false;
          return;
        }
        try {
          if (result && result.ok === true && Object.prototype.hasOwnProperty.call(result, 'result')) {
            result = result.result;
          }
          renderProfile(result);
        } catch (_) {
          setState('The profile response was incomplete. Nothing was guessed; please retry.', true);
          retry.hidden = false;
        }
      });
    } catch (_) {
      setState('Your profile could not be loaded. Your bot data was not changed; please retry.', true);
      retry.hidden = false;
    }
  }

  retry.addEventListener('click', loadProfile);
  loadProfile();
})();
