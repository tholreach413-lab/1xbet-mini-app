/* ==========================================================================
   1xBET OFFICIAL TELEGRAM MINI APP - JAVASCRIPT ENGINE
   ========================================================================== */

// --- TELEGRAM WEBAPP INITIALIZATION ---
const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
  } catch (e) {
    console.warn("Telegram WebApp API error:", e);
  }
}

// Haptic Feedback Helper
function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    try {
      if (type === 'light' || type === 'medium' || type === 'heavy') {
        tg.HapticFeedback.impactOccurred(type);
      } else if (type === 'success' || type === 'warning' || type === 'error') {
        tg.HapticFeedback.notificationOccurred(type);
      } else if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
      }
    } catch (e) {}
  }
}

// --- SOUND EFFECTS (Muted as requested) ---
class SoundManager {
  constructor() {
    this.muted = true;
  }
  init() {}
  playClick() {}
  playWin() {}
  playCrash() {}
}
const sounds = new SoundManager();

// --- GLOBAL STATE ---
const STATE = {
  user: {
    id: 9841295,
    name: "VIP Champion",
    username: "user_1xbet",
    balance: 1250.00,
    vipTier: "VIP PRO"
  },
  matches: [],
  currentTab: 'sports',
  currentSportFilter: 'all',
  liveScoreFilter: 'all',
  matchSearchQuery: '',
  showAllMatches: false,
  betslip: {
    type: 'single', // 'single' or 'accumulator'
    selections: [],
    stake: 10.00
  },
  betsHistory: [
    {
      id: "1X-98214",
      date: "Today, 21:15",
      type: "Single",
      match: "Arsenal vs Liverpool",
      pick: "Arsenal (1)",
      odds: 2.10,
      stake: 50.00,
      potentialReturn: 105.00,
      status: "open"
    },
    {
      id: "1X-89301",
      date: "Yesterday, 19:40",
      type: "Express (3 matches)",
      match: "Real Madrid, Bayern, PSG",
      pick: "3 Selections Combo",
      odds: 4.85,
      stake: 20.00,
      potentialReturn: 97.00,
      status: "won"
    }
  ],
  transactions: [
    { type: 'in', name: 'PayLink Bank Deposit', date: 'Oct 24, 2026', amount: 500.00 },
    { type: 'out', name: 'Crash Aviator Bet', date: 'Oct 24, 2026', amount: -25.00 },
    { type: 'in', name: 'Aviator Win (x4.20)', date: 'Oct 24, 2026', amount: 105.00 }
  ],
  slotBet: 5.00,
  jackpot: 88420.50
};

// Check Telegram user data
if (tg?.initDataUnsafe?.user) {
  const u = tg.initDataUnsafe.user;
  STATE.user.id = u.id;
  STATE.user.name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  STATE.user.username = u.username ? `@${u.username}` : `id:${u.id}`;
  const initials = (u.first_name?.[0] || '1') + (u.last_name?.[0] || 'X');
  const avatarEl = document.getElementById('userAvatarText');
  if (avatarEl) avatarEl.textContent = initials.toUpperCase();
}

// --- DYNAMIC REAL-TIME MATCHES & ODDS ENGINE (NO HARDCODED SETS) ---
async function loadLiveMatches() {
  try {
    const res = await fetch('/api/matches');
    const data = await res.json();
    if (data.matches && data.matches.length > 0) {
      STATE.matches = data.matches;
      renderMatches();
      renderLiveMatches();
      renderStreamChannelSelector();
    }
  } catch (err) {
    console.error("Error loading live matches from /api/matches:", err);
  }
}

// Auto-refresh live matches every 30 seconds
setInterval(loadLiveMatches, 30000);

// --- INITIAL RENDER & BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
  updateUserBalanceDisplay();
  loadLiveMatches();
  renderBetsHistory();
  renderTransactions();
  initHeroCarousel();
  initCrashEngine();
  startLiveOddsSimulation();
  initBakongDragListeners();
  initHorizontalScrollBars();
});

// Update Balance UI everywhere
function updateUserBalanceDisplay() {
  const formatted = STATE.user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const d1 = document.getElementById('userBalanceDisplay');
  const d2 = document.getElementById('cashierBalanceDisplay');
  const d3 = document.getElementById('slipBalanceAvail');
  if (d1) d1.textContent = formatted;
  if (d2) d2.textContent = formatted;
  if (d3) d3.textContent = formatted;
}

