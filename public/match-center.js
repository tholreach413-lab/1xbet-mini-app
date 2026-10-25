'use strict';

const SPORTS = {
  football: {
    name: 'Football',
    title: 'Football Match Center',
    description: 'Live scores, fixtures, and confirmed results from verified football competitions.',
    icon: 'football'
  },
  mlbb: {
    name: 'Mobile Legends',
    title: 'Mobile Legends Match Center',
    description: 'Live series scores, schedules, and confirmed winners from professional MLBB events.',
    icon: 'mlbb'
  }
};

const FILTERS = new Set(['all', 'live', 'today', 'results', 'upcoming']);
const POLL_INTERVAL = 5000;
const BACKGROUND_POLL_INTERVAL = 15000;
const FULL_REFRESH_INTERVAL = 30000;
const INITIAL_VISIBLE_MATCHES = 36;
const VISIBLE_MATCH_STEP = 36;

const state = {
  sport: readStoredSport(),
  filter: 'all',
  query: '',
  matches: [],
  summary: { total: 0, live: 0, today: 0, finished: 0, upcoming: 0 },
  previousStates: {
    football: new Map(),
    mlbb: new Map()
  },
  initializedSports: new Set(),
  liveIds: new Set(),
  visibleCount: INITIAL_VISIBLE_MATCHES,
  lastFullFetch: 0,
  lastUpdatedAt: null,
  requestController: null,
  refreshTimer: null,
  requestInFlight: false,
  suppressNextAlerts: true,
  needsFinalRefresh: false,
  updatedMatchIds: new Set(),
  recentUpdates: [],
  selectedMatchId: null,
  viewerStreamRequest: 0,
  viewerVideoId: null,
  viewerReturnFocus: null,
  viewerCloseTimer: null,
  user: { id: null, balance: null },
  bets: [],
  betslip: { selections: [], stake: 10 },
  betslipOpen: false,
  betsOpen: false,
  previousOdds: new Map(),
  userRequestInFlight: false
};

function readStoredSport() {
  try {
    const requested = new URLSearchParams(window.location.search).get('sport');
    if (SPORTS[requested]) return requested;
    const stored = localStorage.getItem('match-center-sport');
    return SPORTS[stored] ? stored : 'football';
  } catch (_) {
    return 'football';
  }
}

function storeSport(sport) {
  try {
    localStorage.setItem('match-center-sport', sport);
  } catch (_) {}
}

function icon(name, className = '') {
  const safeName = Object.prototype.hasOwnProperty.call(SPORTS, name) || [
    'pulse', 'search', 'refresh', 'clock', 'calendar', 'trophy',
    'chevron', 'close', 'signal', 'arrow-up', 'empty', 'play', 'external', 'verified',
    'ticket', 'wallet', 'trash', 'plus'
  ].includes(name) ? name : 'pulse';
  return `<svg${className ? ` class="${escapeHtml(className)}"` : ''} aria-hidden="true"><use href="#icon-${safeName}"/></svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getInitials(value, fallback = 'TM') {
  const words = cleanText(value).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || fallback).slice(0, 2).toUpperCase();
}

function crestColor(teamName) {
  const palette = ['#253b67', '#3e2f62', '#214f4b', '#56333c', '#3d4658', '#4d4027'];
  let hash = 0;
  for (const character of String(teamName || '')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function hasScore(match) {
  return Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore));
}

function scoreText(match) {
  if (!hasScore(match)) return 'VS';
  const separator = match.sport === 'mlbb' ? '/' : '–';
  return `${Number(match.homeScore)}${separator}${Number(match.awayScore)}`;
}

function matchState(match) {
  return {
    score: hasScore(match) ? `${Number(match.homeScore)}:${Number(match.awayScore)}` : null,
    isLive: Boolean(match.isLive),
    isFinished: Boolean(match.isFinished),
    winner: cleanText(match.winner || '')
  };
}

function triggerHaptic(type) {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.HapticFeedback) return;
  try {
    if (type === 'success' || type === 'warning' || type === 'error') {
      webApp.HapticFeedback.notificationOccurred(type);
    } else {
      webApp.HapticFeedback.impactOccurred(type || 'light');
    }
  } catch (_) {}
}

function initializeTelegram() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return;
  try {
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.('#090d14');
    webApp.setBackgroundColor?.('#090d14');
  } catch (_) {}
}

async function fetchSnapshot(view) {
  const controller = new AbortController();
  state.requestController = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({
      sport: state.sport,
      view,
      requestTime: String(Date.now())
    });
    const response = await fetch(`/api/matches?${params}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Score service returned HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.matches)) {
      throw new Error('Score service returned an invalid response');
    }
    return data;
  } finally {
    clearTimeout(timeout);
    if (state.requestController === controller) state.requestController = null;
  }
}

function updatePreviousStates(matches, suppressAlerts) {
  const previousMap = state.previousStates[state.sport];
  const canAlert = !suppressAlerts && document.visibilityState === 'visible';

  for (const match of matches) {
    const current = matchState(match);
    const previous = previousMap.get(match.id);

    if (canAlert && previous && match.sport === state.sport) {
      if (current.isFinished && !previous.isFinished) {
        showWinnerAlert(match, current);
        markMatchUpdated(match.id);
      } else if (current.isLive && current.score && previous.score && current.score !== previous.score) {
        showScoreAlert(match);
        markMatchUpdated(match.id);
      }
    }

    previousMap.set(match.id, current);
  }

  state.initializedSports.add(state.sport);
}

function showScoreAlert(match) {
  const title = match.sport === 'mlbb' ? 'Series score updated' : 'Live score updated';
  const message = `${cleanText(match.homeTeam)} ${scoreText(match)} ${cleanText(match.awayTeam)}`;
  showToast('goal', SPORTS[state.sport].icon, title, message);
  addRecentUpdate(title, message);
  triggerHaptic('medium');
}

function showWinnerAlert(match, current) {
  const winner = current.winner;
  const isDraw = normalize(winner) === 'draw';
  const title = match.sport === 'mlbb' ? 'Series complete' : 'Full time';
  const message = isDraw
    ? `${cleanText(match.homeTeam)} and ${cleanText(match.awayTeam)} finished level at ${scoreText(match)}`
    : `${winner || 'Result confirmed'} won ${scoreText(match)}`;
  showToast('winner', 'trophy', title, message);
  addRecentUpdate(title, message);
  triggerHaptic('success');
}

