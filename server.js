require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { createMobileLegendsFeed } = require('./mlbb-feed');

const app = express();
const PORT = process.env.PORT || 5000;
const BOT_TOKEN = process.env.BOT_TOKEN;
let WEBAPP_URL = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || '';

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Simple In-memory User and Transaction Store
const userStore = new Map();

// Helper to get or create user
function getUser(tgId, userInfo = {}) {
  if (!userStore.has(tgId)) {
    userStore.set(tgId, {
      id: tgId,
      name: userInfo.first_name ? `${userInfo.first_name} ${userInfo.last_name || ''}`.trim() : 'VIP Player',
      username: userInfo.username || `user_${tgId}`,
      balance: 1250.00,
      vipTier: 'VIP PRO',
      bets: []
    });
  }
  return userStore.get(tgId);
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    appName: '1xBet Official Mini App',
    time: new Date().toISOString(),
    webappUrl: WEBAPP_URL,
    botUsername: process.env.BOT_USERNAME || 'Checkaccount123_bot'
  });
});

// High-Speed Team Logo Proxy (Bypasses hotlinking/Referer 403 blocks for Liquipedia & official tournament crests)
const logoCache = new Map();
app.get('/api/logo-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Invalid url');
  }

  if (logoCache.has(targetUrl)) {
    const cached = logoCache.get(targetUrl);
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    return res.send(cached.buffer);
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream error');
    }
    const contentType = upstream.headers.get('content-type') || 'image/png';
    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (logoCache.size < 600) {
      logoCache.set(targetUrl, { contentType, buffer });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    res.send(buffer);
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});

// Dynamic Real-Time Sports Matches & Odds Cache from LiveScore.com
// Dynamic Real-Time Sports Matches & Odds Cache from LiveScore.com & GosuGamers
let cachedMatches = [];
let lastMatchesFetch = 0;

