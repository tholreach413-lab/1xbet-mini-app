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

// --- TAB SWITCHING ---
function switchTab(tabId) {
  triggerHaptic('selection');
  STATE.currentTab = tabId;

  // Update top nav
  document.querySelectorAll('.cat-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
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

// --- SPORT FILTERING ---
function filterSport(sport) {
  triggerHaptic('light');
  STATE.currentSportFilter = sport;
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-sport') === sport);
  });
  renderMatches();
}

// --- LIVESCORE TOOLBAR & FILTER HANDLERS ---
function setLiveScoreFilter(filter) {
  triggerHaptic('selection');
  STATE.liveScoreFilter = filter;
  STATE.visibleMatchCount = 15; // Reset pagination to initial 15 matches on filter switch

  document.querySelectorAll('.ls-ribbon-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
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

  // Filter logic: If searching, search across ALL 1,000+ matches globally!
  let filtered = [];
  const searchQuery = (STATE.matchSearchQuery || '').trim().toLowerCase();
  const isSearching = Boolean(searchQuery);

  if (isSearching) {
    filtered = matches.filter(m => 
      (m.homeTeam && m.homeTeam.toLowerCase().includes(searchQuery)) ||
      (m.awayTeam && m.awayTeam.toLowerCase().includes(searchQuery)) ||
      (m.league && m.league.toLowerCase().includes(searchQuery)) ||
      (m.country && m.country.toLowerCase().includes(searchQuery)) ||
      (m.rawLeague && m.rawLeague.toLowerCase().includes(searchQuery))
    );
  } else {
    // Sport filter
    filtered = STATE.currentSportFilter === 'all'
      ? matches
      : matches.filter(m => m.sport === STATE.currentSportFilter);

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
        if (btnMoreText) btnMoreText.textContent = `✓ All ${filtered.length} Matches Shown`;
      } else {
        if (btnMore) btnMore.disabled = false;
        const remaining = filtered.length - displayList.length;
        const nextBatch = Math.min(defaultBatch, remaining);
        if (btnMoreText) btnMoreText.textContent = `+ View More (+${nextBatch} Matches)`;
      }
    }
  }

  if (displayList.length === 0) {
    if (viewMoreBox) viewMoreBox.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div>No matches found for "${STATE.matchSearchQuery}". Try another team name!</div>
      </div>
    `;
    return;
  }

  // 3. Group Matches by League (Authentic LiveScore App Layout)
  const leaguesMap = new Map();
  for (const m of displayList) {
    const leagueKey = m.league || 'Other Matches';
    if (!leaguesMap.has(leagueKey)) {
      leaguesMap.set(leagueKey, {
        name: m.rawLeague || m.league,
        country: m.country || '',
        icon: m.leagueIcon || '⚽',
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
            <span class="ls-league-flag">⚽</span>
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
        <div class="empty-icon">⚽</div>
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
            <span class="ls-league-flag">🔴</span>
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

  // LiveScore time & score pill
  const liveScoreTimeHTML = m.isLive 
    ? `<div class="ls-score-cell live">
         <span class="ls-live-clock"><span class="pulsing-dot-orange"></span> ${m.time}</span>
         <span class="ls-score-digits">${m.homeScore ?? 0} - ${m.awayScore ?? 0}</span>
       </div>`
    : `<div class="ls-score-cell upcoming">
         <span class="ls-match-time">${m.day === 'Tomorrow' ? 'Tmr ' : ''}${m.time}</span>
       </div>`;

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
        <button class="ls-star-fav" onclick="this.classList.toggle('fav-active')">☆</button>
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
        <button class="ls-stream-btn ${m.isLive ? 'live-on' : ''}" onclick="watchMatchStream('${m.id}')" title="Watch live match stream">
          📺 <span class="ls-stream-txt">Live</span>
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
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎟️</div>No selections added yet.<br>Click any odd to build your bet!</div>`;
  } else {
    list.innerHTML = STATE.betslip.selections.map((s, idx) => `
      <div class="slip-item">
        <button class="btn-remove-slip-item" onclick="removeSelection(${idx})">✕</button>
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
  showToast("⚡ Accumulator of the Day loaded with +10% bonus!");
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
  showToast(`✅ Bet Placed: $${stake.toFixed(2)} on Ticket ${newBet.id}!`);

  // Simulate automatic winning resolution after 18 seconds for demo thrill
  setTimeout(() => {
    if (newBet.status === 'open') {
      newBet.status = 'won';
      STATE.user.balance += newBet.potentialReturn;
      updateUserBalanceDisplay();
      renderBetsHistory();
      triggerHaptic('success');
      sounds.playWin();
      showToast(`🎉 CONGRATULATIONS! Ticket ${newBet.id} WON $${newBet.potentialReturn.toFixed(2)}!`);
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
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div>No ${filter} bets found.</div>`;
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
  statusEl.textContent = "🚀 AIRPLANE IN FLIGHT...";
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
    showToast(`💥 Plane crashed at ${crashState.crashPoint.toFixed(2)}x! Bet lost.`, 'warning');
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

  // Draw Jet / Plane Rocket
  crashCtx.save();
  crashCtx.translate(endX, endY);
  crashCtx.rotate(-0.4);
  crashCtx.font = "24px sans-serif";
  crashCtx.fillText("🚀", -12, 10);
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
  showToast(`🚀 Bet $${stake.toFixed(2)} placed for next flight!`);
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
  showToast(`💰 CASHOUT SUCCESS! You won $${winAmount.toFixed(2)} @ ${winMult.toFixed(2)}x!`);
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
        <span class="player-nick">✈️ ${n}</span>
        <span class="player-stake">$${s}.00</span>
        <span class="player-win" id="fl_${n}">Flying...</span>
      </div>
    `;
  }).join('');
  container.innerHTML = players;
}

// --- 1xSLOTS ENGINE ---
const SLOT_SYMBOLS = ['7️⃣', '💎', '🔔', '🍒', '🍋', '🍇', '⭐'];
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
      s1 = s2 = s3 = '7️⃣';
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
          const mult = (s1 === '7️⃣') ? 50 : 20;
          const win = STATE.slotBet * mult;
          STATE.user.balance += win;
          updateUserBalanceDisplay();
          triggerHaptic('success');
          sounds.playWin();
          notice.textContent = `🎉 MEGA 3-OF-A-KIND! WON $${win.toFixed(2)} (${mult}x)!`;
          showToast(`🏆 3-OF-A-KIND! You won $${win.toFixed(2)}!`);
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
          const win = STATE.slotBet * 2.5;
          STATE.user.balance += win;
          updateUserBalanceDisplay();
          triggerHaptic('success');
          sounds.playClick();
          notice.textContent = `✨ Double Match! Won $${win.toFixed(2)}!`;
        } else {
          notice.textContent = "No match this time. Try again!";
        }
      }, 300);
    }, 250);
  }, 1000);
}

// --- CASHIER, DEPOSIT & WITHDRAW ---
function openDepositModal() {
  triggerHaptic('selection');
  document.getElementById('depositModal').classList.add('active');
}
function closeDepositModal() {
  document.getElementById('depositModal').classList.remove('active');
}
function openWithdrawModal() {
  triggerHaptic('selection');
  document.getElementById('withdrawModal').classList.add('active');
}
function closeWithdrawModal() {
  document.getElementById('withdrawModal').classList.remove('active');
}

function setDepositTab(method) {
  triggerHaptic('light');
  document.querySelectorAll('.dep-pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');

  document.querySelectorAll('.deposit-tab-pane').forEach(p => p.classList.remove('active'));
  if (method === 'paylink') document.getElementById('depPanePayLink').classList.add('active');
  if (method === 'bank') document.getElementById('depPaneBank').classList.add('active');
  if (method === 'crypto') document.getElementById('depPaneCrypto').classList.add('active');
}

function setDepositAmt(amt) {
  triggerHaptic('light');
  document.getElementById('depositAmountInput').value = amt;
  document.querySelectorAll('.amount-quick-buttons .amt-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === `$${amt}`);
  });
}

function selectDepositMethod(method) {
  openDepositModal();
  setDepositTab(method);
}

function executeDeposit(method) {
  const amt = parseFloat(document.getElementById('depositAmountInput').value) || 50;
  if (amt < 5) {
    showToast("Minimum deposit is $5!", "warning");
    return;
  }

  triggerHaptic('success');
  sounds.playWin();

  STATE.user.balance += amt;
  updateUserBalanceDisplay();

  STATE.transactions.unshift({
    type: 'in',
    name: method === 'paylink' ? 'PayLink Bank Gateway' : (method === 'crypto' ? 'USDT TRC20 Deposit' : 'Local Bank Transfer'),
    date: 'Just now',
    amount: amt
  });
  renderTransactions();

  closeDepositModal();
  showToast(`💳 Deposit of $${amt.toFixed(2)} successful via ${method.toUpperCase()}!`);
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
    name: 'Bank Payout Processing',
    date: 'Just now',
    amount: -amt
  });
  renderTransactions();

  closeWithdrawModal();
  triggerHaptic('success');
  showToast(`💸 Withdrawal request of $${amt.toFixed(2)} submitted successfully!`);
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
  iconEl.textContent = type === 'warning' ? '!' : '✓';
  iconEl.style.background = type === 'warning' ? 'var(--1x-gold)' : 'var(--1x-green)';

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
      <span class="live-dot-mini"></span> ${m.leagueIcon || '⚽'} ${m.homeTeam} vs ${m.awayTeam}
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
        <span class="event-icon">🏀</span>
        <span class="event-desc"><strong>3-POINTER!</strong> ${home} sinks a contested shot from beyond the arc!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">Q3</span>
        <span class="event-icon">⚡</span>
        <span class="event-desc">Fast-break slam dunk by ${away} to cut the deficit!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">Q2</span>
        <span class="event-icon">⏱️</span>
        <span class="event-desc">Official timeout called on the floor.</span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="timeline-event">
        <span class="event-time">${match.time || 'LIVE'}</span>
        <span class="event-icon">⚽</span>
        <span class="event-desc"><strong>DANGEROUS ATTACK!</strong> ${home} press forward with a testing cross into the penalty box!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">${match.isLive ? '38\'' : '1st Half'}</span>
        <span class="event-icon">🧤</span>
        <span class="event-desc">Sensational diving save by ${away} goalkeeper to tip the ball wide!</span>
      </div>
      <div class="timeline-event">
        <span class="event-time">22'</span>
        <span class="event-icon">🟨</span>
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
  if (loadingText) loadingText.textContent = `🔍 SEARCHING LIVE STREAM: "${query}"...`;

  try {
    const res = await fetch(`/api/stream/find?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.embedUrl && iframe) {
      iframe.src = data.embedUrl;
      if (loadingText) loadingText.textContent = data.isLive ? '🟢 REAL-TIME LIVE STREAM CONNECTED!' : '🎬 MATCH BROADCAST LOADED!';
      setTimeout(() => {
        if (overlay) overlay.classList.remove('active');
      }, 1200);
      showToast(`📺 Auto-found Live Stream for ${query}!`);
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
    scoreBadge.textContent = `${match.leagueIcon || '⚽'} ${match.homeTeam} ${scoreStr} ${match.awayTeam} (${match.time || 'LIVE'})`;
  }

  // Update stats teams
  const homeLbl = document.getElementById('statHomeTeam');
  const awayLbl = document.getElementById('statAwayTeam');
  if (homeLbl) homeLbl.textContent = match.homeTeam;
  if (awayLbl) awayLbl.textContent = match.awayTeam;

  const titleEl = document.getElementById('streamBettingTitle');
  if (titleEl) titleEl.textContent = `⚡ In-Play Live Odds (${match.homeTeam} vs ${match.awayTeam})`;

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
  if (scoreBadge) scoreBadge.textContent = `🔴 Live: ${query}`;
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
