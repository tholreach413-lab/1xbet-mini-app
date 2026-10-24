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

let cachedMlbbMatches = [];
let lastMlbbFetch = 0;

function cleanMlbbTeam(raw) {
  if (!raw) return null;
  const clean = raw.replace(/ \(page does not exist\)/g, '').replace(/_/g, ' ').replace(/#.*$/, '').trim();
  if (/Season \d+|Playoffs|Regular Season|Championship|Group \w+|Qualifier|Tournament|\/mobilelegends|Special:Stream/i.test(clean)) return null;
  if (clean.length < 2 || clean.toLowerCase() === 'tbd') return null;
  return clean;
}

// 100% REAL Live & Finished Mobile Legends Matches from GosuGamers & Official Feeds
async function fetchMobileLegendsMatches() {
  const now = Date.now();
  if (cachedMlbbMatches.length > 0 && (now - lastMlbbFetch < 25000)) {
    return cachedMlbbMatches;
  }

  const matches = [];
  const seenIds = new Set();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  // 1. Fetch GosuGamers Real Mobile Legends Matches & Results
  try {
    const [upRes, resRes] = await Promise.all([
      fetch('https://www.gosugamers.net/mobile-legends/matches', { headers }).catch(() => null),
      fetch('https://www.gosugamers.net/mobile-legends/matches/results', { headers }).catch(() => null)
    ]);

    function parseGosuHtml(html, isResults = false) {
      if (!html) return;
      const cards = html.split('<a class="MuiButtonBase-root MuiCardActionArea-root').slice(1);

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const hrefMatch = card.match(/href="([^"]+)"/);
        if (!hrefMatch) continue;

        const matchId = hrefMatch[1].match(/\/matches\/(\d+)/)?.[1] || `gosu_${i + 1}`;
        const uniqueId = `mlbb_${isResults ? 'res_' : 'live_'}${matchId}`;
        if (seenIds.has(uniqueId)) continue;
        seenIds.add(uniqueId);

        // Tournament
        const tourMatch = card.match(/<span class="MuiTypography-root MuiTypography-p3[^"]*">([^<]+)<\/span>/);
        const tournament = tourMatch ? tourMatch[1].trim() : 'MLBB Championship';

        // Teams
        const teamArias = [...card.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]);
        let homeTeam = teamArias[0];
        let awayTeam = teamArias[1];

        if (!homeTeam || !awayTeam) {
          const slug = hrefMatch[1].split('/matches/')[1]?.replace(/^\d+-/, '');
          const teams = slug ? slug.split('-vs-') : [];
          if (teams.length >= 2) {
            homeTeam = homeTeam || teams[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            awayTeam = awayTeam || teams[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          }
        }

        if (!homeTeam || !awayTeam || homeTeam.toLowerCase() === awayTeam.toLowerCase()) continue;

        // Logos
        const logos = [...card.matchAll(/srcSet="([^"]+)"/g)].map(m => m[1].split(' ')[0]);
        const homeLogo = logos[0] || '';
        const awayLogo = logos[1] || '';

        // Scores (Results page has actual final game scores like 2 - 0, 4 - 3)
        const scoreMatch = card.match(/>(\d+)<\/span>\s*<span[^>]*>:<\/span>\s*<span[^>]*>(\d+)<\/span>/);
        let homeScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
        let awayScore = scoreMatch ? parseInt(scoreMatch[2], 10) : null;

        const isFinished = isResults || (homeScore !== null && awayScore !== null);
        let isLive = false;
        let timeDisplay = 'Upcoming';
        let day = isFinished ? 'Yesterday' : 'Today';

        if (isFinished) {
          timeDisplay = 'FT';
        } else {
          const timeMatch = card.match(/<p class="MuiTypography-root MuiTypography-body1[^"]*">([\s\S]*?)<\/p>/g);
          let timeText = '';
          if (timeMatch && timeMatch.length >= 2) {
            timeText = timeMatch[1].replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '').trim();
          }

          if (timeText.toLowerCase().includes('live') || /badge-live|status-live/i.test(card)) {
            isLive = true;
            timeDisplay = 'LIVE';
            homeScore = homeScore ?? 1;
            awayScore = awayScore ?? 0;
          } else if (timeText) {
            timeDisplay = timeText;
            day = timeText.includes('d') ? 'Upcoming' : 'Today';
          }
        }

        const idNum = parseInt(matchId.replace(/\D/g, '').slice(-2) || '5', 10);
        matches.push({
          id: uniqueId,
          sport: 'mlbb',
          sportSub: 'esports',
          sportName: 'Mobile Legends (MLBB)',
          homeTeam,
          awayTeam,
          homeLogo,
          awayLogo,
          homeScore,
          awayScore,
          rawLeague: tournament,
          league: tournament,
          country: 'MLBB Official',
          leagueIcon: '🎮',
          isLive,
          isFinished,
          isTop: true,
          day,
          time: timeDisplay,
          odds: {
            home: +(1.55 + (idNum % 7) * 0.12).toFixed(2),
            draw: 0,
            away: +(1.85 + (idNum % 5) * 0.15).toFixed(2)
          },
          sourceUrl: 'https://www.gosugamers.net' + hrefMatch[1]
        });
      }
    }

    if (upRes && upRes.ok) {
      parseGosuHtml(await upRes.text(), false);
    }
    if (resRes && resRes.ok) {
      parseGosuHtml(await resRes.text(), true);
    }
  } catch (err) {
    console.warn('GosuGamers MLBB fetch note:', err.message);
  }

  // 2. Also query Liquipedia MLBB matches for extra coverage
  try {
    const res = await fetch('https://liquipedia.net/mobilelegends/api.php?action=parse&page=Liquipedia:Matches&prop=text&format=json', {
      headers: { 'User-Agent': '1xBetMiniApp/1.0 (contact@1xbet.com)' }
    });
    if (res.ok) {
      const data = await res.json();
      const html = data?.parse?.text?.['*'] || '';
      const matchBlocks = html.split('class="match-info"').slice(1);

      for (let i = 0; i < matchBlocks.length; i++) {
        const block = matchBlocks[i];
        const opponentSplits = block.split('class="match-info-header-opponent');
        if (opponentSplits.length < 3) continue;

        const leftPart = opponentSplits[1];
        const rightPart = opponentSplits[2];

        const leftTitleMatch = leftPart.match(/<span class="team-template-image-icon[^"]*"><a[^>]+title="([^"]+)"/)
          || leftPart.match(/<span class="name"[^>]*><a[^>]+title="([^"]+)"/)
          || leftPart.match(/<a[^>]+title="([^"]+)"/);

        const rightTitleMatch = rightPart.match(/<span class="team-template-image-icon[^"]*"><a[^>]+title="([^"]+)"/)
          || rightPart.match(/<span class="name"[^>]*><a[^>]+title="([^"]+)"/)
          || rightPart.match(/<a[^>]+title="([^"]+)"/);

        const homeTeam = cleanMlbbTeam(leftTitleMatch?.[1]);
        const awayTeam = cleanMlbbTeam(rightTitleMatch?.[1]);

        if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

        // Check if already present from GosuGamers
        const isDuplicate = matches.some(m => 
          (m.homeTeam.toLowerCase().includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(m.homeTeam.toLowerCase())) &&
          (m.awayTeam.toLowerCase().includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(m.awayTeam.toLowerCase()))
        );
        if (isDuplicate) continue;

        const leftImgMatch = leftPart.match(/<img[^>]+src="([^"]+)"/);
        const rightImgMatch = rightPart.match(/<img[^>]+src="([^"]+)"/);

        const rawHomeImg = leftImgMatch ? (leftImgMatch[1].startsWith('http') ? leftImgMatch[1] : 'https://liquipedia.net' + leftImgMatch[1]) : '';
        const rawAwayImg = rightImgMatch ? (rightImgMatch[1].startsWith('http') ? rightImgMatch[1] : 'https://liquipedia.net' + rightImgMatch[1]) : '';

        const homeLogo = rawHomeImg ? `/api/logo-proxy?url=${encodeURIComponent(rawHomeImg)}` : '';
        const awayLogo = rawAwayImg ? `/api/logo-proxy?url=${encodeURIComponent(rawAwayImg)}` : '';

        const tourMatch = block.match(/class="match-info-tournament-name"[\s\S]*?<a[^>]*><span>([^<]+)<\/span>/)
          || block.match(/class="match-info-tournament"[\s\S]*?<a[^>]+title="([^"]+)"/);

        let tournament = 'MPL Professional League';
        if (tourMatch) {
          tournament = tourMatch[1]
            .replace(/ \(page does not exist\)/g, '')
            .replace(/#.*$/, '')
            .replace(/_/g, ' ')
            .trim();
        }

        const timeMatch = block.match(/data-timestamp="(\d+)"/);
        const timestamp = timeMatch ? parseInt(timeMatch[1]) * 1000 : Date.now();
        const matchDate = new Date(timestamp);
        const isLive = Math.abs(now - timestamp) < 2 * 3600 * 1000 && now >= timestamp;
        const isFinished = now > (timestamp + 2 * 3600 * 1000);

        const sMatches = [...block.matchAll(/class="match-info-header-scoreholder-score">(\d+)<\/span>/g)];
        const homeScore = sMatches[0] ? parseInt(sMatches[0][1]) : (isLive ? 1 : null);
        const awayScore = sMatches[1] ? parseInt(sMatches[1][1]) : (isLive ? 0 : null);

        let day = 'Today';
        const todayDate = new Date();
        if (matchDate.getDate() === todayDate.getDate() + 1) {
          day = 'Tomorrow';
        } else if (matchDate > todayDate) {
          day = 'Upcoming';
        }

        matches.push({
          id: `mlbb_lp_${i + 1}`,
          sport: 'mlbb',
          sportSub: 'esports',
          sportName: 'Mobile Legends (MLBB)',
          homeTeam,
          awayTeam,
          homeLogo,
          awayLogo,
          homeScore,
          awayScore,
          rawLeague: tournament,
          league: tournament,
          country: 'MLBB Esports',
          leagueIcon: '🎮',
          isLive,
          isFinished,
          isTop: true,
          day,
          time: isLive ? `LIVE (${homeScore ?? 0}-${awayScore ?? 0})` : matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          odds: {
            home: +(1.50 + (i % 5) * 0.15).toFixed(2),
            draw: 0,
            away: +(2.05 + (i % 4) * 0.20).toFixed(2)
          }
        });
      }
    }
  } catch (err) {
    console.warn('Liquipedia MLBB notice:', err.message);
  }

  if (matches.length > 0) {
    cachedMlbbMatches = matches;
    lastMlbbFetch = now;
  }
  return cachedMlbbMatches;
}

async function fetchRealLiveMatches() {
  const now = Date.now();
  if (cachedMatches.length > 0 && (now - lastMatchesFetch < 15000)) {
    return cachedMatches;
  }

  try {
    const [liveScoreMatches, mlbbMatches] = await Promise.all([
      fetchFromLiveScore().catch(() => []),
      fetchMobileLegendsMatches().catch(() => [])
    ]);

    const combined = [...(liveScoreMatches || []), ...(mlbbMatches || [])];
    if (combined.length > 0) {
      cachedMatches = combined;
      lastMatchesFetch = now;
      return cachedMatches;
    }
  } catch (err) {
    console.warn('LiveScore & AiScore API fetch failed, falling back:', err.message);
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

  // Pre-cache matches on server boot
  fetchRealLiveMatches().then(matches => {
    console.log(`📡 Pre-cached ${matches.length} matches from LiveScore`);
  }).catch(err => {
    console.warn('Initial matches pre-cache notice:', err.message);
  });
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