// --- TAB SWITCHING (With auto smooth scroll into view) ---
function switchTab(tabId) {
  triggerHaptic('selection');
  STATE.currentTab = tabId;

  // Update top nav & scroll active tab into view
  document.querySelectorAll('.cat-tab').forEach(b => {
    const isActive = b.getAttribute('data-tab') === tabId;
    b.classList.toggle('active', isActive);
    if (isActive) {
      b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
  // Update bottom nav
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.remove('active');
  });
  const target = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (target) {
    target.classList.add('active');
  }

  // Auto scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- SPORT FILTERING (With auto smooth scroll into view) ---
function filterSport(sport) {
  triggerHaptic('light');
  STATE.currentSportFilter = sport;
  document.querySelectorAll('.filter-chip').forEach(c => {
    const isActive = c.getAttribute('data-sport') === sport;
    c.classList.toggle('active', isActive);
    if (isActive) {
      c.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  // When clicking Mobile Legends, show all MLBB matches across all leagues
  if (sport === 'mlbb') {
    STATE.liveScoreFilter = 'all';
    document.querySelectorAll('.ls-ribbon-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
    });
  }

  renderMatches();
}

// --- LIVESCORE TOOLBAR & FILTER HANDLERS ---
function setLiveScoreFilter(filter) {
  triggerHaptic('selection');
  STATE.liveScoreFilter = filter;
  STATE.visibleMatchCount = 15; // Reset pagination to initial 15 matches on filter switch

  document.querySelectorAll('.ls-ribbon-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-filter') === filter;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  renderMatches();
}

function onMatchSearchInput(val) {
  STATE.matchSearchQuery = (val || '').trim().toLowerCase();
  STATE.visibleMatchCount = 15;
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) clearBtn.style.display = STATE.matchSearchQuery ? 'inline-block' : 'none';
  renderMatches();
}

function clearMatchSearch() {
  const input = document.getElementById('matchLiveSearchInput');
  if (input) input.value = '';
  STATE.matchSearchQuery = '';
  STATE.visibleMatchCount = 15;
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  renderMatches();
}

function loadMoreMatches() {
  triggerHaptic('light');
  STATE.visibleMatchCount = (STATE.visibleMatchCount || 15) + 15;
  renderMatches();
}

// --- FOOTBALL SEARCH NORMALIZER & ALIAS DICTIONARY ---
const FOOTBALL_ALIASES = {
  'psg': 'paris saint germain',
  'paris': 'paris',
  'barca': 'barcelona',
  'barça': 'barcelona',
  'real': 'real madrid',
  'madrid': 'madrid',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'man u': 'manchester united',
  'man city': 'manchester city',
  'city': 'manchester city',
  'spurs': 'tottenham',
  'tottenham': 'tottenham',
  'arsenal': 'arsenal',
  'gunners': 'arsenal',
  'chelsea': 'chelsea',
  'blues': 'chelsea',
  'liverpool': 'liverpool',
  'reds': 'liverpool',
  'bayern': 'bayern munich',
  'bvb': 'borussia dortmund',
  'dortmund': 'borussia dortmund',
  'juve': 'juventus',
  'juventus': 'juventus',
  'inter': 'inter',
  'milan': 'milan',
  'ac milan': 'ac milan',
  'atleti': 'atletico madrid',
  'atletico': 'atletico madrid',
  'wolves': 'wolverhampton',
  'roma': 'as roma',
  'napoli': 'napoli',

  // Mobile Legends (MLBB) Aliases
  'mlbb': 'mobile legends',
  'mobile legend': 'mobile legends',
  'mobile legends': 'mobile legends',
  'mpl': 'mpl',
  'rrq': 'rrq hoshi',
  'onic': 'fnatic onic',
  'fnatic': 'fnatic onic',
  'bren': 'falcons ap bren',
  'ap bren': 'falcons ap bren',
  'liquid': 'team liquid',
  'tlph': 'team liquid ph',
  'aurora': 'aurora gaming',
  'blacklist': 'blacklist international',
  'evos': 'evos glory',
  'bigetron': 'bigetron alpha',
  'geek': 'geek fam',
  'alter ego': 'alter ego',
  'cfu': 'cfu gaming',
  'see you soon': 'see you soon',
  'sys': 'see you soon',
  'flash': 'team flash',
  'srg': 'selangor red giants',
  'vamos': 'team vamos'
};

function normalizeFootballText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_.,\/#!$%\^&\*;:{}=\`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSearchQuery(m, rawQuery) {
  const normQ = normalizeFootballText(rawQuery);
  if (!normQ) return true;

  const target = normalizeFootballText([
    m.homeTeam,
    m.awayTeam,
    m.league,
    m.country,
    m.rawLeague,
    m.sport,
    m.sportName,
    m.sportSub
  ].join(' '));

  // Direct substring check
  if (target.includes(normQ)) return true;

  // Check alias expansion
  const expanded = FOOTBALL_ALIASES[normQ];
  if (expanded && target.includes(expanded)) return true;

  // Token matching: all tokens in query must match
  const tokens = normQ.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const allTokensMatch = tokens.every(token => target.includes(token));
    if (allTokensMatch) return true;
  }

  // Token check for expanded query
  if (expanded) {
    const expTokens = expanded.split(' ').filter(Boolean);
    if (expTokens.every(token => target.includes(token))) return true;
  }

  return false;
}

function getTeamAvatarFallback(name) {
  const safeName = (name || 'FC').trim();
  const parts = safeName.split(' ').filter(Boolean);
  const initials = parts.length > 1 
    ? (parts[0][0] + parts[1][0]).toUpperCase() 
    : safeName.slice(0, 2).toUpperCase();
  return `<span class="team-avatar-fallback">${initials}</span>`;
}

// --- LIVESCORE MATCH RENDERING ENGINE ---
function renderMatches() {
  const container = document.getElementById('matchesContainer');
  if (!container) return;
  const viewMoreBox = document.getElementById('viewMoreContainer');

  const matches = STATE.matches || [];
  if (matches.length === 0) {
    if (viewMoreBox) viewMoreBox.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state">
        <div class="stream-spinner" style="margin: 0 auto 12px;"></div>
        <div>Loading real-time matches from LiveScore...</div>
      </div>
    `;
    return;
  }

  // Update Top Live Counter Badge
  const liveCount = matches.filter(m => m.isLive).length;
  const counterTxt = document.getElementById('liveCounterText');
  if (counterTxt) counterTxt.textContent = `${liveCount} LIVE NOW`;

  // Filter logic: If searching, search across ALL 2,500+ matches globally!
  let filtered = [];
  const searchQuery = (STATE.matchSearchQuery || '').trim();
  const isSearching = Boolean(searchQuery);

  if (isSearching) {
    filtered = matches.filter(m => matchSearchQuery(m, searchQuery));
  } else {
    // Sport filter (Supports football, basketball, tennis, mlbb Mobile Legends, esports)
    if (STATE.currentSportFilter === 'all') {
      filtered = matches;
    } else if (STATE.currentSportFilter === 'mlbb') {
      filtered = matches.filter(m => m.sport === 'mlbb');
    } else if (STATE.currentSportFilter === 'esports') {
      filtered = matches.filter(m => m.sport === 'esports' || m.sport === 'mlbb');
    } else {
      filtered = matches.filter(m => m.sport === STATE.currentSportFilter);
    }

    // LiveScore Category / Date filter
    const lsFilter = STATE.liveScoreFilter || 'all';
    if (lsFilter === 'live') {
      filtered = filtered.filter(m => m.isLive);
    } else if (lsFilter === 'top') {
      filtered = filtered.filter(m => m.isTop || m.isLive);
    } else if (lsFilter === 'today') {
      filtered = filtered.filter(m => m.day === 'Today' || m.isLive);
    } else if (lsFilter === 'tomorrow') {
      filtered = filtered.filter(m => m.day === 'Tomorrow');
    } else if (lsFilter === 'upcoming') {
      filtered = filtered.filter(m => m.day === 'Upcoming' || (m.day !== 'Today' && m.day !== 'Tomorrow' && m.day !== 'Yesterday' && !m.isLive && !m.isFinished));
    }
  }

  // Smooth Pagination:
  // When searching: show all matches found (up to 150) so search results are never hidden
  // When browsing: show 15 matches at a time to prevent DOM lag
  const defaultBatch = 15;
  const visibleLimit = isSearching ? 150 : (STATE.visibleMatchCount || defaultBatch);
  const displayList = filtered.slice(0, visibleLimit);

  // Update View More Container & Progress
  const btnMore = document.getElementById('btnViewMoreMatches');
  const btnMoreText = document.getElementById('btnViewMoreText');
  const progressText = document.getElementById('matchesProgressText');

  if (viewMoreBox) {
    if (isSearching || filtered.length <= defaultBatch) {
      viewMoreBox.style.display = 'none';
    } else {
      viewMoreBox.style.display = 'block';
      if (progressText) {
        progressText.textContent = `Showing ${displayList.length} of ${filtered.length} matches`;
      }
      if (displayList.length >= filtered.length) {
        if (btnMore) btnMore.disabled = true;
        if (btnMoreText) btnMoreText.textContent = `All ${filtered.length} Matches Shown`;
      } else {
        if (btnMore) btnMore.disabled = false;
        const remaining = filtered.length - displayList.length;
        const nextBatch = Math.min(defaultBatch, remaining);
        if (btnMoreText) btnMoreText.textContent = `View More (+${nextBatch} Matches)`;
      }
    }
  }

  if (displayList.length === 0) {
    if (viewMoreBox) viewMoreBox.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div>No matches found for "${STATE.matchSearchQuery}". Try another team name like "Paris", "Barcelona", or "Real Madrid"!</div>
      </div>
    `;
    return;
  }

  // LiveScore Search Header (Shows matched teams and result stats like LiveScore)
  let searchHeaderHTML = '';
  if (isSearching) {
    const matchingTeams = new Map();
    for (const m of filtered) {
      const qNorm = normalizeFootballText(searchQuery);
      if (normalizeFootballText(m.homeTeam).includes(qNorm)) {
        if (!matchingTeams.has(m.homeTeam)) {
          matchingTeams.set(m.homeTeam, { name: m.homeTeam, logo: m.homeLogo, country: m.country });
        }
      }
      if (normalizeFootballText(m.awayTeam).includes(qNorm)) {
        if (!matchingTeams.has(m.awayTeam)) {
          matchingTeams.set(m.awayTeam, { name: m.awayTeam, logo: m.awayLogo, country: m.country });
        }
      }
    }

    searchHeaderHTML = `
      <div class="ls-search-results-banner">
        <div class="ls-search-results-count">
          <span>Results for <strong>"${STATE.matchSearchQuery}"</strong></span>
          <span class="ls-badge-count">${filtered.length} matches</span>
        </div>
        ${matchingTeams.size > 0 ? `
          <div class="ls-matched-teams-strip">
            <span class="ls-matched-label">TEAMS:</span>
            ${Array.from(matchingTeams.values()).slice(0, 4).map(t => `
              <div class="ls-matched-team-pill" onclick="onMatchSearchInput('${t.name.replace(/'/g, "\\'")}')">
                ${t.logo ? `<img src="${t.logo}" class="ls-pill-crest" alt="${t.name}">` : ''}
                <span>${t.name}</span>
                ${t.country ? `<small>(${t.country})</small>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  // 3. Group Matches by League (Authentic LiveScore App Layout)
  const leaguesMap = new Map();
  for (const m of displayList) {
    const leagueKey = m.league || 'Other Matches';
    if (!leaguesMap.has(leagueKey)) {
      leaguesMap.set(leagueKey, {
        name: m.rawLeague || m.league,
        country: m.country || '',
        icon: m.leagueIcon || '',
        matches: []
      });
    }
    leaguesMap.get(leagueKey).matches.push(m);
  }

  let html = searchHeaderHTML;
  for (const [leagueKey, group] of leaguesMap.entries()) {
    html += `
      <div class="ls-league-card">
        <div class="ls-league-header">
          <div class="ls-league-info">
            <span class="ls-league-flag">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20"/></svg>
            </span>
            <div class="ls-league-titles">
              <span class="ls-league-name">${group.name}</span>
              ${group.country ? `<span class="ls-league-country">${group.country}</span>` : ''}
            </div>
          </div>
          <span class="ls-league-arrow">›</span>
        </div>
        <div class="ls-matches-list">
          ${group.matches.map(m => generateMatchCardHTML(m)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderLiveMatches() {
  const container = document.getElementById('liveMatchesContainer');
  if (!container) return;
  const matches = STATE.matches || [];
  const liveList = matches.filter(m => m.isLive);
  if (liveList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
        </div>
        <div>No live in-play matches right now. Check back soon or view upcoming games!</div>
      </div>
    `;
    return;
  }

  // Group by league
  const leaguesMap = new Map();
  for (const m of liveList) {
    const leagueKey = m.league || 'Other Matches';
    if (!leaguesMap.has(leagueKey)) {
      leaguesMap.set(leagueKey, {
        name: m.rawLeague || m.league,
        country: m.country || '',
        matches: []
      });
    }
    leaguesMap.get(leagueKey).matches.push(m);
  }

  let html = '';
  for (const [leagueKey, group] of leaguesMap.entries()) {
    html += `
      <div class="ls-league-card">
        <div class="ls-league-header">
          <div class="ls-league-info">
            <span class="ls-league-flag"><span class="pulsing-dot-orange" style="display:inline-block;margin:0;"></span></span>
            <div class="ls-league-titles">
              <span class="ls-league-name">${group.name}</span>
              ${group.country ? `<span class="ls-league-country">${group.country}</span>` : ''}
            </div>
          </div>
          <span class="ls-league-arrow">›</span>
        </div>
        <div class="ls-matches-list">
          ${group.matches.map(m => generateMatchCardHTML(m)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function generateMatchCardHTML(m) {
  const isSelected = (pickType) => {
    return STATE.betslip.selections.some(s => s.matchId === m.id && s.pickType === pickType);
  };

  const fallbackHome = getTeamAvatarFallback(m.homeTeam).replace(/"/g, '&quot;');
  const fallbackAway = getTeamAvatarFallback(m.awayTeam).replace(/"/g, '&quot;');

  const homeLogoHTML = m.homeLogo 
    ? `<img src="${m.homeLogo}" class="ls-crest" alt="${m.homeTeam}" loading="lazy" onerror="this.outerHTML='${fallbackHome}'">` 
    : getTeamAvatarFallback(m.homeTeam);

  const awayLogoHTML = m.awayLogo 
    ? `<img src="${m.awayLogo}" class="ls-crest" alt="${m.awayTeam}" loading="lazy" onerror="this.outerHTML='${fallbackAway}'">` 
    : getTeamAvatarFallback(m.awayTeam);

  // LiveScore time & score pill (Exact LiveScore formatting)
  let liveScoreTimeHTML = '';
  if (m.isLive) {
    liveScoreTimeHTML = `
      <div class="ls-score-cell live">
        <span class="ls-live-clock"><span class="pulsing-dot-orange"></span> ${m.time}</span>
        <span class="ls-score-digits">${m.homeScore ?? 0} - ${m.awayScore ?? 0}</span>
      </div>`;
  } else if (m.isFinished) {
    liveScoreTimeHTML = `
      <div class="ls-score-cell finished">
        <span class="ls-match-status ft">FT</span>
        <span class="ls-score-digits ft">${m.homeScore ?? 0} - ${m.awayScore ?? 0}</span>
      </div>`;
  } else {
    // Upcoming match: show real kickoff time (e.g. 02:30, 21:00) with date tag!
    let subDate = '';
    if (m.day === 'Tomorrow') {
      subDate = 'Tmr';
    } else if (m.dateStr) {
      subDate = m.dateStr;
    } else if (m.day && m.day !== 'Today') {
      subDate = m.day;
    }
    liveScoreTimeHTML = `
      <div class="ls-score-cell upcoming">
        <span class="ls-match-time">${m.time}</span>
        ${subDate ? `<span class="ls-match-subdate">${subDate}</span>` : ''}
      </div>`;
  }

  return `
    <div class="ls-match-row ${m.isLive ? 'is-live-row' : ''}" id="card_${m.id}">
      <!-- Live Orange Left Minute Box if live -->
      ${m.isLive ? `<div class="ls-live-side-pill">${m.time}</div>` : ''}
      
      <!-- Team vs Team Center Row (Exact LiveScore Layout) -->
      <div class="ls-match-core">
        <div class="ls-team-box home">
          <span class="ls-team-name">${m.homeTeam}</span>
          ${homeLogoHTML}
        </div>
        ${liveScoreTimeHTML}
        <div class="ls-team-box away">
          ${awayLogoHTML}
          <span class="ls-team-name">${m.awayTeam}</span>
        </div>
        <button class="ls-star-fav" onclick="this.classList.toggle('fav-active')" title="Favorite">
          <svg class="star-icon-svg" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>

      <!-- 1xBet Quick Betting Odds Strip -->
      <div class="ls-odds-strip">
        <button class="ls-odd-btn ${isSelected('1') ? 'selected' : ''}" id="odd_${m.id}_1" onclick="toggleOddSelection('${m.id}', '1', 'Home (${m.homeTeam})', ${m.odds.home})">
          <span class="lbl">1</span>
          <span class="val">${m.odds.home.toFixed(2)}</span>
        </button>
        ${m.odds.draw > 0 ? `
          <button class="ls-odd-btn ${isSelected('X') ? 'selected' : ''}" id="odd_${m.id}_X" onclick="toggleOddSelection('${m.id}', 'X', 'Draw (X)', ${m.odds.draw})">
            <span class="lbl">X</span>
            <span class="val">${m.odds.draw.toFixed(2)}</span>
          </button>
        ` : `
          <button class="ls-odd-btn disabled" disabled>
            <span class="lbl">-</span>
            <span class="val">-</span>
          </button>
        `}
        <button class="ls-odd-btn ${isSelected('2') ? 'selected' : ''}" id="odd_${m.id}_2" onclick="toggleOddSelection('${m.id}', '2', 'Away (${m.awayTeam})', ${m.odds.away})">
          <span class="lbl">2</span>
          <span class="val">${m.odds.away.toFixed(2)}</span>
        </button>
      </div>
    </div>
  `;
}

// --- LIVE ODDS SIMULATION (Fluctuates realistic 1xBet odds) ---
function startLiveOddsSimulation() {
  setInterval(() => {
    const liveMatches = (STATE.matches || []).filter(m => m.isLive);
    if (!liveMatches.length) return;
    const randomMatch = liveMatches[Math.floor(Math.random() * liveMatches.length)];
    const delta = (Math.random() > 0.5 ? 1 : -1) * 0.05;

    randomMatch.odds.home = Math.max(1.05, +(randomMatch.odds.home + delta).toFixed(2));
    const el = document.getElementById(`val_${randomMatch.id}_home`);
    if (el) {
      el.textContent = randomMatch.odds.home.toFixed(2);
      el.classList.add(delta > 0 ? 'odd-up' : 'odd-down');
      setTimeout(() => el.classList.remove('odd-up', 'odd-down'), 800);
    }
  }, 4500);
}

// --- BETSLIP ENGINE ---
function toggleOddSelection(matchId, pickType, pickName, odds) {
  triggerHaptic('selection');
  sounds.playClick();

  const match = (STATE.matches || []).find(m => m.id === matchId);
  if (!match) return;

  const existingIndex = STATE.betslip.selections.findIndex(s => s.matchId === matchId && s.pickType === pickType);
  if (existingIndex > -1) {
    // Remove if clicked again
    STATE.betslip.selections.splice(existingIndex, 1);
  } else {
    // If same match has another pick, replace it
    const sameMatchIndex = STATE.betslip.selections.findIndex(s => s.matchId === matchId);
    if (sameMatchIndex > -1) {
      STATE.betslip.selections.splice(sameMatchIndex, 1);
    }
    STATE.betslip.selections.push({
      matchId,
      matchName: `${match.homeTeam} vs ${match.awayTeam}`,
      pickType,
      pickName,
      odds
    });
  }

  // If 2+ selections, automatically suggest Accumulator mode
  if (STATE.betslip.selections.length >= 2) {
    STATE.betslip.type = 'accumulator';
  } else {
    STATE.betslip.type = 'single';
  }

  updateBetslipUI();
  updateOddsButtonsState(matchId);
}

function updateOddsButtonsState(matchId) {
  const cards = document.querySelectorAll(`[id="card_${matchId}"]`);
  cards.forEach(card => {
    card.querySelectorAll('.ls-odd-btn').forEach(b => b.classList.remove('selected'));
    const sel = STATE.betslip.selections.find(s => s.matchId === matchId);
    if (sel) {
      const targetBtn = card.querySelector(`[id="odd_${matchId}_${sel.pickType}"]`);
      if (targetBtn) targetBtn.classList.add('selected');
    }
  });
}

function updateBetslipUI() {
  const count = STATE.betslip.selections.length;
  const bar = document.getElementById('floatingSlipBar');
  const badge = document.getElementById('slipBadgeCount');
  const barOdds = document.getElementById('slipBarOdds');

  if (count > 0) {
    bar.classList.add('visible');
    badge.textContent = count;
  } else {
    bar.classList.remove('visible');
    toggleBetslipModal(false);
  }

  // Calculate total odds
  let totalOdds = 1.0;
  if (STATE.betslip.type === 'accumulator') {
    totalOdds = STATE.betslip.selections.reduce((acc, curr) => acc * curr.odds, 1);
  } else {
    totalOdds = STATE.betslip.selections.length > 0 ? STATE.betslip.selections[0].odds : 1.0;
  }
  barOdds.textContent = `Total Odds: ${totalOdds.toFixed(2)}`;

  updateBetslipModalContent(totalOdds);
}

function updateBetslipModalContent(totalOdds) {
  const list = document.getElementById('slipSelectionsList');
  if (!list) return;

  if (STATE.betslip.selections.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg>
      </div>
      No selections added yet.<br>Click any odd to build your bet!
    </div>`;
  } else {
    list.innerHTML = STATE.betslip.selections.map((s, idx) => `
      <div class="slip-item">
        <button class="btn-remove-slip-item" onclick="removeSelection(${idx})">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="slip-match-name">${s.matchName}</div>
        <div class="slip-pick-row">
          <span class="slip-pick-name">${s.pickName}</span>
          <span class="slip-pick-odds">${s.odds.toFixed(2)}</span>
        </div>
      </div>
    `).join('');
  }

  // Update tabs
  document.getElementById('tabTypeSingle')?.classList.toggle('active', STATE.betslip.type === 'single');
  document.getElementById('tabTypeExpress')?.classList.toggle('active', STATE.betslip.type === 'accumulator');
  const typeLabel = document.getElementById('slipTypeLabel');
  if (typeLabel) typeLabel.textContent = STATE.betslip.type === 'accumulator' ? 'EXPRESS ACCUMULATOR' : 'SINGLE';

  updateBetslipCalculations();
}

function updateBetslipCalculations() {
  const stakeInput = document.getElementById('betSlipStakeInput');
  const stake = parseFloat(stakeInput?.value) || 0;
  STATE.betslip.stake = stake;

  let totalOdds = 1.0;
  if (STATE.betslip.type === 'accumulator') {
    totalOdds = STATE.betslip.selections.reduce((acc, curr) => acc * curr.odds, 1);
  } else {
    totalOdds = STATE.betslip.selections.length > 0 ? STATE.betslip.selections[0].odds : 1.0;
  }

  const bonusRow = document.getElementById('expressBonusRow');
  const bonusEl = document.getElementById('calcExpressBonus');
  let bonusMultiplier = 0;

  // 1xBet Accumulator Bonus: 3+ picks gives +10% bonus
  if (STATE.betslip.type === 'accumulator' && STATE.betslip.selections.length >= 3) {
    bonusMultiplier = 0.10;
    if (bonusRow) bonusRow.style.display = 'flex';
  } else {
    if (bonusRow) bonusRow.style.display = 'none';
  }

  const baseWin = stake * totalOdds;
  const bonusAmt = baseWin * bonusMultiplier;
  const finalWin = baseWin + bonusAmt;

  if (bonusEl) bonusEl.textContent = `+$${bonusAmt.toFixed(2)}`;
  document.getElementById('calcTotalOdds').textContent = totalOdds.toFixed(2);
  document.getElementById('calcPotentialWin').textContent = `$${finalWin.toFixed(2)}`;
  document.getElementById('placeBetText').textContent = `PLACE BET ($${stake.toFixed(2)})`;
}

function removeSelection(idx) {
  STATE.betslip.selections.splice(idx, 1);
  if (STATE.betslip.selections.length < 2) {
    STATE.betslip.type = 'single';
  }
  updateBetslipUI();
  renderMatches();
  renderLiveMatches();
}

function clearBetslip() {
  triggerHaptic('light');
  STATE.betslip.selections = [];
  updateBetslipUI();
  renderMatches();
  renderLiveMatches();
}

function toggleBetslipModal(open) {
  triggerHaptic('selection');
  const modal = document.getElementById('betslipModal');
  if (modal) modal.classList.toggle('active', open);
}

function setSlipType(type) {
  triggerHaptic('light');
  STATE.betslip.type = type;
  updateBetslipUI();
}

function addStake(amt) {
  triggerHaptic('light');
  const input = document.getElementById('betSlipStakeInput');
  if (input) {
    input.value = (parseFloat(input.value || 0) + amt).toFixed(0);
    updateBetslipCalculations();
  }
}

function setStakeMax() {
  triggerHaptic('medium');
  const input = document.getElementById('betSlipStakeInput');
  if (input) {
    input.value = Math.floor(STATE.user.balance);
    updateBetslipCalculations();
  }
}

// Load 1xBet's Accumulator of the Day Promo
function loadExpressOfDay() {
  triggerHaptic('medium');
  sounds.playClick();
  const topMatches = (STATE.matches || []).slice(0, 3);
  if (topMatches.length === 0) {
    showToast("Loading matches, please wait...", "warning");
    return;
  }
  STATE.betslip.selections = topMatches.map(m => ({
    matchId: m.id,
    matchName: `${m.homeTeam} vs ${m.awayTeam}`,
    pickType: '1',
    pickName: `${m.homeTeam} (1)`,
    odds: m.odds.home
  }));
  STATE.betslip.type = 'accumulator';
  updateBetslipUI();
  toggleBetslipModal(true);
  showToast("Accumulator of the Day loaded with +10% bonus!");
}

// Submit Bet
function submitBetSlip() {
  const stake = parseFloat(document.getElementById('betSlipStakeInput').value) || 0;
  if (STATE.betslip.selections.length === 0) {
    showToast("Please select at least 1 match odd!", "warning");
    return;
  }
  if (stake <= 0) {
    showToast("Enter a valid stake amount!", "warning");
    return;
  }
  if (stake > STATE.user.balance) {
    triggerHaptic('error');
    showToast("Insufficient balance! Tap Deposit to add funds.", "warning");
    openDepositModal();
    return;
  }

  // Deduct stake
  STATE.user.balance -= stake;
  updateUserBalanceDisplay();

  const totalOdds = STATE.betslip.type === 'accumulator'
    ? STATE.betslip.selections.reduce((acc, c) => acc * c.odds, 1)
    : STATE.betslip.selections[0].odds;

  const isCombo = STATE.betslip.type === 'accumulator';
  const bonus = (isCombo && STATE.betslip.selections.length >= 3) ? 0.10 : 0;
  const potWin = (stake * totalOdds) * (1 + bonus);

  const newBet = {
    id: `1X-${Math.floor(10000 + Math.random() * 90000)}`,
    date: "Just now",
    type: isCombo ? `Express (${STATE.betslip.selections.length} events)` : `Single`,
    match: STATE.betslip.selections.map(s => s.matchName).join(" • "),
    pick: STATE.betslip.selections.map(s => s.pickName).join(", "),
    odds: totalOdds,
    stake: stake,
    potentialReturn: potWin,
    status: "open"
  };

  STATE.betsHistory.unshift(newBet);
  renderBetsHistory();

  // Clear slip & close
  clearBetslip();
  toggleBetslipModal(false);

  triggerHaptic('success');
  sounds.playWin();
  showToast(`Bet Placed: $${stake.toFixed(2)} on Ticket ${newBet.id}!`);

  // Simulate automatic winning resolution after 18 seconds for demo thrill
  setTimeout(() => {
    if (newBet.status === 'open') {
      newBet.status = 'won';
      STATE.user.balance += newBet.potentialReturn;
      updateUserBalanceDisplay();
      renderBetsHistory();
      triggerHaptic('success');
      sounds.playWin();
      showToast(`CONGRATULATIONS! Ticket ${newBet.id} WON $${newBet.potentialReturn.toFixed(2)}!`);
    }
  }, 18000);
}

// --- MY BETS & HISTORY ---
function renderBetsHistory(filter = 'all') {
  const container = document.getElementById('betsHistoryList');
  if (!container) return;

  const totalCount = STATE.betsHistory.length;
  const openCount = STATE.betsHistory.filter(b => b.status === 'open').length;
  const wonCount = STATE.betsHistory.filter(b => b.status === 'won').length;

  document.getElementById('totalBetsCount').textContent = totalCount;
  document.getElementById('openBetsCount').textContent = openCount;
  document.getElementById('wonBetsCount').textContent = wonCount;

  const list = filter === 'all'
    ? STATE.betsHistory
    : STATE.betsHistory.filter(b => b.status === filter);

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      No ${filter} bets found.
    </div>`;
    return;
  }

  container.innerHTML = list.map(b => `
    <div class="bet-ticket-card">
      <div class="bet-ticket-header">
        <span class="ticket-id">Ticket: ${b.id}</span>
        <span class="ticket-status ${b.status}">${b.status.toUpperCase()}</span>
      </div>
      <div class="ticket-pick-title">${b.type}</div>
      <div class="ticket-pick-details">${b.pick}</div>
      <div class="ticket-numbers-row">
        <span>Stake: <strong>$${b.stake.toFixed(2)}</strong></span>
        <span>Odds: <strong style="color:var(--1x-gold)">${b.odds.toFixed(2)}</strong></span>
        <span>Est. Return: <strong style="color:var(--1x-green)">$${b.potentialReturn.toFixed(2)}</strong></span>
      </div>
    </div>
  `).join('');
}

function filterBetsHistory(filter) {
  triggerHaptic('light');
  document.querySelectorAll('.hist-pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  renderBetsHistory(filter);
}

// --- 1xCRASH (AVIATOR GAME ENGINE) ---
let crashState = {
  phase: 'waiting', // 'waiting', 'flying', 'crashed'
  multiplier: 1.00,
  crashPoint: 2.45,
  userBet: null, // { stake, autoCashout, cashedOut: false }
  waitingTimer: 5,
  flightStartTime: 0
};

const crashCanvas = document.getElementById('crashCanvas');
const crashCtx = crashCanvas?.getContext('2d');

function initCrashEngine() {
  if (!crashCanvas || !crashCtx) return;
  startCrashWaiting();
  requestAnimationFrame(crashRenderLoop);
}

function startCrashWaiting() {
  crashState.phase = 'waiting';
  crashState.multiplier = 1.00;
  crashState.waitingTimer = 4;
  crashState.crashPoint = generateCrashPoint();

  const statusEl = document.getElementById('crashStatus');
  const multEl = document.getElementById('crashMultiplier');
  const previewEl = document.getElementById('crashPayoutPreview');
  multEl.classList.remove('crashed');
  multEl.textContent = "1.00x";
  previewEl.textContent = "";

  updateCrashActionButton();
  generateSimulatedFlyers();

  const interval = setInterval(() => {
    crashState.waitingTimer--;
    if (crashState.waitingTimer > 0) {
      statusEl.textContent = `WAITING FOR NEXT ROUND (${crashState.waitingTimer}s)...`;
    } else {
      clearInterval(interval);
      startCrashFlight();
    }
  }, 1000);
}

function generateCrashPoint() {
  // Realistic crash curve: 10% instant crash (< 1.20x), 60% mid range (1.20 - 3.50x), 30% high (up to 30x)
  const rand = Math.random();
  if (rand < 0.10) return +(1.05 + Math.random() * 0.15).toFixed(2);
  if (rand < 0.70) return +(1.25 + Math.random() * 2.50).toFixed(2);
  return +(3.50 + Math.random() * 18.0).toFixed(2);
}

function startCrashFlight() {
  crashState.phase = 'flying';
  crashState.flightStartTime = Date.now();
  const statusEl = document.getElementById('crashStatus');
  statusEl.textContent = "AIRPLANE IN FLIGHT...";
  updateCrashActionButton();
}

function crashFlight() {
  crashState.phase = 'crashed';
  triggerHaptic('error');
  sounds.playCrash();

  const multEl = document.getElementById('crashMultiplier');
  const statusEl = document.getElementById('crashStatus');
  multEl.classList.add('crashed');
  multEl.textContent = `${crashState.crashPoint.toFixed(2)}x`;
  statusEl.textContent = "FLEW AWAY!";

  // Record into history pills
  addCrashHistory(crashState.crashPoint);

  // If user didn't cash out, bet is lost
  if (crashState.userBet && !crashState.userBet.cashedOut) {
    showToast(`Plane crashed at ${crashState.crashPoint.toFixed(2)}x! Bet lost.`, 'warning');
    crashState.userBet = null;
  }

  updateCrashActionButton();

  // Schedule next round
  setTimeout(() => {
    startCrashWaiting();
  }, 3000);
}

function addCrashHistory(mult) {
  const bar = document.getElementById('historyPills');
  if (!bar) return;
  const pill = document.createElement('span');
  let color = 'blue';
  if (mult >= 2.0) color = 'purple';
  if (mult >= 10.0) color = 'gold';
  pill.className = `pill ${color}`;
  pill.textContent = `${mult.toFixed(2)}x`;
  bar.prepend(pill);
  if (bar.children.length > 8) {
    bar.removeChild(bar.lastChild);
  }
}

// Crash Canvas Animation Loop
function crashRenderLoop() {
  if (!crashCanvas || !crashCtx) return;
  const w = crashCanvas.width;
  const h = crashCanvas.height;

  crashCtx.clearRect(0, 0, w, h);

  // Draw background grid lines
  crashCtx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  crashCtx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    crashCtx.beginPath();
    crashCtx.moveTo(x, 0);
    crashCtx.lineTo(x, h);
    crashCtx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    crashCtx.beginPath();
    crashCtx.moveTo(0, y);
    crashCtx.lineTo(w, y);
    crashCtx.stroke();
  }

  if (crashState.phase === 'flying') {
    const elapsedSec = (Date.now() - crashState.flightStartTime) / 1000;
    // Multiplier grows exponentially
    crashState.multiplier = +(1.0 + Math.pow(elapsedSec, 1.35) * 0.45).toFixed(2);

    const multEl = document.getElementById('crashMultiplier');
    if (multEl) multEl.textContent = `${crashState.multiplier.toFixed(2)}x`;

    // Check user auto cashout
    if (crashState.userBet && !crashState.userBet.cashedOut) {
      const liveWin = crashState.userBet.stake * crashState.multiplier;
      const preview = document.getElementById('crashPayoutPreview');
      if (preview) preview.textContent = `Current Win: +$${liveWin.toFixed(2)}`;

      const autoToggle = document.getElementById('autoCashoutToggle');
      const autoVal = parseFloat(document.getElementById('autoCashoutVal')?.value) || 0;
      if (autoToggle?.checked && autoVal > 1.0 && crashState.multiplier >= autoVal) {
        cashoutCrashBet();
      }
    }

    // Check crash
    if (crashState.multiplier >= crashState.crashPoint) {
      crashFlight();
    } else {
      drawTrajectory(w, h, elapsedSec);
    }
  } else if (crashState.phase === 'crashed') {
    drawCrashedTrajectory(w, h);
  } else {
    // Waiting state idle line
    crashCtx.beginPath();
    crashCtx.strokeStyle = "rgba(0, 210, 255, 0.3)";
    crashCtx.lineWidth = 2;
    crashCtx.moveTo(20, h - 30);
    crashCtx.lineTo(60, h - 30);
    crashCtx.stroke();
  }

  requestAnimationFrame(crashRenderLoop);
}

function drawTrajectory(w, h, t) {
  const startX = 20;
  const startY = h - 30;
  const maxT = 8;
  const progress = Math.min(t / maxT, 1);
  const endX = startX + progress * (w - 70);
  const endY = startY - Math.pow(progress, 1.4) * (h - 60);

  // Gradient fill under curve
  const grad = crashCtx.createLinearGradient(0, endY, 0, startY);
  grad.addColorStop(0, "rgba(255, 51, 102, 0.35)");
  grad.addColorStop(1, "rgba(0, 210, 255, 0.0)");

  crashCtx.beginPath();
  crashCtx.moveTo(startX, startY);
  crashCtx.quadraticCurveTo(startX + (endX - startX) * 0.5, startY, endX, endY);
  crashCtx.lineTo(endX, startY);
  crashCtx.closePath();
  crashCtx.fillStyle = grad;
  crashCtx.fill();

  // Glow curve line
  crashCtx.beginPath();
  crashCtx.moveTo(startX, startY);
  crashCtx.quadraticCurveTo(startX + (endX - startX) * 0.5, startY, endX, endY);
  crashCtx.strokeStyle = "#ff3366";
  crashCtx.lineWidth = 3.5;
  crashCtx.shadowColor = "#ff3366";
  crashCtx.shadowBlur = 15;
  crashCtx.stroke();
  crashCtx.shadowBlur = 0;

  // Draw sleek vector jet
  crashCtx.save();
  crashCtx.translate(endX, endY);
  crashCtx.rotate(-0.4);
  
  // Sleek jet body
  crashCtx.fillStyle = "#ffffff";
  crashCtx.beginPath();
  crashCtx.moveTo(14, 0);
  crashCtx.lineTo(-10, -7);
  crashCtx.lineTo(-6, 0);
  crashCtx.lineTo(-10, 7);
  crashCtx.closePath();
  crashCtx.fill();

  // Jet exhaust glow
  crashCtx.fillStyle = "#ff3366";
  crashCtx.beginPath();
  crashCtx.arc(-8, 0, 3, 0, Math.PI * 2);
  crashCtx.fill();
  crashCtx.restore();
}

function drawCrashedTrajectory(w, h) {
  // Flash red particle burst
  crashCtx.fillStyle = "rgba(255, 51, 102, 0.15)";
  crashCtx.fillRect(0, 0, w, h);
}

// User Actions for Crash Game
function handleCrashAction() {
  triggerHaptic('medium');
  sounds.playClick();

  if (crashState.phase === 'flying' && crashState.userBet && !crashState.userBet.cashedOut) {
    cashoutCrashBet();
  } else if (crashState.phase === 'waiting') {
    placeCrashBet();
  } else {
    // Queued bet for next round
    placeCrashBet();
  }
}

function placeCrashBet() {
  const stake = parseFloat(document.getElementById('crashStakeInput').value) || 0;
  if (stake <= 0) {
    showToast("Enter a valid stake!", "warning");
    return;
  }
  if (stake > STATE.user.balance) {
    triggerHaptic('error');
    showToast("Insufficient balance!", "warning");
    openDepositModal();
    return;
  }

  STATE.user.balance -= stake;
  updateUserBalanceDisplay();

  crashState.userBet = {
    stake,
    cashedOut: false
  };

  triggerHaptic('success');
  showToast(`Bet $${stake.toFixed(2)} placed for next flight!`);
  updateCrashActionButton();
}

function cashoutCrashBet() {
  if (!crashState.userBet || crashState.userBet.cashedOut) return;

  const winMult = crashState.multiplier;
  const winAmount = +(crashState.userBet.stake * winMult).toFixed(2);
  crashState.userBet.cashedOut = true;

  STATE.user.balance += winAmount;
  updateUserBalanceDisplay();

  // Log in transactions
  STATE.transactions.unshift({
    type: 'in',
    name: `Aviator Win (${winMult.toFixed(2)}x)`,
    date: 'Just now',
    amount: winAmount
  });
  renderTransactions();

  triggerHaptic('success');
  sounds.playWin();
  showToast(`CASHOUT SUCCESS! You won $${winAmount.toFixed(2)} @ ${winMult.toFixed(2)}x!`);
  updateCrashActionButton();
}

function updateCrashActionButton() {
  const btn = document.getElementById('btnCrashAction');
  const title = document.getElementById('crashBtnTitle');
  const sub = document.getElementById('crashBtnSub');
  if (!btn) return;

  btn.className = "btn-crash-main";

  if (crashState.phase === 'flying') {
    if (crashState.userBet && !crashState.userBet.cashedOut) {
      btn.classList.add('cashout-state');
      const liveWin = (crashState.userBet.stake * crashState.multiplier).toFixed(2);
      title.textContent = `CASHOUT $${liveWin}`;
      sub.textContent = `@ ${crashState.multiplier.toFixed(2)}x`;
    } else {
      btn.classList.add('waiting-state');
      title.textContent = "IN FLIGHT";
      sub.textContent = "Wait for next round";
    }
  } else if (crashState.phase === 'waiting') {
    const stake = parseFloat(document.getElementById('crashStakeInput')?.value) || 10;
    if (crashState.userBet) {
      btn.classList.add('cashout-state');
      title.textContent = "BET ACCEPTED";
      sub.textContent = `Flying in ${crashState.waitingTimer}s`;
    } else {
      title.textContent = `PLACE BET $${stake.toFixed(2)}`;
      sub.textContent = `Next round in ${crashState.waitingTimer}s`;
    }
  } else {
    // Crashed
    btn.classList.add('waiting-state');
    title.textContent = "FLEW AWAY";
    sub.textContent = "Preparing next flight";
  }
}

function adjustCrashStake(delta) {
  triggerHaptic('light');
  const input = document.getElementById('crashStakeInput');
  const curr = parseFloat(input.value) || 0;
  const next = Math.max(1, curr + delta);
  input.value = next;
  updateCrashActionButton();
}

function setCrashStake(val) {
  triggerHaptic('light');
  const input = document.getElementById('crashStakeInput');
  if (val === 'max') {
    input.value = Math.floor(STATE.user.balance);
  } else {
    input.value = val;
  }
  updateCrashActionButton();
}

function generateSimulatedFlyers() {
  const container = document.getElementById('playersScroll');
  if (!container) return;
  const names = ["Alex_99", "BetMaster", "CryptoKing", "Tigist_E", "David_Pro", "Elena_Win", "Sammy_7", "Zack_88"];
  const players = names.map(n => {
    const s = [5, 10, 25, 50, 100][Math.floor(Math.random() * 5)];
    return `
      <div class="player-item-row">
        <span class="player-nick">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>
          ${n}
        </span>
        <span class="player-stake">$${s}.00</span>
        <span class="player-win" id="fl_${n}">Flying...</span>
      </div>
    `;
  }).join('');
  container.innerHTML = players;
}

// --- 1xSLOTS ENGINE ---
const SLOT_SYMBOLS = ['7', 'BAR', 'WIN', '1X', 'GOLD', 'TOP', 'STAR'];
let isSpinning = false;

function setSlotBet(amt) {
  triggerHaptic('light');
  STATE.slotBet = amt;
  document.querySelectorAll('.spin-chips .chip-sm').forEach(c => {
    c.classList.toggle('active', c.textContent === `$${amt}`);
  });
  document.getElementById('currentSlotBetDisplay').textContent = amt;
}

function spinSlot() {
  if (isSpinning) return;
  if (STATE.slotBet > STATE.user.balance) {
    triggerHaptic('error');
    showToast("Insufficient balance for spin!", "warning");
    openDepositModal();
    return;
  }

  isSpinning = true;
  triggerHaptic('heavy');
  sounds.playClick();

  STATE.user.balance -= STATE.slotBet;
  updateUserBalanceDisplay();

  const r1 = document.getElementById('reel1');
  const r2 = document.getElementById('reel2');
  const r3 = document.getElementById('reel3');
  const notice = document.getElementById('slotWinNotice');
  const btn = document.getElementById('btnSpin');

  r1.classList.add('spinning');
  r2.classList.add('spinning');
  r3.classList.add('spinning');
  notice.textContent = "Spinning reels...";
  btn.style.opacity = '0.5';

  setTimeout(() => {
    // Generate results
    const rand = Math.random();
    let s1, s2, s3;

    if (rand < 0.15) {
      // 777 Mega Win (15% chance in demo)
      s1 = s2 = s3 = '7';
    } else if (rand < 0.45) {
      // Double match
      const sym = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      s1 = sym; s2 = sym; s3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    } else {
      // Random
      s1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      s2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      s3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    }

    r1.querySelector('span').textContent = s1;
    r1.classList.remove('spinning');

    setTimeout(() => {
      r2.querySelector('span').textContent = s2;
      r2.classList.remove('spinning');

      setTimeout(() => {
        r3.querySelector('span').textContent = s3;
        r3.classList.remove('spinning');
        isSpinning = false;
        btn.style.opacity = '1';

        // Check payouts
        if (s1 === s2 && s2 === s3) {
          const mult = (s1 === '7') ? 50 : 20;
          const win = STATE.slotBet * mult;
          STATE.user.balance += win;
          updateUserBalanceDisplay();
          triggerHaptic('success');
          sounds.playWin();
          notice.textContent = `MEGA 3-OF-A-KIND! WON $${win.toFixed(2)} (${mult}x)!`;
          showToast(`3-OF-A-KIND! You won $${win.toFixed(2)}!`);
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
          const win = STATE.slotBet * 2.5;
          STATE.user.balance += win;
          updateUserBalanceDisplay();
          triggerHaptic('success');
          sounds.playClick();
          notice.textContent = `Double Match! Won $${win.toFixed(2)}!`;
        } else {
          notice.textContent = "No match this time. Try again!";
        }
      }, 300);
    }, 250);
  }, 1000);
}

// --- CASHIER & EXCLUSIVE PAYLINK BANK KHQR ENGINE ---
let activePaylinkTxn = null;
let paylinkPollInterval = null;

let currentKhqrAmount = 20;

function openDepositModal(initialAmt) {
  openKhqrModal(initialAmt || currentKhqrAmount || 20);
}

function closeDepositModal() {
  closeKhqrModal();
}

function openWithdrawModal() {
  triggerHaptic('selection');
  document.getElementById('withdrawModal').classList.add('active');
}

function closeWithdrawModal() {
  document.getElementById('withdrawModal').classList.remove('active');
}

function openKhqrModal(amount) {
  triggerHaptic('selection');
  currentKhqrAmount = parseFloat(amount) || 20;
  
  const modal = document.getElementById('bakongModal');
  const desktopModal = document.getElementById('bakongModalDesktop');
  const mobileModal = document.getElementById('bakongModalMobile');
  if (!modal) return;

  const isMobile = window.innerWidth <= 768;
  modal.style.display = 'block';
  modal.classList.remove('hidden', 'fade-out');
  modal.classList.add('fade-in');

  if (isMobile) {
    if (desktopModal) desktopModal.style.display = 'none';
    if (mobileModal) {
      mobileModal.style.display = 'block';
      setTimeout(() => {
        mobileModal.style.transform = 'translateY(0)';
      }, 15);
    }
  } else {
    if (mobileModal) mobileModal.style.display = 'none';
    if (desktopModal) {
      desktopModal.style.display = 'block';
      desktopModal.classList.add('fade-in');
    }
  }

  // Update active chips in modal
  document.querySelectorAll('.bakong-amt-chip').forEach(c => {
    c.classList.toggle('active', c.textContent === `$${currentKhqrAmount}`);
  });

  // Fetch real KHQR from PayLink
  fetchAndDisplayKhqr(currentKhqrAmount);
}

function closeKhqrModal() {
  if (paylinkPollInterval) clearInterval(paylinkPollInterval);
  activePaylinkTxn = null;

  const modal = document.getElementById('bakongModal');
  const desktopModal = document.getElementById('bakongModalDesktop');
  const mobileModal = document.getElementById('bakongModalMobile');
  if (!modal) return;

  const isMobile = window.innerWidth <= 768;
  if (isMobile && mobileModal) {
    mobileModal.style.transform = 'translateY(100%)';
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('fade-in');
      modal.style.display = 'none';
      mobileModal.style.display = 'none';
    }, 380);
  } else if (desktopModal) {
    desktopModal.classList.add('fade-out');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('fade-in');
      modal.style.display = 'none';
      desktopModal.classList.remove('fade-out');
      desktopModal.style.display = 'none';
    }, 200);
  } else {
    modal.style.display = 'none';
  }
}

function setKhqrDepositAmount(amt) {
  triggerHaptic('light');
  currentKhqrAmount = parseFloat(amt) || 20;
  document.querySelectorAll('.bakong-amt-chip').forEach(c => {
    c.classList.toggle('active', c.textContent === `$${currentKhqrAmount}`);
  });
  fetchAndDisplayKhqr(currentKhqrAmount);
}

async function fetchAndDisplayKhqr(amt) {
  if (paylinkPollInterval) clearInterval(paylinkPollInterval);
  activePaylinkTxn = null;

  // Set amounts in display
  const amtStr = amt.toFixed(2);
  const amtEl = document.getElementById('khqr-amount');
  const amtMobileEl = document.getElementById('khqr-amount-mobile');
  if (amtEl) amtEl.textContent = amtStr;
  if (amtMobileEl) amtMobileEl.textContent = amtStr;

  const qrDesktop = document.getElementById('bakongQR');
  const qrMobile = document.getElementById('bakongQR-mobile');
  const statusDesk = document.getElementById('bakongPollStatusText');
  const statusMob = document.getElementById('bakongPollStatusTextMobile');

  if (statusDesk) statusDesk.textContent = "Generating official Bakong KHQR...";
  if (statusMob) statusMob.textContent = "Generating official Bakong KHQR...";

  try {
    const res = await fetch('/api/paylink/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, userId: STATE.user.id })
    });
    const data = await res.json();
    if (!data.success || !data.qrString) {
      throw new Error(data.error || 'Failed to generate Bakong KHQR');
    }

    activePaylinkTxn = {
      tranId: data.tranId,
      md5: data.md5,
      amount: data.amount,
      deepLink: data.deepLink,
      merchantName: data.merchantName,
      qrString: data.qrString
    };

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(data.qrString)}`;
    if (qrDesktop) qrDesktop.src = qrUrl;
    if (qrMobile) qrMobile.src = qrUrl;

    // Setup deep link
    const deepDesk = document.getElementById('bakongDeepLinkBtn');
    const deepMob = document.getElementById('bakongDeepLinkBtnMobile');
    const linkHref = data.deepLink || '#';
    if (deepDesk) deepDesk.href = linkHref;
    if (deepMob) deepMob.href = linkHref;

    if (statusDesk) statusDesk.textContent = "Auto-verifying payment with Bakong...";
    if (statusMob) statusMob.textContent = "Auto-verifying payment with Bakong...";

    // Start auto polling in background (NO manual button needed!)
    startPaylinkBackgroundAutoPoll();

  } catch (err) {
    console.error("PayLink generation error:", err);
    if (statusDesk) statusDesk.textContent = "Gateway connecting... retry";
    if (statusMob) statusMob.textContent = "Gateway connecting... retry";
    showToast(`Gateway Error: ${err.message}`, "warning");
  }
}

function startPaylinkBackgroundAutoPoll() {
  if (paylinkPollInterval) clearInterval(paylinkPollInterval);
  let attempts = 0;

  const statusDesk = document.getElementById('bakongPollStatusText');
  const statusMob = document.getElementById('bakongPollStatusTextMobile');

  paylinkPollInterval = setInterval(async () => {
    if (!activePaylinkTxn) {
      clearInterval(paylinkPollInterval);
      return;
    }
    attempts++;
    const pollText = `Auto-verifying payment with Bakong... (checking #${attempts})`;
    if (statusDesk) statusDesk.textContent = pollText;
    if (statusMob) statusMob.textContent = pollText;

    try {
      const res = await fetch('/api/paylink/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tranId: activePaylinkTxn.tranId,
          md5: activePaylinkTxn.md5,
          userId: STATE.user.id,
          amount: activePaylinkTxn.amount
        })
      });
      const data = await res.json();
      if (data.paid) {
        clearInterval(paylinkPollInterval);
        handlePaylinkSuccess(activePaylinkTxn.amount, activePaylinkTxn.tranId);
      }
    } catch (e) {}

    if (attempts >= 100) {
      clearInterval(paylinkPollInterval);
      if (statusDesk) statusDesk.textContent = "QR expired. Click an amount to refresh.";
      if (statusMob) statusMob.textContent = "QR expired. Click an amount to refresh.";
    }
  }, 3000);
}