function showToast(type, iconName, title, message) {
  const region = document.getElementById('toastRegion');
  if (!region) return;

  const toast = document.createElement('article');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon(iconName)}</span>
    <span class="toast-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </span>
    <button class="toast-close" type="button" aria-label="Dismiss notification">${icon('close')}</button>
  `;

  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 180);
  };
  toast.querySelector('.toast-close')?.addEventListener('click', dismiss);
  region.prepend(toast);
  while (region.children.length > 3) region.lastElementChild?.remove();
  setTimeout(dismiss, 6000);
}

function addRecentUpdate(title, message) {
  state.recentUpdates.unshift({ title, message, time: Date.now() });
  state.recentUpdates = state.recentUpdates.slice(0, 8);
}

function markMatchUpdated(matchId) {
  state.updatedMatchIds.add(matchId);
  setTimeout(() => {
    state.updatedMatchIds.delete(matchId);
    const row = [...document.querySelectorAll('.match-row')].find(element => element.dataset.matchId === matchId);
    row?.classList.remove('score-updated');
  }, 1600);
}

function mergeLiveSnapshot(liveMatches) {
  const map = new Map(state.matches.map(match => [match.id, match]));
  for (const match of liveMatches) map.set(match.id, match);
  state.matches = [...map.values()];
}

async function refreshScores(options = {}) {
  if (state.requestInFlight) return;
  state.requestInFlight = true;
  state.needsFinalRefresh = false;
  const requestedSport = state.sport;
  const forceFull = Boolean(options.forceFull);
  const shouldFetchFull = forceFull
    || requestedSport === 'mlbb'
    || state.matches.length === 0
    || Date.now() - state.lastFullFetch >= FULL_REFRESH_INTERVAL;
  const view = shouldFetchFull ? 'app' : 'live';

  setConnection('syncing');
  document.getElementById('refreshButton')?.classList.add('loading');

  try {
    const data = await fetchSnapshot(view);
    if (requestedSport !== state.sport) return;

    const suppressAlerts = state.suppressNextAlerts || !state.initializedSports.has(state.sport);
    const previousLiveIds = new Set(state.liveIds);

    updatePreviousStates(data.matches, suppressAlerts);
    if (view === 'app') {
      state.matches = data.matches;
      state.summary = data.summary || calculateSummary(data.matches);
      state.lastFullFetch = Date.now();
    } else {
      mergeLiveSnapshot(data.matches);
      state.summary = {
        ...state.summary,
        live: Number(data.summary?.live ?? data.liveCount ?? data.matches.length)
      };
    }

    state.liveIds = new Set(data.matches.filter(match => match.isLive).map(match => match.id));
    if (view === 'live') {
      const disappearedLiveMatch = [...previousLiveIds].some(id => !state.liveIds.has(id));
      if (disappearedLiveMatch) state.needsFinalRefresh = true;
    }

    state.lastUpdatedAt = data.updatedAt || new Date().toISOString();
    state.suppressNextAlerts = false;
    const providerAge = Date.now() - Date.parse(state.lastUpdatedAt);
    setConnection(Number.isFinite(providerAge) && providerAge > 30000 ? 'offline' : 'online');
    render();
    refreshUser();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('Live score refresh:', error.message);
      setConnection('offline');
      if (state.matches.length === 0) renderError();
    }
  } finally {
    state.requestInFlight = false;
    document.getElementById('refreshButton')?.classList.remove('loading');
    if (requestedSport === state.sport) {
      if (state.needsFinalRefresh) scheduleRefresh(350, true);
      else scheduleRefresh(document.visibilityState === 'visible' ? POLL_INTERVAL : BACKGROUND_POLL_INTERVAL);
    } else {
      scheduleRefresh(0, true);
    }
  }
}

function scheduleRefresh(delay, forceFull = false) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => refreshScores({ forceFull }), delay);
}

function calculateSummary(matches) {
  return {
    total: matches.length,
    live: matches.filter(match => match.isLive).length,
    today: matches.filter(match => match.day === 'Today' || match.isLive).length,
    finished: matches.filter(match => match.isFinished).length,
    upcoming: matches.filter(match => !match.isLive && !match.isFinished).length
  };
}

function setConnection(status) {
  const labels = {
    syncing: 'Synchronizing',
    online: 'Live connection',
    offline: 'Reconnecting'
  };
  const connectionText = document.getElementById('connectionText');
  const sidebarText = document.getElementById('sidebarStatusText');
  if (connectionText) connectionText.textContent = labels[status];
  if (sidebarText) sidebarText.textContent = labels[status];

  document.querySelectorAll('#connectionChip .status-indicator, #sidebarStatusDot').forEach(dot => {
    dot.classList.remove('online', 'offline');
    if (status === 'online') dot.classList.add('online');
    if (status === 'offline') dot.classList.add('offline');
  });
}

function switchSport(sport) {
  if (!SPORTS[sport] || sport === state.sport) return;
  closeMatchViewer();
  state.requestController?.abort();
  clearTimeout(state.refreshTimer);
  state.sport = sport;
  state.filter = 'all';
  state.query = '';
  state.matches = [];
  state.summary = { total: 0, live: 0, today: 0, finished: 0, upcoming: 0 };
  state.liveIds = new Set();
  state.visibleCount = INITIAL_VISIBLE_MATCHES;
  state.lastFullFetch = 0;
  state.suppressNextAlerts = true;
  storeSport(sport);

  const search = document.getElementById('matchSearch');
  if (search) search.value = '';
  document.getElementById('clearSearch')?.setAttribute('hidden', '');
  updateNavigation();
  updatePageCopy();
  renderLoading();
  refreshScores({ forceFull: true });
  triggerHaptic('light');
}

function setFilter(filter) {
  if (!FILTERS.has(filter)) return;
  state.filter = filter;
  state.visibleCount = INITIAL_VISIBLE_MATCHES;
  document.querySelectorAll('.filter-tab').forEach(button => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  renderMatches();
}

function updateNavigation() {
  document.querySelectorAll('[data-sport]').forEach(button => {
    const active = button.dataset.sport === state.sport;
    button.classList.toggle('active', active);
    if (button.getAttribute('role') === 'tab') button.setAttribute('aria-selected', String(active));
  });
}

function updatePageCopy() {
  const config = SPORTS[state.sport];
  const title = document.getElementById('pageTitle');
  const description = document.getElementById('pageDescription');
  const topbarName = document.getElementById('topbarSportName');
  if (title) title.textContent = config.title;
  if (description) description.textContent = config.description;
  if (topbarName) topbarName.textContent = config.name;
  document.title = `1X Live | ${config.name}`;
}

function getFilteredMatches() {
  const query = normalize(state.query);
  return state.matches.filter(match => {
    if (state.filter === 'live' && !match.isLive) return false;
    if (state.filter === 'today' && match.day !== 'Today' && !match.isLive) return false;
    if (state.filter === 'results' && !match.isFinished) return false;
    if (state.filter === 'upcoming' && (match.isLive || match.isFinished)) return false;

    if (query) {
      const searchable = normalize([
        match.homeTeam,
        match.awayTeam,
        match.league,
        match.rawLeague,
        match.country
      ].join(' '));
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
}

function leagueKey(match) {
  return `${cleanText(match.country) || 'International'}::${cleanText(match.league || match.rawLeague) || 'Other matches'}`;
}

function render() {
  updateNavigation();
  updatePageCopy();
  renderSummary();
  renderMatches();
  renderLiveRail();
  renderFreshness();
  updateOpenMatchViewer();
  renderBetslip();
  renderWallet();
}

function renderSummary() {
  const summary = state.summary || calculateSummary(state.matches);
  setText('summaryLive', summary.live || 0);
  setText('summaryToday', summary.today || 0);
  setText('summaryFinished', summary.finished || 0);
  setText('railLiveCount', summary.live || 0);
  document.querySelectorAll(`[data-count-for="${state.sport}"]`).forEach(element => {
    element.textContent = String(summary.live || 0);
  });
}

function renderFreshness() {
  const element = document.getElementById('lastUpdated');
  if (!element || !state.lastUpdatedAt) return;
  const timestamp = Date.parse(state.lastUpdatedAt);
  if (!Number.isFinite(timestamp)) {
    element.textContent = 'Updated recently';
    return;
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  element.textContent = seconds < 6 ? 'Just now' : `${seconds} seconds ago`;
}

function renderMatches() {
  const feed = document.getElementById('matchFeed');
  if (!feed) return;

  const filtered = getFilteredMatches();
  const visible = filtered.slice(0, state.visibleCount);
  const summaryText = document.getElementById('resultSummary');
  if (summaryText) {
    const context = state.query ? ` matching "${state.query}"` : '';
    summaryText.textContent = `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'match' : 'matches'}${context}`;
  }

  const loadMore = document.getElementById('loadMoreButton');
  if (loadMore) loadMore.hidden = visible.length >= filtered.length;

  if (visible.length === 0) {
    const nextMatch = state.matches.find(match => !match.isLive && !match.isFinished);
    const isEmptyLiveView = state.filter === 'live';
    const emptyTitle = isEmptyLiveView ? 'No verified live match right now' : 'No matches found';
    const emptyMessage = isEmptyLiveView && nextMatch
      ? `Next scheduled fixture: ${cleanText(nextMatch.homeTeam)} vs ${cleanText(nextMatch.awayTeam)} at ${getStatusLabel(nextMatch)}.`
      : 'Try another status filter or search for a different team or competition.';
    feed.setAttribute('aria-busy', 'false');
    feed.innerHTML = `
      <div class="empty-state">
        ${icon(isEmptyLiveView ? 'verified' : 'empty')}
        <strong>${escapeHtml(emptyTitle)}</strong>
        <p>${escapeHtml(emptyMessage)}</p>
      </div>
    `;
    return;
  }

  const groups = new Map();
  for (const match of visible) {
    const key = leagueKey(match);
    if (!groups.has(key)) {
      groups.set(key, {
        country: cleanText(match.country) || 'International',
        league: cleanText(match.league || match.rawLeague) || 'Other matches',
        matches: []
      });
    }
    groups.get(key).matches.push(match);
  }

  feed.innerHTML = [...groups.values()].map(group => renderLeague(group)).join('');
  feed.setAttribute('aria-busy', 'false');
  bindCrestErrors(feed);
  bindMatchRows(feed);
  snapshotOdds();
}

function renderLeague(group) {
  const monogram = getInitials(group.league, 'LG');
  return `
    <section class="league-block">
      <header class="league-header">
        <div class="league-heading-copy">
          <span class="league-monogram">${escapeHtml(monogram)}</span>
          <div>
            <strong>${escapeHtml(group.league)}</strong>
            <span>${escapeHtml(group.country)}</span>
          </div>
        </div>
        <span class="league-match-count">${group.matches.length} ${group.matches.length === 1 ? 'match' : 'matches'}</span>
      </header>
      <div>${group.matches.map(renderMatch).join('')}</div>
    </section>
  `;
}

function hasVerifiedLiveVideo(match) {
  const videoId = String(match.streamInfo?.videoId || '');
  return match.isLive === true
    && match.streamInfo?.verified === true
    && match.streamInfo?.isLive === true
    && /^[A-Za-z0-9_-]{11}$/.test(videoId);
}

function renderMatchAction(match) {
  if (hasVerifiedLiveVideo(match)) {
    return `
      <div class="match-action-cell has-video">
        <button class="match-video-button" type="button" data-watch-match-id="${escapeHtml(match.id)}" aria-label="Watch verified live video for ${escapeHtml(cleanText(match.homeTeam))} versus ${escapeHtml(cleanText(match.awayTeam))}">
          ${icon('play')}<span>Watch live</span>
        </button>
      </div>`;
  }
  if (match.isLive) {
    return `<div class="match-action-cell no-video"><span class="video-unavailable">Live video not found</span></div>`;
  }
  return `<div class="match-action-cell passive"><span class="match-disclosure">${icon('chevron')}</span></div>`;
}

function renderMatch(match) {
  const finished = Boolean(match.isFinished);
  const live = Boolean(match.isLive);
  const homeWinner = finished && normalize(match.winner) === normalize(match.homeTeam);
  const awayWinner = finished && normalize(match.winner) === normalize(match.awayTeam);
  const draw = finished && normalize(match.winner) === 'draw';
  const status = getStatusLabel(match);
  const timeMeta = live ? 'In play' : finished ? 'Confirmed' : cleanText(match.day || 'Scheduled');
  const scoreState = live ? 'Live' : finished ? (draw ? 'Draw' : 'Final') : cleanText(match.day || 'Fixture');
  const updatedClass = state.updatedMatchIds.has(match.id) ? ' score-updated' : '';

  return `
    <div class="match-card${live ? ' is-live-card' : ''}${finished ? ' is-finished-card' : ''}">
      <article class="match-row${live ? ' is-live' : ''}${finished ? ' is-finished' : ''}${updatedClass}" data-match-id="${escapeHtml(match.id)}" role="button" tabindex="0" aria-label="Open match view for ${escapeHtml(cleanText(match.homeTeam))} versus ${escapeHtml(cleanText(match.awayTeam))}">
        <div class="match-time-cell">
          ${live
            ? `<span class="status-live"><span class="live-dot"></span>${escapeHtml(status)}</span>`
            : `<span>${escapeHtml(status)}</span>`}
          <small>${escapeHtml(timeMeta)}</small>
          <span class="match-provider">${escapeHtml(cleanText(match.source || 'Verified'))}</span>
        </div>
        ${renderTeam(match.homeTeam, match.homeLogo, 'home', homeWinner, awayWinner)}
        <div class="score-cell">
          <span class="score-value">${escapeHtml(scoreText(match))}</span>
          <span class="score-state">${escapeHtml(scoreState)}</span>
        </div>
        ${renderTeam(match.awayTeam, match.awayLogo, 'away', awayWinner, homeWinner)}
        ${renderMatchAction(match)}
      </article>
      ${renderOddsStrip(match)}
    </div>
  `;
}

function renderOddsStrip(match) {
  if (match.isFinished) return '';
  if (!match.oddsAvailable || !Array.isArray(match.markets) || match.markets.length === 0) {
    return match.isLive
      ? '<div class="odds-strip is-suspended"><span>Odds suspended</span></div>'
      : '';
  }

  const previous = state.previousOdds.get(match.id) || {};
  const buttons = match.markets.map(market => {
    const selected = isSelected(match.id, market.id);
    const old = previous[market.id];
    let move = '';
    if (Number.isFinite(old)) {
      if (market.price > old) move = ' odd-up';
      else if (market.price < old) move = ' odd-down';
    }
    const sub = market.id === 'X' ? 'Draw' : market.id === '2' ? 'Away' : 'Home';
    return `
      <button class="odd-btn${selected ? ' selected' : ''}${move}" type="button"
        data-odd-match="${escapeHtml(match.id)}" data-odd-market="${escapeHtml(market.id)}"
        aria-pressed="${selected}"
        aria-label="${escapeHtml(cleanText(market.pick))} at ${market.price.toFixed(2)}">
        <span class="odd-label">${escapeHtml(market.label)}</span>
        <span class="odd-sub">${escapeHtml(sub)}</span>
        <span class="odd-price">${market.price.toFixed(2)}</span>
      </button>`;
  }).join('');

  return `<div class="odds-strip" data-markets="${match.markets.length}">${buttons}</div>`;
}

function snapshotOdds() {
  for (const match of state.matches) {
    if (match.oddsAvailable && Array.isArray(match.markets)) {
      state.previousOdds.set(match.id, Object.fromEntries(match.markets.map(market => [market.id, market.price])));
    }
  }
}

function renderTeam(teamName, logoUrl, side, winner, loser) {
  const safeTeam = cleanText(teamName) || 'Team';
  const initials = getInitials(safeTeam);
  const fallback = `<span class="crest-fallback" style="--crest-color:${crestColor(safeTeam)}">${escapeHtml(initials)}</span>`;
  const logo = typeof logoUrl === 'string' && (/^\//.test(logoUrl) || /^https:\/\//.test(logoUrl))
    ? `<img src="${escapeHtml(logoUrl)}" alt="" loading="lazy" decoding="async">`
    : '';
  const winnerMarkup = winner
    ? `<span class="winner-label">${icon('trophy')} Winner</span>`
    : '';
  const nameClass = winner ? ' winner' : loser ? ' loser' : '';
  const crest = `<span class="team-crest">${fallback}${logo}</span>`;
  const copy = `<span class="team-copy"><span class="team-name${nameClass}">${escapeHtml(safeTeam)}</span>${winnerMarkup}</span>`;

  return side === 'home'
    ? `<div class="team-cell home">${copy}${crest}</div>`
    : `<div class="team-cell away">${crest}${copy}</div>`;
}

function getStatusLabel(match) {
  if (match.isLive) return cleanText(match.period || match.time || 'Live');
  if (match.isFinished) return cleanText(match.period || 'FT');
  return cleanText(match.kickoffTime || match.time || 'Scheduled');
}

function bindCrestErrors(container) {
  container.querySelectorAll('.team-crest img, .viewer-crest img').forEach(image => {
    image.addEventListener('error', () => image.remove(), { once: true });
  });
}

function bindMatchRows(container) {
  container.querySelectorAll('[data-odd-market]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      toggleSelection(button.dataset.oddMatch, button.dataset.oddMarket);
    });
  });

  container.querySelectorAll('[data-watch-match-id]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openMatchViewer(button.dataset.watchMatchId, button);
    });
  });

  container.querySelectorAll('.match-row[data-match-id]').forEach(row => {
    const open = () => openMatchViewer(row.dataset.matchId, row);
    row.addEventListener('click', event => {
      if (event.target.closest('[data-watch-match-id]')) return;
      open();
    });
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function viewerCrest(teamName, logoUrl) {
  const safeTeam = cleanText(teamName) || 'Team';
  const fallback = `<span class="crest-fallback" style="--crest-color:${crestColor(safeTeam)}">${escapeHtml(getInitials(safeTeam))}</span>`;
  const logo = typeof logoUrl === 'string' && (/^\//.test(logoUrl) || /^https:\/\//.test(logoUrl))
    ? `<img src="${escapeHtml(logoUrl)}" alt="" decoding="async">`
    : '';
  return `${fallback}${logo}`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch (_) {
    return null;
  }
}

function setViewerLink(id, url) {
  const link = document.getElementById(id);
  if (!link) return;
  const safeUrl = safeExternalUrl(url);
  link.hidden = !safeUrl;
  if (safeUrl) link.href = safeUrl;
  else link.removeAttribute('href');
}

function formatSourceUpdate(match) {
  const timestamp = Date.parse(match.sourceUpdatedAt || state.lastUpdatedAt || '');
  if (!Number.isFinite(timestamp)) return 'Live synchronization active';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  return seconds < 6 ? 'Updated just now' : `Updated ${seconds} seconds ago`;
}

function openMatchViewer(matchId, returnFocus) {
  const match = state.matches.find(item => item.id === matchId);
  const viewer = document.getElementById('matchViewer');
  if (!match || !viewer) return;

  state.selectedMatchId = matchId;
  state.viewerReturnFocus = returnFocus || document.activeElement;
  state.viewerVideoId = null;
  state.viewerStreamRequest += 1;
  clearTimeout(state.viewerCloseTimer);
  viewer.hidden = false;
  document.body.classList.add('viewer-open');
  renderMatchViewer(match);
  resetViewerMedia();
  loadVerifiedBroadcast(match, state.viewerStreamRequest);
  requestAnimationFrame(() => viewer.classList.add('open'));
  setTimeout(() => document.getElementById('viewerClose')?.focus(), 80);
}

function closeMatchViewer() {
  const viewer = document.getElementById('matchViewer');
  if (!viewer || viewer.hidden) return;
  state.viewerStreamRequest += 1;
  state.selectedMatchId = null;
  state.viewerVideoId = null;
  viewer.classList.remove('open');
  document.body.classList.remove('viewer-open');
  const video = document.getElementById('viewerVideo');
  if (video) video.src = '';
  state.viewerCloseTimer = setTimeout(() => {
    viewer.hidden = true;
    state.viewerReturnFocus?.focus?.();
    state.viewerReturnFocus = null;
    state.viewerCloseTimer = null;
  }, 220);
}

function updateOpenMatchViewer() {
  if (!state.selectedMatchId) return;
  const match = state.matches.find(item => item.id === state.selectedMatchId);
  if (!match) {
    closeMatchViewer();
    return;
  }
  renderMatchViewer(match);
  if (!state.viewerVideoId && match.streamInfo?.verified && match.streamInfo?.isLive) {
    state.viewerStreamRequest += 1;
    loadVerifiedBroadcast(match, state.viewerStreamRequest);
  }
}

function renderMatchViewer(match) {
  const viewer = document.getElementById('matchViewer');
  if (!viewer || viewer.hidden) return;

  const sourceName = cleanText(match.source || 'Verified provider');
  setText('viewerSource', `${sourceName} verified`);
  setText('viewerTitle', `${cleanText(match.homeTeam)} vs ${cleanText(match.awayTeam)}`);
  setText('viewerLeague', cleanText(match.league || match.rawLeague || 'Competition'));
  setText('viewerCountry', cleanText(match.country || 'International'));
  setText('viewerHomeTeam', cleanText(match.homeTeam));
  setText('viewerAwayTeam', cleanText(match.awayTeam));
  setText('viewerScore', scoreText(match));
  setText('viewerStatus', match.isLive ? getStatusLabel(match) : match.isFinished ? 'Full time' : getStatusLabel(match));
  setText('viewerUpdated', formatSourceUpdate(match));

  const sportIcon = document.getElementById('viewerSportIcon');
  if (sportIcon) sportIcon.innerHTML = icon(SPORTS[match.sport]?.icon || 'pulse');
  const homeCrest = document.getElementById('viewerHomeCrest');
  const awayCrest = document.getElementById('viewerAwayCrest');
  if (homeCrest) homeCrest.innerHTML = viewerCrest(match.homeTeam, match.homeLogo);
  if (awayCrest) awayCrest.innerHTML = viewerCrest(match.awayTeam, match.awayLogo);
  bindCrestErrors(viewer);

  const homeWon = match.isFinished && normalize(match.winner) === normalize(match.homeTeam);
  const awayWon = match.isFinished && normalize(match.winner) === normalize(match.awayTeam);
  const homeWinner = document.getElementById('viewerHomeWinner');
  const awayWinner = document.getElementById('viewerAwayWinner');
  if (homeWinner) homeWinner.hidden = !homeWon;
  if (awayWinner) awayWinner.hidden = !awayWon;

  const status = document.getElementById('viewerStatus');
  status?.classList.toggle('live', Boolean(match.isLive));
  status?.classList.toggle('final', Boolean(match.isFinished));
  const trackerTitle = match.isLive ? 'Live score tracker active' : match.isFinished ? 'Official result confirmed' : 'Scheduled match';
  const trackerMessage = match.isLive
    ? `The ${sourceName} score and match status refresh automatically every five seconds.`
    : match.isFinished
      ? `${cleanText(match.winner || 'The result')} is confirmed by ${sourceName}.`
      : `Kickoff is scheduled for ${getStatusLabel(match)}. This view will switch to live automatically when confirmed.`;
  setText('viewerTrackerTitle', trackerTitle);
  setText('viewerTrackerMessage', trackerMessage);
  setText('viewerVerificationText', match.sport === 'football'
    ? 'Football scores and match minutes come directly from LiveScore. No video stream is guessed.'
    : 'MLBB scores, winners, schedules, and broadcast IDs come directly from GosuGamers match records.');
  setViewerLink('viewerSourceLink', match.sourceUrl);
}

function resetViewerMedia() {
  const section = document.getElementById('viewerVideoSection');
  const video = document.getElementById('viewerVideo');
  const tracker = document.getElementById('viewerTracker');
  if (section) section.hidden = true;
  if (video) video.src = '';
  if (tracker) tracker.classList.remove('with-broadcast');
  setViewerLink('viewerWatchExternal', null);
}

async function loadVerifiedBroadcast(match, requestId) {
  const tracker = document.getElementById('viewerTracker');
  try {
    const response = await fetch(`/api/stream/find?matchId=${encodeURIComponent(match.id)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();
    if (requestId !== state.viewerStreamRequest || state.selectedMatchId !== match.id) return;

    if (data.found && data.verified && safeExternalUrl(data.embedUrl)) {
      const section = document.getElementById('viewerVideoSection');
      const video = document.getElementById('viewerVideo');
      state.viewerVideoId = data.videoId;
      if (video && video.src !== data.embedUrl) video.src = data.embedUrl;
      if (section) section.hidden = false;
      if (tracker) tracker.classList.add('with-broadcast');
      setText('viewerBroadcastLabel', data.sourceLabel || 'Official broadcast');
      setText('viewerBroadcastNote', data.isMatchLive
        ? 'This broadcast is linked to the live match record.'
        : 'The official tournament broadcast is live; this match has not started yet.');
      setViewerLink('viewerWatchExternal', data.watchUrl);
      return;
    }

    state.viewerVideoId = null;
    if (tracker) tracker.classList.remove('with-broadcast');
    if (Array.isArray(data.channels) && data.channels.length > 0) {
      setText('viewerTrackerTitle', 'Licensed coverage listed');
    } else if (match.isLive) {
      setText('viewerTrackerTitle', 'Live video not found');
    } else {
      setText('viewerTrackerTitle', 'Official live video not available');
    }
    setText('viewerTrackerMessage', data.message || document.getElementById('viewerTrackerMessage')?.textContent || 'Verified tracking is active.');
  } catch (_) {
    if (requestId !== state.viewerStreamRequest || state.selectedMatchId !== match.id) return;
    state.viewerVideoId = null;
    if (tracker) tracker.classList.remove('with-broadcast');
  }
}

