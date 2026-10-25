require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { createMobileLegendsFeed } = require('./mlbb-feed');
const { createFootballFeed } = require('./football-feed');

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
app.get('/index.html', (req, res) => res.redirect(302, '/'));
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'live.html',
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
    appName: '1X Live Match Center',
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

const footballFeed = createFootballFeed();

async function fetchFromLiveScore() {
  return footballFeed.getMatches();
}

const mobileLegendsFeed = createMobileLegendsFeed();
let cachedMlbbMatches = [];

async function fetchMobileLegendsMatches() {
  const freshMatches = await mobileLegendsFeed.getMatches();
  if (freshMatches.length > 0) cachedMlbbMatches = freshMatches;
  return cachedMlbbMatches;
}

let isFetchingMatches = false;
let cachedFootballMatches = [];

async function resolveFeedWithin(promise, fallback, label, timeoutMs = 20000) {
  let timeout;
  const deadline = new Promise(resolve => {
    timeout = setTimeout(() => {
      console.warn(`${label} refresh exceeded ${timeoutMs}ms; serving the last completed snapshot`);
      resolve(fallback);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve(promise).catch(error => {
        console.warn(`${label} refresh notice:`, error.message);
        return fallback;
      }),
      deadline
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshMatchesBackground() {
  if (isFetchingMatches) return cachedMatches;
  isFetchingMatches = true;
  try {
    const [footballMatches, mlbbMatches] = await Promise.all([
      resolveFeedWithin(fetchFromLiveScore(), cachedFootballMatches, 'Football', 12000),
      resolveFeedWithin(fetchMobileLegendsMatches(), cachedMlbbMatches, 'MLBB', 25000)
    ]);

    if (footballMatches.length > 0) cachedFootballMatches = footballMatches;
    if (mlbbMatches.length > 0) cachedMlbbMatches = mlbbMatches;

    const combined = [...cachedFootballMatches, ...cachedMlbbMatches];
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

// Serve Football and Mobile Legends only, from the latest completed provider snapshot.
app.get('/api/matches', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const now = Date.now();
    const hasLiveMatch = cachedMatches.some(match => match.isLive);
    const refreshAfter = hasLiveMatch ? 4000 : 15000;
    if (cachedMatches.length === 0 || now - lastMatchesFetch >= refreshAfter) {
      refreshMatchesBackground();
    }

    const requestedSport = String(req.query.sport || '').toLowerCase();
    const allSportMatches = requestedSport === 'football' || requestedSport === 'mlbb'
      ? cachedMatches.filter(match => match.sport === requestedSport)
      : cachedMatches;
    const summary = {
      total: allSportMatches.length,
      live: allSportMatches.filter(match => match.isLive).length,
      today: allSportMatches.filter(match => match.day === 'Today' || match.isLive).length,
      finished: allSportMatches.filter(match => match.isFinished).length,
      upcoming: allSportMatches.filter(match => !match.isLive && !match.isFinished).length
    };

    const requestedView = String(req.query.view || '').toLowerCase();
    let matches = allSportMatches;
    if (requestedView === 'live') {
      matches = allSportMatches.filter(match => match.isLive);
    } else if (requestedView === 'app' && requestedSport === 'football') {
      const currentWindow = allSportMatches.filter(match =>
        match.isLive || match.day === 'Today' || match.day === 'Tomorrow'
      );
      const currentIds = new Set(currentWindow.map(match => match.id));
      const recentResults = allSportMatches
        .filter(match => match.isFinished && !currentIds.has(match.id))
        .slice(0, 120);
      matches = [...currentWindow, ...recentResults];
    }

    const sourceUpdatedAt = requestedSport === 'football'
      ? footballFeed.getLastRefresh()
      : requestedSport === 'mlbb'
        ? mobileLegendsFeed.getLastRefresh()
        : Math.max(footballFeed.getLastRefresh(), mobileLegendsFeed.getLastRefresh());

    res.json({
      success: true,
      count: matches.length,
      totalCount: allSportMatches.length,
      liveCount: summary.live,
      summary,
      matches,
      updatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt).toISOString() : null,
      refreshing: isFetchingMatches,
      sports: ['football', 'mlbb']
    });
  } catch (err) {
    const requestedSport = String(req.query.sport || '').toLowerCase();
    const fallbackMatches = requestedSport === 'football'
      ? cachedFootballMatches
      : requestedSport === 'mlbb'
        ? cachedMlbbMatches
        : [...cachedFootballMatches, ...cachedMlbbMatches];
    res.json({
      success: true,
      count: fallbackMatches.length,
      liveCount: fallbackMatches.filter(match => match.isLive).length,
      matches: fallbackMatches,
      updatedAt: null,
      refreshing: isFetchingMatches,
      sports: ['football', 'mlbb']
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

// Return only provider-verified broadcasts. Never guess or search for unrelated streams.
app.get('/api/stream/find', (req, res) => {
  const matchId = String(req.query.matchId || '');
  const match = cachedMatches.find(item => item.id === matchId);
  if (!match) {
    return res.status(404).json({
      success: false,
      found: false,
      source: 'tracker',
      message: 'Match was not found in the current verified feed.'
    });
  }

  const stream = match.streamInfo || {};
  const videoId = String(stream.videoId || '');
  const hasVerifiedBroadcast = match.sport === 'mlbb'
    && stream.verified === true
    && stream.isLive === true
    && /^[A-Za-z0-9_-]{11}$/.test(videoId);

  if (hasVerifiedBroadcast) {
    return res.json({
      success: true,
      found: true,
      verified: true,
      isLive: Boolean(stream.isLive),
      isMatchLive: Boolean(match.isLive),
      source: 'youtube',
      sourceLabel: match.isLive ? 'Official match broadcast' : 'Official tournament broadcast',
      videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      sourceUrl: match.sourceUrl || null
    });
  }

  const channels = Array.isArray(match.broadcasts)
    ? match.broadcasts.filter(channel => channel?.name).slice(0, 8)
    : [];
  const channelNames = channels.map(channel => channel.name).join(', ');

  return res.json({
    success: true,
    found: false,
    verified: true,
    isLive: Boolean(match.isLive),
    isMatchLive: Boolean(match.isLive),
    source: 'tracker',
    sourceLabel: 'Verified live score tracker',
    sourceUrl: match.sourceUrl || null,
    channels,
    message: match.sport === 'football'
      ? (channels.length > 0
          ? `Licensed coverage is listed on ${channelNames}. Availability depends on your country and subscription.`
          : 'No official video feed is supplied for this football match. Live score tracking remains active.')
      : 'No official live broadcast is currently supplied for this match.'
  });
});
// Fallback: serve the focused Football and Mobile Legends match center.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live.html'));
});

// Start Express Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`1X Live server running on http://0.0.0.0:${PORT}`);
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`Render external URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
  console.log(`====================================================`);

  // Pre-cache matches on server boot, then keep live MLBB scores warm for all clients.
  refreshMatchesBackground().then(() => {
    console.log(`Pre-cached ${cachedMatches.length} matches (${cachedFootballMatches.length} football, ${cachedMlbbMatches.length} MLBB)`);
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

    console.log('Telegram Bot connected successfully');

    // Match-center keyboard with direct links to the two supported sports.
    const getBotKeyboard = (appUrl) => {
      const url = appUrl || WEBAPP_URL || `http://localhost:${PORT}`;
      const separator = url.includes('?') ? '&' : '?';
      return {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Open Live Match Center',
                web_app: { url }
              }
            ],
            [
              { text: 'Football Live', web_app: { url: `${url}${separator}sport=football` } },
              { text: 'Mobile Legends Live', web_app: { url: `${url}${separator}sport=mlbb` } }
            ]
          ]
        }
      };
    };

    // /start command
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || 'Viewer';
      getUser(msg.from.id, msg.from);

      const welcomeText =
`*1X LIVE MATCH CENTER*

Hello *${firstName}*. Follow verified live scores in one focused app.

*FOOTBALL*
- Live score and match-minute updates
- Confirmed full-time results and winners
- Fixtures across major competitions

*MOBILE LEGENDS*
- Live series scores
- Best-of format and winner confirmation
- Professional tournament schedules

Alerts automatically follow the sport currently open on your screen.

Open the match center below.`;

      bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        ...getBotKeyboard()
      });
    });

    // Function to configure Menu Button once public URL is known
    bot.updateMenuButtonUrl = async (url) => {
      try {
        await bot.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '1X Live',
            web_app: { url }
          }
        });
        console.log(`Telegram menu button updated: ${url}`);
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
