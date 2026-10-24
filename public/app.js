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

// --- SYNTHESIZED SOUND EFFECTS (Web Audio API) ---
class SoundManager {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  playClick() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }
  playWin() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.2, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  }
  playCrash() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }
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
  currentTab: 'sports',
  currentSportFilter: 'all',
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

// --- MATCH DATA WITH LIVE SCORES & ODDS ---
const MATCHES_DATA = [
  {
    id: "m_1",
    sport: "football",
    league: "UEFA Champions League",
    leagueIcon: "🏆",
    isLive: true,
    time: "76'",
    homeTeam: "Real Madrid",
    homeFlag: "🇪🇸",
    homeScore: 2,
    awayTeam: "Manchester City",
    awayFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    awayScore: 1,
    odds: {
      home: 1.85,
      draw: 3.40,
      away: 3.80,
      over25: 1.55,
      under25: 2.30
    }
  },
  {
    id: "m_2",
    sport: "football",
    league: "English Premier League",
    leagueIcon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    isLive: true,
    time: "38'",
    homeTeam: "Arsenal",
    homeFlag: "🔴",
    homeScore: 1,
    awayTeam: "Liverpool",
    awayFlag: "⚪",
    awayScore: 0,
    odds: {
      home: 2.10,
      draw: 3.25,
      away: 3.20,
      over25: 1.70,
      under25: 2.15
    }
  },
  {
    id: "m_3",
    sport: "basketball",
    league: "NBA Regular Season",
    leagueIcon: "🏀",
    isLive: true,
    time: "Q4 3:12",
    homeTeam: "LA Lakers",
    homeFlag: "🟡",
    homeScore: 108,
    awayTeam: "Boston Celtics",
    awayFlag: "🟢",
    awayScore: 105,
    odds: {
      home: 1.65,
      draw: 14.00,
      away: 2.25,
      over25: 1.90,
      under25: 1.90
    }
  },
  {
    id: "m_4",
    sport: "tennis",
    league: "ATP Masters 1000",
    leagueIcon: "🎾",
    isLive: true,
    time: "Set 3 (4-4)",
    homeTeam: "Novak Djokovic",
    homeFlag: "🇷🇸",
    homeScore: 1,
    awayTeam: "Carlos Alcaraz",
    awayFlag: "🇪🇸",
    awayScore: 1,
    odds: {
      home: 1.92,
      draw: 0,
      away: 1.88,
      over25: 1.75,
      under25: 2.05
    }
  },
  {
    id: "m_5",
    sport: "football",
    league: "Spanish La Liga",
    leagueIcon: "🇪🇸",
    isLive: false,
    time: "Today 22:00",
    homeTeam: "Barcelona",
    homeFlag: "🔵🔴",
    homeScore: null,
    awayTeam: "Atletico Madrid",
    awayFlag: "🔴⚪",
    awayScore: null,
    odds: {
      home: 1.95,
      draw: 3.50,
      away: 3.60,
      over25: 1.82,
      under25: 2.00
    }
  },
  {
    id: "m_6",
    sport: "esports",
    league: "CS2 Blast Premier",
    leagueIcon: "🎮",
    isLive: true,
    time: "Map 2 (11-9)",
    homeTeam: "FaZe Clan",
    homeFlag: "🔴",
    homeScore: 1,
    awayTeam: "NAVI",
    awayFlag: "🟡",
    awayScore: 0,
    odds: {
      home: 1.50,
      draw: 0,
      away: 2.50,
      over25: 1.80,
      under25: 1.95
    }
  },
  {
    id: "m_7",
    sport: "mma",
    league: "UFC 310 Title Bout",
    leagueIcon: "🥊",
    isLive: false,
    time: "Tonight 01:00",
    homeTeam: "Islam Makhachev",
    homeFlag: "🇷🇺",
    homeScore: null,
    awayTeam: "Arman Tsarukyan",
    awayFlag: "🇦🇲",
    awayScore: null,
    odds: {
      home: 1.35,
      draw: 45.00,
      away: 3.20,
      over25: 1.60,
      under25: 2.30
    }
  },
  {
    id: "m_8",
    sport: "football",
    league: "German Bundesliga",
    leagueIcon: "🇩🇪",
    isLive: false,
    time: "Tomorrow 17:30",
    homeTeam: "Bayern Munich",
    homeFlag: "🔴",
    homeScore: null,
    awayTeam: "Borussia Dortmund",
    awayFlag: "🟡",
    awayScore: null,
    odds: {
      home: 1.62,
      draw: 4.10,
      away: 4.60,
      over25: 1.45,
      under25: 2.65
    }
  }
];