function handlePaylinkSuccess(amount, tranId) {
  triggerHaptic('success');
  sounds.playWin();

  STATE.user.balance += amount;
  updateUserBalanceDisplay();

  STATE.transactions.unshift({
    type: 'in',
    name: `PayLink Bakong KHQR (${tranId || 'Verified'})`,
    date: 'Just now',
    amount: amount
  });
  renderTransactions();

  closeKhqrModal();
  showToast(`🎉 Payment Confirmed! $${amount.toFixed(2)} credited to your account!`);
}

function downloadKhqrImage(event) {
  if (event) event.preventDefault();
  const qrDesktop = document.getElementById('bakongQR');
  const qrMobile = document.getElementById('bakongQR-mobile');
  const src = qrDesktop?.src || qrMobile?.src;
  if (!src) {
    showToast("QR code not ready yet", "warning");
    return;
  }
  const a = document.createElement('a');
  a.href = src;
  a.download = `Bakong_KHQR_$${currentKhqrAmount}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  triggerHaptic('success');
  showToast("KHQR image downloaded! Upload to your banking app.");
}

function executeWithdrawal() {
  const amt = parseFloat(document.getElementById('withdrawAmountInput').value) || 0;
  const acc = document.getElementById('withdrawAccountInput').value.trim();

  if (amt < 10) {
    showToast("Minimum withdrawal is $10!", "warning");
    return;
  }
  if (!acc) {
    showToast("Please enter your account number or address!", "warning");
    return;
  }
  if (amt > STATE.user.balance) {
    triggerHaptic('error');
    showToast("Insufficient balance for withdrawal!", "warning");
    return;
  }

  STATE.user.balance -= amt;
  updateUserBalanceDisplay();

  STATE.transactions.unshift({
    type: 'out',
    name: 'PayLink Payout Processing',
    date: 'Just now',
    amount: -amt
  });
  renderTransactions();

  closeWithdrawModal();
  triggerHaptic('success');
  showToast(`Withdrawal request of $${amt.toFixed(2)} submitted successfully!`);
}

function renderTransactions() {
  const container = document.getElementById('transactionsList');
  if (!container) return;

  container.innerHTML = STATE.transactions.map(t => `
    <div class="txn-row">
      <div class="txn-left">
        <div class="txn-icon ${t.type}">${t.type === 'in' ? '↓' : '↑'}</div>
        <div>
          <div class="txn-name">${t.name}</div>
          <div class="txn-date">${t.date}</div>
        </div>
      </div>
      <div class="txn-amt ${t.type}">
        ${t.type === 'in' ? '+' : ''}$${Math.abs(t.amount).toFixed(2)}
      </div>
    </div>
  `).join('');
}

// --- HERO CAROUSEL ---
let currentSlide = 0;
function initHeroCarousel() {
  setInterval(() => {
    currentSlide = (currentSlide + 1) % 2;
    setSlide(currentSlide);
  }, 6000);
}

function setSlide(idx) {
  currentSlide = idx;
  const slides = document.querySelectorAll('.carousel-slide');
  const dots = document.querySelectorAll('.carousel-dots .dot');
  slides.forEach((s, i) => s.classList.toggle('active', i === idx));
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

// --- UTILITY TOAST ---
function showToast(msg, type = 'success') {
  const toast = document.getElementById('appToast');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');

  msgEl.textContent = msg;
  if (type === 'warning') {
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    iconEl.style.background = 'var(--1x-gold)';
  } else {
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    iconEl.style.background = 'var(--1x-green)';
  }

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function alertNotification(title, msg) {
  triggerHaptic('light');
  showToast(`${title}: ${msg}`);
}

// --- 1xTV REAL-TIME LIVE STREAMING AUTO-FINDER & SYNC ---
let currentStreamMatchId = null;

function renderStreamChannelSelector() {
  const container = document.getElementById('streamChannelSelector');
  if (!container) return;

  const matches = STATE.matches || [];
  if (matches.length === 0) {
    container.innerHTML = `<span style="font-size:11px;color:var(--text-muted);padding:4px 8px;">Loading channels...</span>`;
    return;
  }

  container.innerHTML = matches.map(m => `
    <button class="stream-chan-btn ${m.id === currentStreamMatchId ? 'active' : ''}" onclick="switchStreamMatch('${m.id}', false)">
      <span class="live-dot-mini"></span> ${m.homeTeam} vs ${m.awayTeam}
    </button>
  `).join('');
}

function renderStreamTimeline(match) {
  const container = document.getElementById('streamEventsList');
  if (!container || !match) return;

  const home = match.homeTeam;
  const away = match.awayTeam;
  const sport = match.sport || 'football';

  if (sport === 'basketball') {
    container.innerHTML = `
      <div class="timeline-event">
        <span class="event-time">${match.time || 'LIVE'}</span>
        <span class="event-icon"><svg class="ui-icon stroke ui-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg></span>
        <span class="event-desc"><strong>3-POINTER!</strong> ${home} sinks a contested shot from beyond the arc!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">Q3</span>
        <span class="event-icon"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
        <span class="event-desc">Fast-break slam dunk by ${away} to cut the deficit!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">Q2</span>
        <span class="event-icon"><svg class="ui-icon stroke ui-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
        <span class="event-desc">Official timeout called on the floor.</span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="timeline-event">
        <span class="event-time">${match.time || 'LIVE'}</span>
        <span class="event-icon"><svg class="ui-icon stroke ui-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20"/></svg></span>
        <span class="event-desc"><strong>DANGEROUS ATTACK!</strong> ${home} press forward with a testing cross into the penalty box!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">${match.isLive ? '38\'' : '1st Half'}</span>
        <span class="event-icon"><svg class="ui-icon stroke ui-icon-sm" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
        <span class="event-desc">Sensational diving save by ${away} goalkeeper to tip the ball wide!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">22'</span>
        <span class="event-icon"><span style="display:inline-block;width:10px;height:14px;background:#f59e0b;border-radius:2px;"></span></span>
        <span class="event-desc">Tactical challenge in midfield, referee awards yellow card.</span>
      </div>
    `;
  }
}

async function autoFindLiveStream(query) {
  const overlay = document.getElementById('streamLoadingOverlay');
  const loadingText = document.getElementById('streamLoadingText');
  const iframe = document.getElementById('liveStreamIframe');

  if (overlay) overlay.classList.add('active');
  if (loadingText) loadingText.textContent = `SEARCHING LIVE STREAM: "${query}"...`;

  try {
    const res = await fetch(`/api/stream/find?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.embedUrl && iframe) {
      iframe.src = data.embedUrl;
      if (loadingText) loadingText.textContent = data.isLive ? 'REAL-TIME LIVE STREAM CONNECTED!' : 'MATCH BROADCAST LOADED!';
      setTimeout(() => {
        if (overlay) overlay.classList.remove('active');
      }, 1200);
      showToast(`Auto-found Live Stream for ${query}!`);
    } else {
      if (iframe) iframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query + ' live')}&mute=1`;
      if (overlay) overlay.classList.remove('active');
    }
  } catch (e) {
    if (iframe) iframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query + ' live')}&mute=1`;
    if (overlay) overlay.classList.remove('active');
  }
}