async function fetchFromLiveScore() {
  const tzOffset = 7 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() + tzOffset);
  
  const formatYMD = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const dYesterday = new Date(localNow.getTime() - 86400000);
  const dToday = localNow;
  const dTomorrow = new Date(localNow.getTime() + 86400000);
  const dPlus2 = new Date(localNow.getTime() + 2 * 86400000);

  const ymdYesterday = formatYMD(dYesterday);
  const ymdToday = formatYMD(dToday);
  const ymdTomorrow = formatYMD(dTomorrow);
  const ymdPlus2 = formatYMD(dPlus2);

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  // Fetch Soccer, Basketball, and Tennis live & daily schedules
  const [
    socLive, socYest, socToday, socTom, socPlus2,
    bballLive, bballToday, bballYest,
    tennisLive, tennisToday, tennisYest
  ] = await Promise.allSettled([
    // Soccer
    fetch('https://prod-public-api.livescore.com/v1/api/app/live/soccer/0.00', { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${ymdYesterday}/7.00`, { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${ymdToday}/7.00`, { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${ymdTomorrow}/7.00`, { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${ymdPlus2}/7.00`, { headers }),
    // Basketball (NBA, EuroLeague, etc.)
    fetch('https://prod-public-api.livescore.com/v1/api/app/live/basketball/0.00', { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/basketball/${ymdToday}/7.00`, { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/basketball/${ymdYesterday}/7.00`, { headers }),
    // Tennis (ATP, WTA, Challengers)
    fetch('https://prod-public-api.livescore.com/v1/api/app/live/tennis/0.00', { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/tennis/${ymdToday}/7.00`, { headers }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/tennis/${ymdYesterday}/7.00`, { headers })
  ]);

  const matches = [];
  const seenIds = new Set();
  const TOP_LEAGUES = [
    'Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1',
    'UEFA Champions League', 'UEFA Europa League', 'Coupe de France', 'FA Cup', 'EFL Cup', 'Copa del Rey',
    'NBA', 'EuroLeague', 'ATP', 'WTA'
  ];

  function parseStages(stages, sportType = 'football', isLiveForced = false, dayLabel = 'Today', fallbackDate = '') {
    const sportNameMap = {
      football: 'Football',
      basketball: 'Basketball',
      tennis: 'Tennis'
    };
    const iconMap = {
      football: '⚽',
      basketball: '🏀',
      tennis: '🎾'
    };

    for (const stage of stages || []) {
      const rawLeague = stage.Snm || sportNameMap[sportType] || 'Match';
      const country = stage.Cnm || '';
      for (const ev of stage.Events || []) {
        const uniqueId = `ls_${sportType}_${ev.Eid}`;
        if (seenIds.has(uniqueId)) continue;
        seenIds.add(uniqueId);

        const homeName = ev.T1?.[0]?.Nm || 'Home';
        const awayName = ev.T2?.[0]?.Nm || 'Away';
        const homeImg = ev.T1?.[0]?.Img ? `https://lsm-static-prod.livescore.com/medium/${ev.T1[0].Img}` : '';
        const awayImg = ev.T2?.[0]?.Img ? `https://lsm-static-prod.livescore.com/medium/${ev.T2[0].Img}` : '';

        // Real kickoff time and date from LiveScore Esd (YYYYMMDDHHMMSS)
        const esdStr = String(ev.Esd || '');
        let kickoffTime = '';
        let matchDateStr = fallbackDate;
        if (esdStr.length >= 12) {
          const hh = esdStr.slice(8, 10);
          const mm = esdStr.slice(10, 12);
          kickoffTime = `${hh}:${mm}`;
          const evMonthNum = parseInt(esdStr.slice(4, 6), 10);
          const evDayNum = parseInt(esdStr.slice(6, 8), 10);
          const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          matchDateStr = `${evDayNum} ${months[evMonthNum] || ''}`;
        }

        const epsStr = String(ev.Eps || '').toUpperCase();
        const isLive = isLiveForced || ['1H', '2H', 'HT', 'ET', 'P', 'BT', '1Q', '2Q', '3Q', '4Q', 'OT', 'S1', 'S2', 'S3', 'S4', 'S5'].includes(epsStr) || (typeof ev.Eps === 'string' && ev.Eps.includes("'"));
        const isFinished = dayLabel === 'Yesterday' || ['FT', 'AET', 'AP', 'AOT', 'ENDED', 'FINISHED'].includes(epsStr);
        const isTop = TOP_LEAGUES.some(l => rawLeague.toLowerCase().includes(l.toLowerCase()) || country.toLowerCase().includes(l.toLowerCase()));

        let timeDisplay = kickoffTime || 'VS';
        if (isLive) {
          timeDisplay = ev.Eps || 'LIVE';
        } else if (isFinished) {
          timeDisplay = 'FT';
        } else if (ev.Eps && ev.Eps !== 'NS') {
          timeDisplay = ev.Eps;
        } else if (kickoffTime) {
          timeDisplay = kickoffTime;
        }

        // Realistic sport odds
        let homeOdd = 1.85;
        let drawOdd = sportType === 'football' ? 3.30 : 0;
        let awayOdd = 1.95;
        const seed = parseInt(String(ev.Eid).slice(-3) || '10', 10);
        if (sportType === 'football') {
          homeOdd = +(1.45 + (seed % 10) * 0.15).toFixed(2);
          drawOdd = +(3.10 + (seed % 7) * 0.12).toFixed(2);
          awayOdd = +(1.85 + (seed % 13) * 0.18).toFixed(2);
        } else if (sportType === 'basketball') {
          homeOdd = +(1.55 + (seed % 8) * 0.10).toFixed(2);
          drawOdd = 0;
          awayOdd = +(1.75 + (seed % 9) * 0.11).toFixed(2);
        } else {
          homeOdd = +(1.40 + (seed % 7) * 0.14).toFixed(2);
          drawOdd = 0;
          awayOdd = +(1.80 + (seed % 8) * 0.15).toFixed(2);
        }

        matches.push({
          id: uniqueId,
          sport: sportType,
          sportName: sportNameMap[sportType] || 'Sport',
          league: country ? `${country} - ${rawLeague}` : rawLeague,
          rawLeague: rawLeague,
          country: country,
          leagueIcon: iconMap[sportType] || '⚽',
          isLive,
          isFinished,
          isTop,
          day: isLive ? 'LIVE' : dayLabel,
          dateStr: matchDateStr,
          time: timeDisplay,
          kickoffTime: kickoffTime || timeDisplay,
          homeTeam: homeName,
          homeLogo: homeImg,
          homeScore: ev.Tr1 !== undefined ? parseInt(ev.Tr1) : null,
          awayTeam: awayName,
          awayLogo: awayImg,
          awayScore: ev.Tr2 !== undefined ? parseInt(ev.Tr2) : null,
          winner: (isFinished && ev.Tr1 !== undefined && ev.Tr2 !== undefined) ? (parseInt(ev.Tr1) > parseInt(ev.Tr2) ? homeName : (parseInt(ev.Tr2) > parseInt(ev.Tr1) ? awayName : 'Draw')) : undefined,
          odds: {
            home: homeOdd,
            draw: drawOdd,
            away: awayOdd
          }
        });
      }
    }
  }

  // Helper to extract stages
  const extractStages = async (promiseRes) => {
    if (promiseRes.status === 'fulfilled' && promiseRes.value.ok) {
      try {
        const d = await promiseRes.value.json();
        return d.Stages || [];
      } catch (_) {}
    }
    return [];
  };

  // 1. Live Football
  parseStages(await extractStages(socLive), 'football', true, 'LIVE');
  // 2. Live Basketball
  parseStages(await extractStages(bballLive), 'basketball', true, 'LIVE');
  // 3. Live Tennis
  parseStages(await extractStages(tennisLive), 'tennis', true, 'LIVE');

  // 4. Today's Matches (Football, Basketball, Tennis)
  parseStages(await extractStages(socToday), 'football', false, 'Today');
  parseStages(await extractStages(bballToday), 'basketball', false, 'Today');
  parseStages(await extractStages(tennisToday), 'tennis', false, 'Today');

  // 5. Tomorrow's Matches
  parseStages(await extractStages(socTom), 'football', false, 'Tomorrow');

  // 6. Upcoming Days
  parseStages(await extractStages(socPlus2), 'football', false, 'Upcoming');

  // 7. Results (Yesterday Completed Matches)
  parseStages(await extractStages(socYest), 'football', false, 'Yesterday');
  parseStages(await extractStages(bballYest), 'basketball', false, 'Yesterday');
  parseStages(await extractStages(tennisYest), 'tennis', false, 'Yesterday');

  // Sort: Live matches first, then Top leagues, then others
  matches.sort((a, b) => {
    if (a.isLive !== b.isLive) return b.isLive ? 1 : -1;
    if (a.isTop !== b.isTop) return b.isTop ? 1 : -1;
    return 0;
  });

  return matches;
}

const mobileLegendsFeed = createMobileLegendsFeed();
let cachedMlbbMatches = [];

async function fetchMobileLegendsMatches() {
  const freshMatches = await mobileLegendsFeed.getMatches();
  if (freshMatches.length > 0) cachedMlbbMatches = freshMatches;
  return cachedMlbbMatches;
}

let isFetchingMatches = false;
let cachedLiveScoreMatches = [];
let lastLiveScoreFetch = 0;

async function refreshMatchesBackground() {
  if (isFetchingMatches) return cachedMatches;
  isFetchingMatches = true;
  try {
    const now = Date.now();
    const shouldRefreshLiveScore = cachedLiveScoreMatches.length === 0 || now - lastLiveScoreFetch >= 15000;
    const liveScorePromise = shouldRefreshLiveScore
      ? fetchFromLiveScore()
          .then(matches => {
            if (matches.length > 0) {
              cachedLiveScoreMatches = matches;
              lastLiveScoreFetch = Date.now();
            }
            return cachedLiveScoreMatches;
          })
          .catch(error => {
            console.warn('LiveScore refresh notice:', error.message);
            return cachedLiveScoreMatches;
          })
      : Promise.resolve(cachedLiveScoreMatches);

    const [liveScoreMatches, mlbbMatches] = await Promise.all([
      liveScorePromise,
      fetchMobileLegendsMatches().catch(error => {
        console.warn('MLBB refresh notice:', error.message);
        return cachedMlbbMatches;
      })
    ]);

    const combined = [...(liveScoreMatches || []), ...(mlbbMatches || [])];
    if (combined.length > 0) {
      cachedMatches = combined;
      lastMatchesFetch = Date.now();
    }
    return cachedMatches;
  } catch (err) {
    console.warn('Background matches refresh notice:', err.message);
    return cachedMatches;
  } finally {
    isFetchingMatches = false;
  }
}

// Serve the latest completed snapshot while a single background refresh keeps it current.
app.get('/api/matches', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const now = Date.now();
    const hasLiveMlbb = cachedMatches.some(match => match.sport === 'mlbb' && match.isLive);
    const refreshAfter = hasLiveMlbb ? 4000 : 15000;
    if (cachedMatches.length === 0 || now - lastMatchesFetch >= refreshAfter) {
      refreshMatchesBackground();
    }

    const requestedSport = String(req.query.sport || '').toLowerCase();
    const matches = requestedSport
      ? cachedMatches.filter(match => match.sport === requestedSport)
      : cachedMatches;

    const sourceUpdatedAt = Math.max(lastLiveScoreFetch, mobileLegendsFeed.getLastRefresh());
    res.json({
      success: true,
      count: matches.length,
      matches,
      updatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt).toISOString() : null,
      refreshing: isFetchingMatches
    });
  } catch (err) {
    res.json({
      success: true,
      count: cachedMlbbMatches.length,
      matches: cachedMlbbMatches,
      updatedAt: mobileLegendsFeed.getLastRefresh()
        ? new Date(mobileLegendsFeed.getLastRefresh()).toISOString()
        : null,
      refreshing: isFetchingMatches
    });
  }
});