// --- INITIAL RENDER & BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
  updateUserBalanceDisplay();
  renderMatches();
  renderLiveMatches();
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

// --- MATCH RENDERING ---
function renderMatches() {
  const container = document.getElementById('matchesContainer');
  if (!container) return;

  const filtered = STATE.currentSportFilter === 'all'
    ? MATCHES_DATA
    : MATCHES_DATA.filter(m => m.sport === STATE.currentSportFilter);

  const countBadge = document.getElementById('matchCountBadge');
  if (countBadge) countBadge.textContent = `${filtered.length} Events`;

  container.innerHTML = filtered.map(m => generateMatchCardHTML(m)).join('');
}

function renderLiveMatches() {
  const container = document.getElementById('liveMatchesContainer');
  if (!container) return;
  const liveList = MATCHES_DATA.filter(m => m.isLive);
  container.innerHTML = liveList.map(m => generateMatchCardHTML(m)).join('');
}

function generateMatchCardHTML(m) {
  const isSelected = (pickType) => {
    return STATE.betslip.selections.some(s => s.matchId === m.id && s.pickType === pickType);
  };

  const statusBadge = m.isLive
    ? `<span class="match-status-badge live"><span class="pulsing-dot"></span> LIVE ${m.time}</span>`
    : `<span class="match-status-badge upcoming">🕒 ${m.time}</span>`;

  const scoreHTML = m.isLive
    ? `<div class="team-score">${m.homeScore} - ${m.awayScore}</div>`
    : `<div class="team-score" style="color:var(--text-dim);font-size:12px;">VS</div>`;

  return `
    <div class="match-card" id="card_${m.id}">
      <div class="match-header-row">
        <span class="match-league">${m.leagueIcon} ${m.league}</span>
        <div class="match-header-actions">
          ${m.isLive ? `<button class="btn-live-stream-badge" onclick="watchMatchStream('${m.id}')"><span class="stream-pulse-dot"></span> 📺 Watch Live</button>` : ''}
          ${statusBadge}
        </div>
      </div>
      <div class="match-teams-box">
        <div class="team-row">
          <div class="team-info">
            <span class="team-flag">${m.homeFlag}</span>
            <span>${m.homeTeam}</span>
          </div>
          ${m.isLive ? `<span class="team-score">${m.homeScore}</span>` : ''}
        </div>
        <div class="team-row">
          <div class="team-info">
            <span class="team-flag">${m.awayFlag}</span>
            <span>${m.awayTeam}</span>
          </div>
          ${m.isLive ? `<span class="team-score">${m.awayScore}</span>` : ''}
        </div>
      </div>
      <div class="odds-row">
        <button class="btn-odd ${isSelected('1') ? 'selected' : ''}" id="odd_${m.id}_1" onclick="toggleOddSelection('${m.id}', '1', 'Home (${m.homeTeam})', ${m.odds.home})">
          <span class="odd-type">1</span>
          <span class="odd-val" id="val_${m.id}_home">${m.odds.home.toFixed(2)}</span>
        </button>
        ${m.odds.draw > 0 ? `
          <button class="btn-odd ${isSelected('X') ? 'selected' : ''}" id="odd_${m.id}_X" onclick="toggleOddSelection('${m.id}', 'X', 'Draw (X)', ${m.odds.draw})">
            <span class="odd-type">X</span>
            <span class="odd-val" id="val_${m.id}_draw">${m.odds.draw.toFixed(2)}</span>
          </button>
        ` : `
          <button class="btn-odd" style="opacity:0.4;cursor:not-allowed;">
            <span class="odd-type">-</span>
            <span class="odd-val">-</span>
          </button>
        `}
        <button class="btn-odd ${isSelected('2') ? 'selected' : ''}" id="odd_${m.id}_2" onclick="toggleOddSelection('${m.id}', '2', 'Away (${m.awayTeam})', ${m.odds.away})">
          <span class="odd-type">2</span>
          <span class="odd-val" id="val_${m.id}_away">${m.odds.away.toFixed(2)}</span>
        </button>
      </div>
      <div class="odds-row secondary-odds">
        <button class="btn-odd ${isSelected('O25') ? 'selected' : ''}" id="odd_${m.id}_O25" onclick="toggleOddSelection('${m.id}', 'O25', 'Over 2.5 Goals', ${m.odds.over25})">
          <span class="odd-type">Total Over 2.5</span>
          <span class="odd-val">${m.odds.over25.toFixed(2)}</span>
        </button>
        <button class="btn-odd ${isSelected('U25') ? 'selected' : ''}" id="odd_${m.id}_U25" onclick="toggleOddSelection('${m.id}', 'U25', 'Under 2.5 Goals', ${m.odds.under25})">
          <span class="odd-type">Total Under 2.5</span>
          <span class="odd-val">${m.odds.under25.toFixed(2)}</span>
        </button>
      </div>
    </div>
  `;
}