function watchMatchStream(matchId) {
  triggerHaptic('medium');
  sounds.playClick();
  switchTab('stream');
  switchStreamMatch(matchId, true);
}

function switchStreamMatch(matchId, doSwitchTab = false) {
  triggerHaptic('light');
  currentStreamMatchId = matchId;

  if (doSwitchTab) {
    switchTab('stream');
  }

  // Update active pill button
  document.querySelectorAll('.stream-chan-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes(`'${matchId}'`));
  });

  const match = (STATE.matches || []).find(m => m.id === matchId) || (STATE.matches || [])[0];
  if (!match) return;

  // Auto-find real-time live stream for this match!
  autoFindLiveStream(`${match.homeTeam} vs ${match.awayTeam}`);

  // Update overlay score
  const scoreBadge = document.getElementById('streamMatchPill');
  if (scoreBadge) {
    const scoreStr = (match.homeScore !== null && match.homeScore !== undefined) 
      ? `${match.homeScore} - ${match.awayScore}` 
      : 'VS';
    scoreBadge.innerHTML = `<span class="pulsing-dot-orange"></span> ${match.homeTeam} ${scoreStr} ${match.awayTeam} (${match.time || 'LIVE'})`;
  }

  // Update stats teams
  const homeLbl = document.getElementById('statHomeTeam');
  const awayLbl = document.getElementById('statAwayTeam');
  if (homeLbl) homeLbl.textContent = match.homeTeam;
  if (awayLbl) awayLbl.textContent = match.awayTeam;

  const titleEl = document.getElementById('streamBettingTitle');
  if (titleEl) titleEl.innerHTML = `<svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> In-Play Live Odds (${match.homeTeam} vs ${match.awayTeam})`;

  // Render commentary and timeline for this match
  renderStreamTimeline(match);

  // Render real odds for this match directly under the video
  renderStreamOdds(match);
}