app.get('/api/user/:id', (req, res) => {
  const user = getUser(req.params.id);
  res.json(user);
});

app.post('/api/bet', (req, res) => {
  const { userId, stake, odds, match, pick, isCombo } = req.body;
  const user = getUser(userId || 'default');

  if (user.balance < stake) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  user.balance -= stake;
  const betTicket = {
    id: `1X-${Math.floor(10000 + Math.random() * 90000)}`,
    date: new Date().toLocaleTimeString(),
    match,
    pick,
    odds,
    stake,
    potentialWin: +(stake * odds).toFixed(2),
    status: 'open'
  };
  user.bets.unshift(betTicket);

  res.json({ success: true, balance: user.balance, ticket: betTicket });
});

app.post('/api/deposit', (req, res) => {
  const { userId, amount, method } = req.body;
  const user = getUser(userId || 'default');
  user.balance += parseFloat(amount) || 0;

  res.json({
    success: true,
    message: `Deposited $${amount} via ${method || 'PayLink Bank'}`,
    balance: user.balance
  });
});

// PayLink Bank KHQR Real Gateway Endpoints
app.post('/api/paylink/generate-qr', async (req, res) => {
  try {
    const { amount, userId } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid deposit amount' });
    }

    const apiKey = process.env.PAYLINK_API_KEY || 'plk_live_std_e7189b177d21';
    const merchant = process.env.MERCHANT_NAME || 'hut_soksitchey1@aclb';
    const baseUrl = (process.env.PAYLINK_BASE_URL || 'https://paylinkapi-bot.onrender.com/').replace(/\/$/, '');

    const gatewayUrl = `${baseUrl}/api/aba/generate-qr`;
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        amount: numAmount,
        currency: 'USD',
        merchantName: merchant
      })
    });

    const data = await response.json();
    if (!data.success && !data.qrString) {
      return res.status(502).json({ success: false, error: data.message || 'Payment gateway connection error' });
    }

    res.json({
      success: true,
      bank: data.bank || 'BAKONG',
      tranId: data.tranId || data.transactionId,
      amount: numAmount,
      amountFormatted: numAmount.toFixed(2),
      currency: 'USD',
      merchantName: data.merchantName || merchant,
      qrString: data.qrString,
      md5: data.md5,
      deepLink: data.deepLink || data.deeplink,
      status: data.status || 'PENDING'
    });
  } catch (err) {
    console.error('PayLink generate-qr error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/paylink/check-payment', async (req, res) => {
  try {
    const { tranId, md5, userId, amount } = req.body;
    const apiKey = process.env.PAYLINK_API_KEY || 'plk_live_std_e7189b177d21';
    const baseUrl = (process.env.PAYLINK_BASE_URL || 'https://paylinkapi-bot.onrender.com/').replace(/\/$/, '');

    const checkUrl = `${baseUrl}/api/aba/check-payment`;
    const response = await fetch(checkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ tranId, md5 })
    });

    const data = await response.json();
    if (data.paid === true) {
      const user = getUser(userId || 'default');
      const creditAmount = parseFloat(amount) || 0;
      if (creditAmount > 0) {
        user.balance += creditAmount;
      }
      return res.json({
        success: true,
        paid: true,
        status: 'PAID',
        balance: user.balance,
        message: 'Payment confirmed and funds credited!'
      });
    }

    res.json({
      success: true,
      paid: false,
      status: data.status || 'PENDING'
    });
  } catch (err) {
    console.error('PayLink check-payment error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/paylink/confirm-instant', (req, res) => {
  const { userId, amount, tranId } = req.body;
  const user = getUser(userId || 'default');
  const creditAmount = parseFloat(amount) || 20.00;
  user.balance += creditAmount;

  res.json({
    success: true,
    paid: true,
    balance: user.balance,
    tranId: tranId || `PLK-${Date.now()}`,
    message: `Successfully credited $${creditAmount.toFixed(2)} via PayLink Bank`
  });
});

// Real-Time Live Video Stream Auto-Finder (YouTube First -> Website Fallback Engine)
app.get('/api/stream/find', async (req, res) => {
  const query = req.query.q || '';
  const matchId = req.query.matchId || '';
  const channel = req.query.channel || '';
  const sport = req.query.sport || '';
  const clientHost = req.headers.host || 'localhost';

  // 1. Check if match is in cache to extract exact metadata
  let match = null;
  if (matchId) {
    match = (cachedMatches || []).find(m => m.id === matchId);
  }
  if (!match && query) {
    const qLower = query.toLowerCase();
    match = (cachedMatches || []).find(m => 
      `${m.homeTeam} vs ${m.awayTeam}`.toLowerCase().includes(qLower) ||
      qLower.includes(m.homeTeam?.toLowerCase() || '---')
    );
  }

  const home = match?.homeTeam || '';
  const away = match?.awayTeam || '';
  const league = match?.league || match?.rawLeague || '';
  const streamChannel = channel || match?.streamChannel || match?.streamInfo?.channel || '';
  const isMlbb = sport === 'mlbb' || match?.sport === 'mlbb' || query.toLowerCase().includes('mobile legends') || query.toLowerCase().includes('mpl') || query.toLowerCase().includes('msl');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  async function searchYouTube(q, liveOnly = true) {
    if (!q) return null;
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}${liveOnly ? '&sp=EgJAAQ%253D%253D' : ''}`;
      const response = await fetch(url, { headers });
      if (!response.ok) return null;
      const html = await response.text();
      const videoMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
      const uniqueIds = [...new Set(videoMatches.map(m => m[1]))];
      if (uniqueIds.length > 0) {
        return {
          videoId: uniqueIds[0],
          allIds: uniqueIds.slice(0, 4)
        };
      }
    } catch (e) {
      console.warn('YT query note:', e.message);
    }
    return null;
  }

  try {
    // --- STEP 1: SEARCH YOUTUBE FIRST ---
    const ytQueries = [];
    if (streamChannel) {
      ytQueries.push({ q: `${streamChannel} live`, live: true, label: `${streamChannel} Official Live` });
    }
    if (home && away) {
      ytQueries.push({ q: `${home} vs ${away} live`, live: true, label: `${home} vs ${away} Live Match` });
    }
    if (league) {
      ytQueries.push({ q: `${league} live stream`, live: true, label: `${league} Live Tournament` });
    }
    if (query && !ytQueries.some(item => item.q.toLowerCase().includes(query.toLowerCase()))) {
      ytQueries.push({ q: `${query} live`, live: true, label: `${query} Live` });
    }
    if (isMlbb) {
      ytQueries.push({ q: `Mobile Legends Bang Bang live match tournament`, live: true, label: `MLBB Championship Live` });
    }

    let foundYt = null;
    let foundLabel = '';
    const exactVideoId = match?.streamInfo?.videoId;
    if (exactVideoId && /^[a-zA-Z0-9_-]{11}$/.test(exactVideoId)) {
      foundYt = { videoId: exactVideoId, allIds: [exactVideoId] };
      foundLabel = `${streamChannel || 'Official MLBB'} Live`;
    } else {
      for (const item of ytQueries) {
        const resYt = await searchYouTube(item.q, item.live);
        if (resYt && resYt.videoId) {
          foundYt = resYt;
          foundLabel = item.label;
          break;
        }
      }
    }

    // Prepare Website fallback sources (Twitch and Official Web streams)
    const twitchChannel = streamChannel?.toLowerCase().includes('philippines') ? 'mpl_ph'
      : streamChannel?.toLowerCase().includes('singapore') ? 'mpl_sg'
      : streamChannel?.toLowerCase().includes('indonesia') ? 'mpl_id'
      : isMlbb ? 'mpl_ph'
      : 'esl_mobile';

    const webSources = [
      {
        type: 'twitch',
        name: `Twitch Esports (${twitchChannel.toUpperCase()})`,
        embedUrl: `https://player.twitch.tv/?channel=${twitchChannel}&parent=${clientHost.split(':')[0]}&autoplay=true&muted=false`
      },
      {
        type: 'website',
        name: 'Official Esports Portal',
        embedUrl: `https://www.gosugamers.net/mobile-legends/matches`
      }
    ];

    if (foundYt) {
      return res.json({
        success: true,
        found: true,
        isLive: true,
        source: 'youtube',
        sourceLabel: `🔴 YouTube Live (${foundLabel})`,
        videoId: foundYt.videoId,
        embedUrl: `https://www.youtube.com/embed/${foundYt.videoId}?autoplay=1&mute=0&playsinline=1&rel=0`,
        availableSources: [
          {
            type: 'youtube',
            name: `YouTube Official Live`,
            embedUrl: `https://www.youtube.com/embed/${foundYt.videoId}?autoplay=1&mute=0&playsinline=1&rel=0`,
            videoId: foundYt.videoId
          },
          ...webSources
        ]
      });
    }

    // Check YouTube general broadcast/replay as secondary YouTube try
    if (home && away) {
      const replay = await searchYouTube(`${home} vs ${away} Mobile Legends match`, false);
      if (replay && replay.videoId) {
        return res.json({
          success: true,
          found: true,
          isLive: false,
          source: 'youtube_broadcast',
          sourceLabel: `📹 YouTube Match Broadcast (${home} vs ${away})`,
          videoId: replay.videoId,
          embedUrl: `https://www.youtube.com/embed/${replay.videoId}?autoplay=1&mute=0&playsinline=1&rel=0`,
          availableSources: [
            {
              type: 'youtube',
              name: `YouTube Broadcast Video`,
              embedUrl: `https://www.youtube.com/embed/${replay.videoId}?autoplay=1&mute=0&playsinline=1&rel=0`,
              videoId: replay.videoId
            },
            ...webSources
          ]
        });
      }
    }

    // --- STEP 2: NOT FOUND ON YOUTUBE -> GO FIND IN WEBSITE! ---
    return res.json({
      success: true,
      found: true,
      isLive: true,
      source: 'website',
      sourceLabel: `🌐 Official Web Broadcast (${twitchChannel.toUpperCase()})`,
      embedUrl: webSources[0].embedUrl,
      platform: 'twitch',
      availableSources: webSources
    });

  } catch (err) {
    const defaultTwitch = isMlbb ? 'mpl_ph' : 'esl_mobile';
    res.json({
      success: true,
      found: true,
      isLive: true,
      source: 'website',
      sourceLabel: '🌐 Official Web Broadcast',
      embedUrl: `https://player.twitch.tv/?channel=${defaultTwitch}&parent=${clientHost.split(':')[0]}&autoplay=true`,
      error: err.message
    });
  }
});

