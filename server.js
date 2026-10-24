require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

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
app.use(express.static(path.join(__dirname, 'public')));

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

// Dynamic Real-Time Sports Matches & Odds Cache from LiveScore.com
let cachedMatches = [];
let lastMatchesFetch = 0;

async function fetchFromLiveScore() {
  const now = new Date();
  const dToday = new Date(now.getTime());
  const dTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const ymdToday = dToday.toISOString().slice(0, 10).replace(/-/g, '');
  const ymdTomorrow = dTomorrow.toISOString().slice(0, 10).replace(/-/g, '');
  
  const [liveRes, todayRes, tomorrowRes] = await Promise.allSettled([
    fetch('https://prod-public-api.livescore.com/v1/api/app/live/soccer/0.00', { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${ymdToday}/0.00`, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${ymdTomorrow}/0.00`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  ]);

  const matches = [];
  const seenIds = new Set();
  const TOP_LEAGUES = [
    'Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1',
    'UEFA Champions League', 'UEFA Europa League', 'FA Cup', 'EFL Cup', 'Copa del Rey'
  ];

  function parseStages(stages, isLiveForced = false, dayLabel = 'Today') {
    for (const stage of stages || []) {
      const rawLeague = stage.Snm || 'Football';
      const country = stage.Cnm || '';
      for (const ev of stage.Events || []) {
        if (seenIds.has(ev.Eid)) continue;
        seenIds.add(ev.Eid);

        const homeName = ev.T1?.[0]?.Nm || 'Home';
        const awayName = ev.T2?.[0]?.Nm || 'Away';
        const homeImg = ev.T1?.[0]?.Img ? `https://lsm-static-prod.livescore.com/medium/${ev.T1[0].Img}` : '';
        const awayImg = ev.T2?.[0]?.Img ? `https://lsm-static-prod.livescore.com/medium/${ev.T2[0].Img}` : '';
        const timeDisplay = ev.Eps || 'VS';
        const isLive = isLiveForced || ['1H', '2H', 'HT', 'ET', 'P', 'BT'].includes(ev.Eps) || (typeof ev.Eps === 'string' && ev.Eps.includes("'"));
        const isTop = TOP_LEAGUES.some(l => rawLeague.toLowerCase().includes(l.toLowerCase()));

        matches.push({
          id: 'ls_' + ev.Eid,
          sport: 'football',
          league: country ? `${country} - ${rawLeague}` : rawLeague,
          rawLeague: rawLeague,
          country: country,
          leagueIcon: '⚽',
          isLive,
          isTop,
          day: isLive ? 'LIVE' : dayLabel,
          time: timeDisplay,
          homeTeam: homeName,
          homeLogo: homeImg,
          homeScore: ev.Tr1 !== undefined ? parseInt(ev.Tr1) : null,
          awayTeam: awayName,
          awayLogo: awayImg,
          awayScore: ev.Tr2 !== undefined ? parseInt(ev.Tr2) : null,
          odds: {
            home: +(1.45 + Math.random() * 1.5).toFixed(2),
            draw: +(3.10 + Math.random() * 1.2).toFixed(2),
            away: +(1.85 + Math.random() * 2.2).toFixed(2),
            over25: +(1.65 + Math.random() * 0.4).toFixed(2),
            under25: +(1.90 + Math.random() * 0.5).toFixed(2)
          }
        });
      }
    }
  }

  if (liveRes.status === 'fulfilled' && liveRes.value.ok) {
    try {
      const liveData = await liveRes.value.json();
      parseStages(liveData.Stages, true, 'LIVE');
    } catch (_) {}
  }

  if (todayRes.status === 'fulfilled' && todayRes.value.ok) {
    try {
      const todayData = await todayRes.value.json();
      parseStages(todayData.Stages, false, 'Today');
    } catch (_) {}
  }

  if (tomorrowRes.status === 'fulfilled' && tomorrowRes.value.ok) {
    try {
      const tomorrowData = await tomorrowRes.value.json();
      parseStages(tomorrowData.Stages, false, 'Tomorrow');
    } catch (_) {}
  }

  // Sort: Live matches first, then Top European leagues, then others
  matches.sort((a, b) => {
    if (a.isLive !== b.isLive) return b.isLive ? 1 : -1;
    if (a.isTop !== b.isTop) return b.isTop ? 1 : -1;
    return 0;
  });

  return matches;
}

async function fetchRealLiveMatches() {
  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastMatchesFetch < 15000)) {
    return cachedMatches;
  }

  try {
    const liveScoreMatches = await fetchFromLiveScore();
    if (liveScoreMatches && liveScoreMatches.length > 0) {
      cachedMatches = liveScoreMatches;
      lastMatchesFetch = now;
      return cachedMatches;
    }
  } catch (err) {
    console.warn('LiveScore API fetch failed, falling back:', err.message);
  }

  return cachedMatches;
}

app.get('/api/matches', async (req, res) => {
  try {
    const matches = await fetchRealLiveMatches();
    res.json({ success: true, count: matches.length, matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    message: `Deposited $${amount} via ${method}`,
    balance: user.balance
  });
});

// Real-Time Live Video Stream Auto-Finder Endpoint
app.get('/api/stream/find', async (req, res) => {
  const query = req.query.q || 'football live match';
  try {
    // 1. Search YouTube for active LIVE broadcasts
    const liveSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' live')}&sp=EgJAAQ%253D%253D`;
    const response = await fetch(liveSearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await response.text();

    const videoMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
    const uniqueIds = [...new Set(videoMatches.map(m => m[1]))];

    if (uniqueIds.length > 0) {
      const liveId = uniqueIds[0];
      return res.json({
        success: true,
        isLive: true,
        videoId: liveId,
        embedUrl: `https://www.youtube.com/embed/${liveId}?autoplay=1&mute=0&playsinline=1&rel=0`,
        source: 'youtube_live_realtime'
      });
    }

    // 2. Fallback to latest match video broadcast
    const generalSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' match broadcast')}`;
    const genResp = await fetch(generalSearchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const genHtml = await genResp.text();
    const genMatches = [...genHtml.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
    const genUniqueIds = [...new Set(genMatches.map(m => m[1]))];

    if (genUniqueIds.length > 0) {
      const vidId = genUniqueIds[0];
      return res.json({
        success: true,
        isLive: false,
        videoId: vidId,
        embedUrl: `https://www.youtube.com/embed/${vidId}?autoplay=1&mute=0&playsinline=1&rel=0`,
        source: 'youtube_broadcast'
      });
    }

    // 3. Fallback to dynamic list search
    return res.json({
      success: true,
      isLive: true,
      embedUrl: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query + ' live')}&autoplay=1`,
      source: 'youtube_search_list'
    });
  } catch (err) {
    res.json({
      success: true,
      isLive: true,
      embedUrl: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query + ' live')}&autoplay=1`,
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