function searchLiveStreamCustom() {
  triggerHaptic('medium');
  const input = document.getElementById('streamSearchInput');
  const query = input?.value?.trim();
  if (!query) {
    showToast("Please enter a team or match to search!", "warning");
    return;
  }
  autoFindLiveStream(query);
  const scoreBadge = document.getElementById('streamMatchPill');
  if (scoreBadge) scoreBadge.innerHTML = `<span class="pulsing-dot-orange"></span> Live: ${query}`;
}

function renderStreamOdds(m) {
  const container = document.getElementById('streamOddsRow');
  if (!container || !m || !m.odds) return;

  const isSelected = (pickType) => {
    return STATE.betslip.selections.some(s => s.matchId === m.id && s.pickType === pickType);
  };

  container.innerHTML = `
    <button class="btn-odd ${isSelected('1') ? 'selected' : ''}" onclick="toggleOddSelection('${m.id}', '1', '${m.homeTeam}', ${m.odds.home})">
      <span class="odd-type">${m.homeTeam} (1)</span>
      <span class="odd-val">${m.odds.home.toFixed(2)}</span>
    </button>
    ${m.odds.draw > 0 ? `
      <button class="btn-odd ${isSelected('X') ? 'selected' : ''}" onclick="toggleOddSelection('${m.id}', 'X', 'Draw (X)', ${m.odds.draw})">
        <span class="odd-type">Draw (X)</span>
        <span class="odd-val">${m.odds.draw.toFixed(2)}</span>
      </button>
    ` : ''}
    <button class="btn-odd ${isSelected('2') ? 'selected' : ''}" onclick="toggleOddSelection('${m.id}', '2', '${m.awayTeam}', ${m.odds.away})">
      <span class="odd-type">${m.awayTeam} (2)</span>
      <span class="odd-val">${m.odds.away.toFixed(2)}</span>
    </button>
  `;
}