function renderLiveRail() {
  const container = document.getElementById('railLiveMatches');
  if (!container) return;
  const liveMatches = state.matches.filter(match => match.isLive).slice(0, 8);
  if (liveMatches.length === 0) {
    container.innerHTML = '<div class="rail-empty">There are no live matches in this sport right now.</div>';
    return;
  }

  container.innerHTML = liveMatches.map(match => `
    <button class="rail-match" type="button" data-rail-match-id="${escapeHtml(match.id)}">
      <span class="rail-match-top"><span>${escapeHtml(cleanText(match.league || 'Live match'))}</span><span>${escapeHtml(getStatusLabel(match))}</span></span>
      <span class="rail-match-teams"><span>${escapeHtml(cleanText(match.homeTeam))}<br>${escapeHtml(cleanText(match.awayTeam))}</span><strong class="rail-match-score">${escapeHtml(scoreText(match))}</strong></span>
      <span class="rail-video-state ${hasVerifiedLiveVideo(match) ? 'available' : ''}">${hasVerifiedLiveVideo(match) ? `${icon('play')} Watch live` : 'Live video not found'}</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-rail-match-id]').forEach(button => {
    button.addEventListener('click', () => openMatchViewer(button.dataset.railMatchId, button));
  });
}

function renderLoading() {
  const feed = document.getElementById('matchFeed');
  if (!feed) return;
  feed.setAttribute('aria-busy', 'true');
  feed.innerHTML = `
    <div class="skeleton-league"><span></span><span></span><span></span></div>
    <div class="skeleton-match"></div>
    <div class="skeleton-match"></div>
    <div class="skeleton-match"></div>
  `;
  setText('resultSummary', 'Loading verified fixtures');
}

function renderError() {
  const feed = document.getElementById('matchFeed');
  if (!feed) return;
  feed.setAttribute('aria-busy', 'false');
  feed.innerHTML = `
    <div class="error-state">
      ${icon('signal')}
      <strong>Unable to reach the score service</strong>
      <p>The app will reconnect automatically. You can also use the refresh button above.</p>
    </div>
  `;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function bindEvents() {
  document.querySelectorAll('[data-sport]').forEach(button => {
    button.addEventListener('click', () => switchSport(button.dataset.sport));
  });

  document.querySelectorAll('.filter-tab').forEach(button => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });

  document.getElementById('viewerClose')?.addEventListener('click', closeMatchViewer);
  document.getElementById('viewerBackdrop')?.addEventListener('click', closeMatchViewer);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.selectedMatchId) closeMatchViewer();
  });

  const search = document.getElementById('matchSearch');
  const clearSearch = document.getElementById('clearSearch');
  search?.addEventListener('input', () => {
    state.query = search.value.trim();
    state.visibleCount = INITIAL_VISIBLE_MATCHES;
    clearSearch?.toggleAttribute('hidden', !state.query);
    renderMatches();
  });

  clearSearch?.addEventListener('click', () => {
    if (search) search.value = '';
    state.query = '';
    state.visibleCount = INITIAL_VISIBLE_MATCHES;
    clearSearch.hidden = true;
    search?.focus();
    renderMatches();
  });

  document.getElementById('refreshButton')?.addEventListener('click', () => {
    clearTimeout(state.refreshTimer);
    refreshScores({ forceFull: true });
    triggerHaptic('light');
  });

  document.getElementById('loadMoreButton')?.addEventListener('click', () => {
    state.visibleCount += VISIBLE_MATCH_STEP;
    renderMatches();
  });

  document.getElementById('backToTop')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.addEventListener('visibilitychange', () => {
    clearTimeout(state.refreshTimer);
    if (document.visibilityState === 'visible') {
      state.suppressNextAlerts = true;
      refreshScores({ forceFull: true });
    } else {
      scheduleRefresh(BACKGROUND_POLL_INTERVAL);
    }
  });

  bindBettingEvents();

  window.addEventListener('online', () => refreshScores({ forceFull: true }));
  window.addEventListener('offline', () => setConnection('offline'));
}

function initialize() {
  initializeTelegram();
  state.user.id = getUserId();
  bindEvents();
  updateNavigation();
  updatePageCopy();
  renderWallet();
  renderBetslip();
  renderLoading();
  refreshScores({ forceFull: true });
  refreshUser();
  setInterval(renderFreshness, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}


/* ==========================================================================
   BETTING: model odds selections, bet slip, wallet, and bet history.
   Odds are the platform's own live model prices. Betting uses demo credits.
   ========================================================================== */

function getUserId() {
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (telegramUser?.id) return `tg_${telegramUser.id}`;
  try {
    let id = localStorage.getItem('match-center-uid');
    if (!id) {
      id = `guest_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('match-center-uid', id);
    }
    return id;
  } catch (_) {
    return 'guest';
  }
}