// --- LIVE ODDS SIMULATION (Fluctuates realistic 1xBet odds) ---
function startLiveOddsSimulation() {
  setInterval(() => {
    const liveMatches = MATCHES_DATA.filter(m => m.isLive);
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

  const match = MATCHES_DATA.find(m => m.id === matchId);
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
  renderMatches();
  renderLiveMatches();
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
  STATE.betslip.selections = [
    { matchId: "m_1", matchName: "Real Madrid vs Man City", pickType: "1", pickName: "Real Madrid (1)", odds: 1.85 },
    { matchId: "m_2", matchName: "Arsenal vs Liverpool", pickType: "1", pickName: "Arsenal (1)", odds: 2.10 },
    { matchId: "m_3", matchName: "LA Lakers vs Boston Celtics", pickType: "1", pickName: "LA Lakers (1)", odds: 1.65 }
  ];
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

// --- 1xTV REAL-TIME LIVE STREAMING AUTO-FINDER ---
let currentStreamMatchId = 'm_1';

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
      if (iframe) iframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query + ' live')}&autoplay=1`;
      if (overlay) overlay.classList.remove('active');
    }
  } catch (e) {
    if (iframe) iframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query + ' live')}&autoplay=1`;
    if (overlay) overlay.classList.remove('active');
  }
}

function watchMatchStream(matchId) {
  triggerHaptic('medium');
  sounds.playClick();
  switchTab('stream');
  switchStreamMatch(matchId);
}

function switchStreamMatch(matchId) {
  triggerHaptic('light');
  currentStreamMatchId = matchId;

  // Update active pill button
  document.querySelectorAll('.stream-chan-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes(`'${matchId}'`));
  });

  const match = MATCHES_DATA.find(m => m.id === matchId) || MATCHES_DATA[0];

  // Auto-find real-time live stream for this match!
  autoFindLiveStream(`${match.homeTeam} vs ${match.awayTeam}`);

  // Update overlay score
  const scoreBadge = document.getElementById('streamMatchPill');
  if (scoreBadge) {
    scoreBadge.textContent = `${match.leagueIcon} ${match.homeTeam} ${match.homeScore ?? 0} - ${match.awayScore ?? 0} ${match.awayTeam} (${match.time})`;
  }

  // Update stats teams
  const homeLbl = document.getElementById('statHomeTeam');
  const awayLbl = document.getElementById('statAwayTeam');
  if (homeLbl) homeLbl.textContent = match.homeTeam;
  if (awayLbl) awayLbl.textContent = match.awayTeam;

  const titleEl = document.getElementById('streamBettingTitle');
  if (titleEl) titleEl.textContent = `⚡ In-Play Live Odds (${match.homeTeam} vs ${match.awayTeam})`;

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
  if (!container) return;

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

// Initialize default stream odds and start default auto-find
setTimeout(() => {
  const defaultMatch = MATCHES_DATA[0];
  if (defaultMatch) {
    renderStreamOdds(defaultMatch);
    autoFindLiveStream(`${defaultMatch.homeTeam} vs ${defaultMatch.awayTeam}`);
  }
}, 600);