// --- BAKONG MOBILE SHEET TOUCH DRAG DISMISS HANDLER ---
let bakongTouchStartY = 0;
let bakongIsDragging = false;

function initBakongDragListeners() {
  const modal = document.getElementById('bakongModal');
  const mobileModal = document.getElementById('bakongModalMobile');
  const dragArea = document.getElementById('mobileDragArea');
  const redHeader = document.getElementById('redHeaderDraggable');

  if (!modal || !mobileModal) return;

  function handleTouchStart(e) {
    bakongTouchStartY = e.touches[0].clientY;
    bakongIsDragging = true;
  }

  function handleTouchMove(e) {
    if (!bakongIsDragging) return;
    const touchCurrentY = e.touches[0].clientY;
    const deltaY = touchCurrentY - bakongTouchStartY;
    if (deltaY > 0) {
      const newTransform = Math.min(100, (deltaY / window.innerHeight * 100));
      mobileModal.style.transition = 'none';
      mobileModal.style.transform = `translateY(${newTransform}%)`;
    }
  }

  function handleTouchEnd(e) {
    if (!bakongIsDragging) return;
    bakongIsDragging = false;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - bakongTouchStartY;
    mobileModal.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    if (deltaY > 90) {
      closeKhqrModal();
    } else {
      mobileModal.style.transform = 'translateY(0)';
    }
  }

  [dragArea, redHeader].forEach(el => {
    if (el) {
      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchmove', handleTouchMove, { passive: true });
      el.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  });

  // Modal backdrop click closes modal
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeKhqrModal();
    }
  });

  // Escape key closes modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.style.display !== 'none' && !modal.classList.contains('hidden')) {
      closeKhqrModal();
    }
  });

  // Resize listener to switch desktop vs mobile modal cleanly
  window.addEventListener('resize', function() {
    if (modal.style.display !== 'none' && !modal.classList.contains('hidden')) {
      const isMobile = window.innerWidth <= 768;
      const desktopModal = document.getElementById('bakongModalDesktop');
      if (isMobile) {
        if (desktopModal) desktopModal.style.display = 'none';
        if (mobileModal) {
          mobileModal.style.display = 'block';
          mobileModal.style.transform = 'translateY(0)';
        }
      } else {
        if (mobileModal) {
          mobileModal.style.transform = 'translateY(100%)';
          mobileModal.style.display = 'none';
        }
        if (desktopModal) desktopModal.style.display = 'block';
      }
    }
  });
}