// Fallback: serve frontend index.html for all non-API GET requests
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`⚽ 1xBet Mini App Server running on http://0.0.0.0:${PORT}`);
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌐 Render External URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
  console.log(`====================================================`);

  // Pre-cache matches on server boot, then keep live MLBB scores warm for all clients.
  refreshMatchesBackground().then(() => {
    console.log(`📡 Pre-cached ${cachedMatches.length} matches (${cachedMlbbMatches.length} MLBB)`);
  }).catch(err => {
    console.warn('Initial matches pre-cache notice:', err.message);
  });

  const matchRefreshTimer = setInterval(refreshMatchesBackground, 5000);
  matchRefreshTimer.unref?.();
});

// Setup Telegram Bot
let bot = null;
if (BOT_TOKEN && !BOT_TOKEN.includes('REPLACE')) {
  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });

    bot.on('polling_error', (err) => {
      if (err.message && err.message.includes('409 Conflict')) {
        return; // Suppress duplicate instance conflict logs
      }
      console.warn('Bot polling notification:', err.message);
    });

    console.log(`🤖 Telegram Bot connected successfully!`);

    // Helper to build keyboard
    const getBotKeyboard = (appUrl) => {
      const url = appUrl || WEBAPP_URL || `http://localhost:${PORT}`;
      return {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Launch 1xBet Mini App',
                web_app: { url: url }
              }
            ],
            [
              { text: '💳 Instant Deposit', callback_data: 'cmd_deposit' },
              { text: '🎁 200% Bonus', callback_data: 'cmd_bonus' }
            ],
            [
              { text: '🔥 Crash (Aviator)', web_app: { url: url } },
              { text: '💬 Support 24/7', callback_data: 'cmd_support' }
            ]
          ]
        }
      };
    };

    // /start command
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || 'Champion';
      const user = getUser(msg.from.id, msg.from);

      const welcomeText = 
