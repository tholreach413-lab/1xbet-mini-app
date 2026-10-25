'use strict';

/**
 * Transparent, data-driven odds engine.
 *
 * These are the platform's OWN model prices, computed from real match state
 * (live score, match minute, best-of series score, and world ranking when the
 * provider supplies it). They are NOT scraped from, or claimed to be, a licensed
 * sportsbook's live lines. Finished matches never carry odds.
 *
 * Football: Poisson goal model -> 1 / X / 2.
 * Mobile Legends: per-map win probability -> best-of series race -> 1 / 2.
 */

const FOOTBALL_MARGIN = 1.08;
const MLBB_MARGIN = 1.06;
const MIN_PRICE = 1.01;
const MAX_PRICE = 51;
const MAX_GOALS = 10;

const FACTORIALS = (() => {
  const values = [1];
  for (let i = 1; i <= MAX_GOALS + 2; i += 1) values[i] = values[i - 1] * i;
  return values;
})();

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / FACTORIALS[k];
}

function priceFromProbability(probability, margin) {
  if (!Number.isFinite(probability) || probability <= 0) return MAX_PRICE;
  const price = 1 / (probability * margin);
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, Math.round(price * 100) / 100));
}

function parseFootballMinute(match) {
  if (!match.isLive) return 0;
  const period = String(match.period || match.time || '').trim().toUpperCase();
  const numeric = period.match(/(\d{1,3})/);
  if (numeric) return Math.min(120, Math.max(1, Number.parseInt(numeric[1], 10)));
  if (period.includes('HT')) return 45;
  if (period.includes('2H')) return 60;
  if (period.includes('1H')) return 25;
  if (/(ET|P|BT)/.test(period)) return 100;
  return 45;
}

function computeFootballMarkets(match) {
  const homeScore = Number.isFinite(Number(match.homeScore)) ? Number(match.homeScore) : 0;
  const awayScore = Number.isFinite(Number(match.awayScore)) ? Number(match.awayScore) : 0;
  const minute = parseFootballMinute(match);
  const remaining = Math.min(1, Math.max(0.02, (90 - minute) / 90));

  // Expected remaining goals, with a modest home-field tilt.
  const lambdaHome = 1.5 * remaining;
  const lambdaAway = 1.2 * remaining;

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let i = 0; i <= MAX_GOALS; i += 1) {
    const ph = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= MAX_GOALS; j += 1) {
      const joint = ph * poissonPmf(j, lambdaAway);
      const finalHome = homeScore + i;
      const finalAway = awayScore + j;
      if (finalHome > finalAway) pHome += joint;
      else if (finalHome === finalAway) pDraw += joint;
      else pAway += joint;
    }
  }

  const total = pHome + pDraw + pAway || 1;
  pHome /= total;
  pDraw /= total;
  pAway /= total;

  return [
    { id: '1', label: '1', pick: match.homeTeam, price: priceFromProbability(pHome, FOOTBALL_MARGIN) },
    { id: 'X', label: 'X', pick: 'Draw', price: priceFromProbability(pDraw, FOOTBALL_MARGIN) },
    { id: '2', label: '2', pick: match.awayTeam, price: priceFromProbability(pAway, FOOTBALL_MARGIN) }
  ];
}

function parseBestOf(match) {
  const raw = String(match.bo || '').match(/(\d+)/);
  const games = raw ? Number.parseInt(raw[1], 10) : 3;
  return games >= 1 ? games : 3;
}

function perMapHomeProbability(match) {
  const homeRank = Number(match.homeRank);
  const awayRank = Number(match.awayRank);
  if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank) || homeRank <= 0 || awayRank <= 0) {
    return 0.5;
  }
  // Lower world ranking number = stronger team. Keep the edge deliberately modest;
  // esports maps are volatile, so cap the per-map advantage at ~65/35.
  const probability = 1 / (1 + Math.exp(-(awayRank - homeRank) / 40));
  return Math.min(0.65, Math.max(0.35, probability));
}

function seriesWinProbability(needHome, needAway, perMap, memo = new Map()) {
  if (needHome <= 0) return 1;
  if (needAway <= 0) return 0;
  const key = `${needHome},${needAway}`;
  if (memo.has(key)) return memo.get(key);
  const value = perMap * seriesWinProbability(needHome - 1, needAway, perMap, memo)
    + (1 - perMap) * seriesWinProbability(needHome, needAway - 1, perMap, memo);
  memo.set(key, value);
  return value;
}

function computeMlbbMarkets(match) {
  const games = parseBestOf(match);
  const winTarget = Math.ceil(games / 2);
  const homeWon = Number.isFinite(Number(match.homeScore)) ? Number(match.homeScore) : 0;
  const awayWon = Number.isFinite(Number(match.awayScore)) ? Number(match.awayScore) : 0;
  const needHome = Math.max(0, winTarget - homeWon);
  const needAway = Math.max(0, winTarget - awayWon);
  const perMap = perMapHomeProbability(match);

  const pHome = Math.min(0.999, Math.max(0.001, seriesWinProbability(needHome, needAway, perMap)));
  const pAway = 1 - pHome;

  return [
    { id: '1', label: '1', pick: match.homeTeam, price: priceFromProbability(pHome, MLBB_MARGIN) },
    { id: '2', label: '2', pick: match.awayTeam, price: priceFromProbability(pAway, MLBB_MARGIN) }
  ];
}

function decorate(match) {
  if (!match || match.isFinished) {
    if (match) {
      match.markets = [];
      match.odds = null;
      match.oddsAvailable = false;
    }
    return match;
  }

  let markets = [];
  if (match.sport === 'football') markets = computeFootballMarkets(match);
  else if (match.sport === 'mlbb') markets = computeMlbbMarkets(match);

  const valid = markets.every(market => market.pick && Number.isFinite(market.price));
  if (!valid || markets.length === 0) {
    match.markets = [];
    match.odds = null;
    match.oddsAvailable = false;
    return match;
  }

  match.markets = markets;
  match.odds = Object.fromEntries(markets.map(market => [market.id, market.price]));
  match.oddsAvailable = true;
  return match;
}

function findMarket(match, marketId) {
  if (!match || !Array.isArray(match.markets)) return null;
  return match.markets.find(market => market.id === marketId) || null;
}

function settleSelection(match, marketId) {
  if (!match || !match.isFinished) return 'pending';
  const homeScore = Number(match.homeScore);
  const awayScore = Number(match.awayScore);

  if (match.sport === 'football') {
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return 'pending';
    const outcome = homeScore > awayScore ? '1' : awayScore > homeScore ? '2' : 'X';
    return marketId === outcome ? 'won' : 'lost';
  }

  // MLBB two-way market.
  const winner = String(match.winner || '').toLowerCase().trim();
  if (!winner) return 'pending';
  const homeName = String(match.homeTeam || '').toLowerCase().trim();
  const awayName = String(match.awayTeam || '').toLowerCase().trim();
  if (marketId === '1') return winner === homeName ? 'won' : 'lost';
  if (marketId === '2') return winner === awayName ? 'won' : 'lost';
  return 'lost';
}

module.exports = {
  decorate,
  findMarket,
  settleSelection,
  computeFootballMarkets,
  computeMlbbMarkets
};