// --- UNIVERSAL HORIZONTAL MOUSE WHEEL & DRAG-SCROLL ENGINE FOR DESKTOP & MOBILE ---
function initHorizontalScrollBars() {
  const selectors = [
    '.category-tabs',
    '.sub-filter-row',
    '.ls-date-ribbon',
    '.stream-channel-selector',
    '.history-filter-pills',
    '.amount-quick-buttons',
    '.slip-tabs',
    '.bakong-amount-bar'
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.dataset.hasScrollInit) return;
      el.dataset.hasScrollInit = 'true';

      // 1. Mouse wheel horizontal scrolling conversion
      el.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaY * 0.9;
        }
      }, { passive: false });

      // 2. Mouse click-and-drag scrolling
      let isDown = false;
      let startX = 0;
      let startScrollLeft = 0;
      let hasMoved = false;

      el.addEventListener('mousedown', (e) => {
        isDown = true;
        hasMoved = false;
        el.classList.add('is-dragging');
        startX = e.pageX - el.offsetLeft;
        startScrollLeft = el.scrollLeft;
      });

      window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        el.classList.remove('is-dragging');
        setTimeout(() => { hasMoved = false; }, 60);
      });

      el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 4) {
          hasMoved = true;
          e.preventDefault();
          el.scrollLeft = startScrollLeft - walk;
        }
      });

      // Prevent button clicks if dragging
      el.querySelectorAll('button, a').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (hasMoved) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }, true);
      });
    });
  });
}