function formatCredits(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isSelected(matchId, marketId) {
  return state.betslip.selections.some(selection => selection.matchId === matchId && selection.marketId === marketId);
}

function buildSelection(match, market) {
  return {
    matchId: match.id,
    marketId: market.id,
    price: market.price,
    pick: market.pick,
    label: market.label,
    matchLabel: `${cleanText(match.homeTeam)} vs ${cleanText(match.awayTeam)}`,
    sport: match.sport,
    invalid: false
  };
}

function toggleSelection(matchId, marketId) {
  const match = state.matches.find(item => item.id === matchId);
  if (!match || !match.oddsAvailable) return;
  const market = (match.markets || []).find(item => item.id === marketId);
  if (!market) return;

  const selections = state.betslip.selections;
  const index = selections.findIndex(selection => selection.matchId === matchId);
  if (index >= 0 && selections[index].marketId === marketId) {
    selections.splice(index, 1);
  } else if (index >= 0) {
    selections[index] = buildSelection(match, market);
    state.betslipOpen = true;
  } else {
    if (selections.length >= 12) {
      showToast('', 'close', 'Bet slip full', 'Maximum 12 selections per bet');
      return;
    }
    selections.push(buildSelection(match, market));
    state.betslipOpen = true;
  }

  triggerHaptic('selection');
  renderBetslip();
  renderMatches();
}

function removeSelection(matchId) {
  state.betslip.selections = state.betslip.selections.filter(selection => selection.matchId !== matchId);
  if (state.betslip.selections.length === 0) state.betslipOpen = false;
  renderBetslip();
  renderMatches();
}

function currentStake() {
  const number = parseFloat(state.betslip.stake);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

function combinedOdds() {
  const valid = state.betslip.selections.filter(selection => !selection.invalid);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((acc, selection) => acc * Number(selection.price || 1), 1) * 100) / 100;
}

function renderWallet() {
  const balance = state.user.balance;
  setText('walletBalance', balance == null ? '—' : formatCredits(balance));
  setText('betsDrawerBalance', balance == null ? '—' : formatCredits(balance));
}

function updateBetslipSummary() {
  const odds = combinedOdds();
  const stake = currentStake();
  setText('betslipOdds', odds ? odds.toFixed(2) : '1.00');
  setText('betslipReturn', formatCredits(stake * odds));
  const placeButton = document.getElementById('placeBet');
  if (placeButton) {
    const valid = state.betslip.selections.filter(selection => !selection.invalid);
    const affordable = state.user.balance == null || stake <= state.user.balance;
    placeButton.disabled = !(valid.length > 0 && stake >= 0.5 && affordable);
  }
}

function renderBetslip() {
  const selections = state.betslip.selections;

  for (const selection of selections) {
    const match = state.matches.find(item => item.id === selection.matchId);
    if (!match) { selection.invalid = false; continue; }
    if (match.isFinished || !match.oddsAvailable) { selection.invalid = true; continue; }
    const market = (match.markets || []).find(item => item.id === selection.marketId);
    if (market) { selection.price = market.price; selection.invalid = false; }
    else selection.invalid = true;
  }

  const count = selections.length;
  const hasItems = count > 0;
  const open = hasItems && state.betslipOpen;

  const fab = document.getElementById('betslipFab');
  if (fab) fab.hidden = !hasItems || state.betslipOpen;
  setText('fabCount', count);
  setText('betslipCount', count);

  const panel = document.getElementById('betslip');
  if (panel) {
    panel.hidden = !open;
    panel.classList.toggle('open', open);
  }
  document.body.classList.toggle('betslip-open', open);

  const list = document.getElementById('betslipList');
  if (list) {
    if (!hasItems) {
      list.innerHTML = '<div class="betslip-empty">Tap any odds on a match to add it here.</div>';
    } else {
      list.innerHTML = selections.map(selection => `
        <div class="slip-item${selection.invalid ? ' invalid' : ''}">
          <div class="slip-item-main">
            <span class="slip-pick">${escapeHtml(cleanText(selection.pick))}</span>
            <span class="slip-match">${escapeHtml(cleanText(selection.matchLabel))}</span>
            ${selection.invalid ? '<span class="slip-flag">No longer available — remove</span>' : ''}
          </div>
          <span class="slip-price">${Number(selection.price).toFixed(2)}</span>
          <button class="slip-remove" type="button" data-remove-match="${escapeHtml(selection.matchId)}" aria-label="Remove selection"><svg><use href="#icon-close"/></svg></button>
        </div>
      `).join('');
      list.querySelectorAll('[data-remove-match]').forEach(button => {
        button.addEventListener('click', () => removeSelection(button.dataset.removeMatch));
      });
    }
  }

  const stakeInput = document.getElementById('stakeInput');
  if (stakeInput && document.activeElement !== stakeInput) {
    stakeInput.value = String(state.betslip.stake);
  }

  const odds = combinedOdds();
  const stake = currentStake();
  setText('betslipOdds', hasItems ? odds.toFixed(2) : '1.00');
  setText('betslipReturn', formatCredits(hasItems ? stake * odds : 0));

  const placeButton = document.getElementById('placeBet');
  if (placeButton && !placeButton.classList.contains('loading')) {
    const valid = selections.filter(selection => !selection.invalid);
    const affordable = state.user.balance == null || stake <= state.user.balance;
    const ready = valid.length > 0 && stake >= 0.5 && affordable;
    placeButton.disabled = !ready;
    placeButton.textContent = !affordable && stake > 0
      ? 'Insufficient balance'
      : `Place ${valid.length > 1 ? 'accumulator' : 'bet'}`;
  }
}

function openBetslip() {
  if (state.betslip.selections.length === 0) return;
  state.betslipOpen = true;
  renderBetslip();
}

function closeBetslip() {
  state.betslipOpen = false;
  renderBetslip();
}

function openBetsDrawer() {
  state.betsOpen = true;
  const drawer = document.getElementById('betsDrawer');
  if (drawer) {
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
  }
  document.body.classList.add('drawer-open');
  renderBetsDrawer();
  refreshUser();
}

function closeBetsDrawer() {
  state.betsOpen = false;
  const drawer = document.getElementById('betsDrawer');
  if (drawer) {
    drawer.classList.remove('open');
    setTimeout(() => { if (!state.betsOpen) drawer.hidden = true; }, 220);
  }
  document.body.classList.remove('drawer-open');
}

function renderBetsDrawer() {
  const list = document.getElementById('betsList');
  if (!list) return;
  const bets = state.bets || [];
  if (bets.length === 0) {
    list.innerHTML = '<div class="bets-empty">No bets yet. Tap the odds on any match to place your first bet.</div>';
    return;
  }

  list.innerHTML = bets.map(bet => {
    const statusClass = bet.status === 'won' ? 'won' : bet.status === 'lost' ? 'lost' : 'open';
    const statusLabel = bet.status === 'won' ? 'Won' : bet.status === 'lost' ? 'Lost' : 'Open';
    const selections = (bet.selections || []).map(selection => `
      <div class="bet-sel ${selection.status || 'open'}">
        <span class="bet-sel-pick">${escapeHtml(cleanText(selection.pick))}</span>
        <small>${escapeHtml(cleanText(selection.matchLabel))}</small>
        <b>${Number(selection.price).toFixed(2)}</b>
      </div>`).join('');
    return `
      <article class="bet-card ${statusClass}">
        <header>
          <span class="bet-type">${escapeHtml(bet.type || 'Bet')}</span>
          <span class="bet-status ${statusClass}">${statusLabel}</span>
        </header>
        <div class="bet-sels">${selections}</div>
        <footer>
          <span>Stake<strong>${formatCredits(bet.stake)}</strong></span>
          <span>Odds<strong>${Number(bet.combinedOdds).toFixed(2)}</strong></span>
          <span>${bet.status === 'won' ? 'Returned' : 'To return'}<strong>${formatCredits(bet.potentialWin)}</strong></span>
        </footer>
      </article>`;
  }).join('');
}

function announceSettlements(previousBets, nextBets) {
  if (!Array.isArray(previousBets) || previousBets.length === 0) return;
  const previousStatus = new Map(previousBets.map(bet => [bet.id, bet.status]));
  for (const bet of nextBets) {
    const was = previousStatus.get(bet.id);
    if (was === 'open' && bet.status === 'won') {
      showToast('winner', 'trophy', 'Bet won', `You won ${formatCredits(bet.potentialWin)} credits`);
      triggerHaptic('success');
    } else if (was === 'open' && bet.status === 'lost') {
      showToast('', 'close', 'Bet settled', `${bet.type || 'Your bet'} did not win`);
    }
  }
}

async function refreshUser() {
  if (state.userRequestInFlight) return;
  state.userRequestInFlight = true;
  const id = state.user.id || getUserId();
  state.user.id = id;
  try {
    const response = await fetch(`/api/user/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;
    const data = await response.json();
    const previousBets = state.bets;
    state.user.balance = Number(data.balance);
    state.bets = Array.isArray(data.bets) ? data.bets : [];
    announceSettlements(previousBets, state.bets);
    renderWallet();
    if (state.betsOpen) renderBetsDrawer();
  } catch (_) {
    // Balance refresh is best-effort; the next poll retries.
  } finally {
    state.userRequestInFlight = false;
  }
}

async function placeBet() {
  const valid = state.betslip.selections.filter(selection => !selection.invalid);
  if (valid.length === 0) {
    showToast('', 'close', 'Bet slip empty', 'Add at least one available selection');
    return;
  }
  const stake = currentStake();
  if (stake < 0.5) {
    showToast('', 'close', 'Enter a stake', 'Minimum stake is 0.50 credits');
    return;
  }
  if (state.user.balance != null && stake > state.user.balance) {
    showToast('', 'close', 'Insufficient balance', 'Lower your stake to continue');
    return;
  }

  const button = document.getElementById('placeBet');
  if (button) { button.disabled = true; button.classList.add('loading'); }
  try {
    const response = await fetch('/api/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        userId: state.user.id || getUserId(),
        stake,
        selections: valid.map(selection => ({ matchId: selection.matchId, marketId: selection.marketId }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      showToast('', 'close', 'Bet not placed', data.error || 'Please try again');
      return;
    }
    state.user.balance = Number(data.balance);
    if (data.ticket) state.bets.unshift(data.ticket);
    state.betslip.selections = [];
    state.betslipOpen = false;
    renderWallet();
    renderMatches();
    showToast('winner', 'ticket', 'Bet placed', `${data.ticket.type} · ${formatCredits(data.ticket.stake)} CR at ${Number(data.ticket.combinedOdds).toFixed(2)}`);
    triggerHaptic('success');
  } catch (_) {
    showToast('', 'close', 'Bet not placed', 'Network error, please try again');
  } finally {
    if (button) button.classList.remove('loading');
    renderBetslip();
  }
}

function bindBettingEvents() {
  document.getElementById('walletChip')?.addEventListener('click', () => {
    if (state.betsOpen) closeBetsDrawer();
    else openBetsDrawer();
  });
  document.getElementById('betslipFab')?.addEventListener('click', openBetslip);
  document.getElementById('betslipClose')?.addEventListener('click', closeBetslip);
  document.getElementById('betslipClear')?.addEventListener('click', () => {
    state.betslip.selections = [];
    state.betslipOpen = false;
    renderBetslip();
    renderMatches();
  });
  document.getElementById('placeBet')?.addEventListener('click', placeBet);
  document.getElementById('betsClose')?.addEventListener('click', closeBetsDrawer);
  document.getElementById('betsBackdrop')?.addEventListener('click', closeBetsDrawer);

  const stakeInput = document.getElementById('stakeInput');
  stakeInput?.addEventListener('input', () => {
    const cleaned = stakeInput.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    if (cleaned !== stakeInput.value) stakeInput.value = cleaned;
    state.betslip.stake = cleaned;
    updateBetslipSummary();
  });

  document.querySelectorAll('[data-stake-add]').forEach(button => {
    button.addEventListener('click', () => {
      const add = Number(button.dataset.stakeAdd) || 0;
      state.betslip.stake = Math.round((currentStake() + add) * 100) / 100;
      renderBetslip();
    });
  });
  document.querySelector('[data-stake-set="max"]')?.addEventListener('click', () => {
    if (state.user.balance != null) {
      state.betslip.stake = Math.floor(state.user.balance * 100) / 100;
      renderBetslip();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (state.betsOpen) closeBetsDrawer();
    else if (state.betslipOpen) closeBetslip();
  });
}