`⚽🔥 *WELCOME TO 1xBET MINI APP* 🔥⚽

Hello *${firstName}*! Experience the world's #1 Sportsbook & Casino directly inside Telegram:

🏆 *LIVE SPORTS BETTING*
• Top odds on Champions League, Premier League, NBA & Tennis
• Real-time match scores & instant bet settlements
• +10% Odds Boost on Accumulator of the Day

🚀 *1xGAMES & CASINO*
• *Aviator Crash*: Cash out up to x10,000 multiplier
• *1xSlots*: Spin the 777 Mega Jackpot
• Roulette, Apple of Fortune & Dice

💳 *INSTANT PAYMENTS*
• PayLink Bank Gateway & Direct Account Transfer
• Telebirr, Mobile Money & USDT TRC20 Crypto
• Instant automated deposits & fast payouts

🎁 *WELCOME PROMOTION:*
Get a *200% First Deposit Match Bonus* on your first transfer!

👇 *Tap the button below to enter the 1xBet Mini App:*`;

      bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        ...getBotKeyboard()
      });
    });

    // Callback queries
    bot.on('callback_query', (query) => {
      const chatId = query.message.chat.id;
      if (query.data === 'cmd_deposit') {
        bot.sendMessage(chatId, `💳 *Deposit Options Available:*\n\n1. *PayLink Bank Gateway* (Instant 0% fee)\n2. *Commercial / Awash Bank Transfer*\n3. *Telebirr Mobile Payment*\n4. *USDT Crypto (TRC20)*\n\nOpen the Mini App to deposit directly into your wallet:`, {
          parse_mode: 'Markdown',
          ...getBotKeyboard()
        });
      } else if (query.data === 'cmd_bonus') {
        bot.sendMessage(chatId, `🎁 *200% Welcome Bonus Activated!*\n\nUse promo code: *1XVIP*\nDeposit any amount from $10 to $500 to double your playing funds instantly!`, {
          parse_mode: 'Markdown',
          ...getBotKeyboard()
        });
      } else if (query.data === 'cmd_support') {
        bot.sendMessage(chatId, `💬 *1xBet Support 24/7*\n\nOur betting and cashier support agents are online 24/7.\nContact @Checkaccount123_bot support desk anytime.`);
      }
      bot.answerCallbackQuery(query.id);
    });

    // Function to configure Menu Button once public URL is known
    bot.updateMenuButtonUrl = async (url) => {
      try {
        await bot.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '⚽ 1xBet App',
            web_app: { url }
          }
        });
        console.log(`✅ Telegram Chat Menu Button updated with URL: ${url}`);
      } catch (err) {
      }
    };

    // Auto-update Telegram Menu Button if public URL is already set (e.g. Render)
    if (WEBAPP_URL) {
      bot.updateMenuButtonUrl(WEBAPP_URL);
    }
  } catch (err) {
    console.error(`Telegram Bot initialization error:`, err.message);
  }
}

// Export for runner
module.exports = { app, server, bot, setWebappUrl: (url) => {
  WEBAPP_URL = url;
  if (bot && bot.updateMenuButtonUrl) {
    bot.updateMenuButtonUrl(url);
  }
}};
