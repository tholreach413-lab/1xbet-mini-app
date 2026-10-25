'use strict';

const GOSU_BASE_URL = 'https://www.gosugamers.net';
const SCHEDULE_PATH = '/mobile-legends/matches';
const RESULTS_PATH = '/mobile-legends/matches/results';
const DEFAULT_TIME_ZONE = process.env.MLBB_TIME_ZONE || 'Asia/Phnom_Penh';

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const LOCAL_TEAM_LOGOS = {
  'absolute zero': '/logos/absolute_zero.svg',
  'aurora gaming ph': '/logos/aurora_gaming.svg',
  'aurora gaming': '/logos/aurora_gaming.svg',
  'bigetron my by vit': '/logos/bigetron.svg',
  'bigetron my': '/logos/bigetron.svg',
  bigetron: '/logos/bigetron.svg',
  'blacklist international': '/logos/blacklist_intl.svg',
  'boostgate esports': '/logos/boostgate_esports.svg',
  'bushido wildcats': '/logos/bushido_wildcats.svg',
  'dia ozarox esports': '/logos/dia_ozarox.svg',
  'dia ozarox': '/logos/dia_ozarox.svg',
  echo: '/logos/echo_ph.svg',
  'evil eye esports': '/logos/evil.svg',
  evil: '/logos/evil.svg',
  'evos glory': '/logos/evos_glory.svg',
  'fnatic onic': '/logos/fnatic_onic.svg',
  'fut esports': '/logos/fut_esports.svg',
  'galaxy legends': '/logos/galaxy_legends.svg',
  'galaxy phoenix': '/logos/galaxy_legends.svg',
  'invictus gaming': '/logos/invictus_gaming.svg',
  'pcific esports': '/logos/pcific_esports.svg',
  'pro esports': '/logos/pro_esports.svg',
  'rrq hoshi': '/logos/rrq_hoshi.svg',
  'see you soon': '/logos/see_you_soon.svg',
  'team falcons ph': '/logos/team_falcons.svg',
  'team falcons': '/logos/team_falcons.svg',
  'team flash kh': '/logos/team_flash.svg',
  'team flash': '/logos/team_flash.svg',
  'team liquid ph': '/logos/team_liquid.svg',
  'team liquid': '/logos/team_liquid.svg',
  'team rvz': '/logos/team_rvz.svg',
  'team secret': '/logos/team_secret.svg',
  'team vamos': '/logos/team_falcons.svg',
  'titan esports club': '/logos/titan_esports.svg',
  'titan esports': '/logos/titan_esports.svg',
  'tnr esports': '/logos/tnr_esports.svg',
  'vigor apex': '/logos/vigor_apex.svg',
  'yangon galacticos': '/logos/yangon_galacticos.svg'
};

const LOCAL_LOGO_ENTRIES = Object.entries(LOCAL_TEAM_LOGOS)
  .sort(([left], [right]) => right.length - left.length);

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value = '') {
  return decodeHtml(value)
    .replace(/<!--\s*-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTeamName(value = '') {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLocalTeamLogo(teamName) {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) return '';

  const exact = LOCAL_TEAM_LOGOS[normalized];
  if (exact) return exact;

  const partial = LOCAL_LOGO_ENTRIES.find(([name]) =>
    normalized.includes(name) || name.includes(normalized)
  );
  return partial?.[1] || '';
}

function isPlaceholderLogo(url = '') {
  return !url || /128x128_23\.webp|placeholder|default[-_]?team/i.test(url);
}

function toPublicLogo(remoteUrl, teamName) {
  const decodedUrl = decodeHtml(remoteUrl || '').trim();
  if (!isPlaceholderLogo(decodedUrl) && /^https:\/\//i.test(decodedUrl)) {
    return `/api/logo-proxy?url=${encodeURIComponent(decodedUrl)}`;
  }
  return getLocalTeamLogo(teamName);
}

function parseListCards(html, listType) {
  const isResultsList = listType === 'finished';
  const cards = html
    .split('<a class="MuiButtonBase-root MuiCardActionArea-root')
    .slice(1);

  const parsed = [];
  const seenIds = new Set();

  for (const card of cards) {
    const href = card.match(/href="([^"?#]+)"/)?.[1];
    if (!href || !href.startsWith('/mobile-legends/tournaments/') || !href.includes('/matches/')) {
      continue;
    }

    const matchId = href.match(/\/matches\/(\d+)/)?.[1];
    if (!matchId || seenIds.has(matchId)) continue;

    const teamNames = [...card.matchAll(/aria-label="([^"]+)"/g)]
      .map(match => stripHtml(match[1]))
      .filter(Boolean);

    let homeTeam = teamNames[0] || '';
    let awayTeam = teamNames[1] || '';
    if (!homeTeam || !awayTeam) {
      const slug = href.split('/matches/')[1]?.replace(/^\d+-/, '') || '';
      const slugTeams = slug.split('-vs-');
      if (slugTeams.length === 2) {
        homeTeam ||= slugTeams[0].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        awayTeam ||= slugTeams[1].replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
      }
    }

    if (!homeTeam || !awayTeam || normalizeTeamName(homeTeam) === normalizeTeamName(awayTeam)) {
      continue;
    }

    const tournament = stripHtml(
      card.match(/<span class="MuiTypography-root MuiTypography-p3[^"]*">([\s\S]*?)<\/span>/)?.[1]
    ) || 'Mobile Legends';

    const logos = [...card.matchAll(/srcSet="([^"]+)"/g)]
      .map(match => decodeHtml(match[1]).split(/\s+/)[0])
      .filter(Boolean);

    const statusParts = [...card.matchAll(/<p class="MuiTypography-root MuiTypography-body1[^"]*">([\s\S]*?)<\/p>/g)]
      .map(match => stripHtml(match[1]))
      .filter(Boolean);
    const statusText = statusParts.find(part => /^live$/i.test(part)) || statusParts.at(-1) || '';
    const isLive = !isResultsList && /^live$/i.test(statusText);

    seenIds.add(matchId);
    parsed.push({
      matchId,
      href,
      tournament,
      homeTeam,
      awayTeam,
      homeLogo: logos[0] || '',
      awayLogo: logos[1] || '',
      statusText,
      isLive,
      isFinished: isResultsList,
      listType
    });
  }

  return parsed;
}

function decodeNextFlightChunks(html) {
  const chunks = [];
  const chunkPattern = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
  for (const match of html.matchAll(chunkPattern)) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch (_) {
      // A malformed unrelated React chunk must not hide valid match chunks.
    }
  }
  return chunks;
}

function extractJsonObject(text, key) {
  const keyIndex = text.indexOf(`"${key}":`);
  if (keyIndex < 0) return null;

  const start = text.indexOf('{', keyIndex + key.length + 3);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }

  return null;
}

function parseMatchDetail(html) {
  for (const chunk of decodeNextFlightChunks(html)) {
    const match = extractJsonObject(chunk, 'match');
    if (match?.matchId && Array.isArray(match.opponents)) return match;
  }
  return null;
}

function countryFlag(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🎮';
  return String.fromCodePoint(...[...code].map(char => 127397 + char.charCodeAt(0)));
}

function dateOrdinal(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  return Math.floor(Date.UTC(values.year, values.month - 1, values.day) / 86400000);
}

function getDayLabel(timestamp, now, timeZone, isFinished) {
  if (!Number.isFinite(timestamp)) return isFinished ? 'Results' : 'Upcoming';
  const difference = dateOrdinal(timestamp, timeZone) - dateOrdinal(now, timeZone);
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Tomorrow';
  if (difference === -1) return 'Yesterday';
  return isFinished ? 'Results' : 'Upcoming';
}

function formatKickoff(timestamp, timeZone) {
  if (!Number.isFinite(timestamp)) return 'Scheduled';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(timestamp));
}

function getOfficialChannel(tournament, homeTeam, awayTeam) {
  const value = `${tournament || ''} ${homeTeam || ''} ${awayTeam || ''}`.toLowerCase();
  if (value.includes('cambodia')) return 'MPL Cambodia';
  if (value.includes('philippines')) return 'MPL Philippines';
  if (value.includes('singapore')) return 'MPL Singapore';
  if (value.includes('indonesia')) return 'MPL Indonesia';
  if (value.includes('myanmar') || value.includes('msl')) return 'MSL Myanmar';
  if (value.includes('malaysia')) return 'MPL Malaysia';
  if (value.includes('turkiye') || value.includes('turkey') || value.includes('mtc')) return 'MTC Turkiye';
  if (value.includes('mena')) return 'MPL MENA';
  return 'Mobile Legends: Bang Bang Official';
}

function getYouTubeVideoId(stream) {
  if (!stream) return '';
  const direct = String(stream.streamUrl || '').match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1];
  if (direct) return direct;
  const candidates = String(stream.streamId || '').match(/[A-Za-z0-9_-]{11}/g);
  return candidates?.at(-1) || '';
}

function buildMatch(card, detail, now, timeZone) {
  const opponents = Array.isArray(detail?.opponents) ? detail.opponents : [];
  const home = opponents[0] || {};
  const away = opponents[1] || {};
  const homeTeam = stripHtml(home.name || card.homeTeam);
  const awayTeam = stripHtml(away.name || card.awayTeam);
  if (!homeTeam || !awayTeam) return null;

  const winnerRegistrationId = Number(detail?.winnerRegistrationId || 0);
  const detailFinished = Number(detail?.matchStatus) === 1 || winnerRegistrationId > 0;
  const isFinished = Boolean(card.isFinished || detailFinished);
  const timestamp = Number(detail?.startingAt);
  const hasStarted = Number.isFinite(timestamp) && timestamp <= now;
  const detailHasLiveStream = detail?.streams?.some(stream => stream?.isLive === true) || false;
  const rawHomeScore = Number.isFinite(Number(home.score)) ? Number(home.score) : null;
  const rawAwayScore = Number.isFinite(Number(away.score)) ? Number(away.score) : null;
  const hasSeriesScore = (rawHomeScore || 0) > 0 || (rawAwayScore || 0) > 0;
  const isLive = !isFinished && Boolean(card.isLive || (detailHasLiveStream && hasStarted) || (hasStarted && hasSeriesScore));

  const homeScore = isLive || isFinished ? rawHomeScore : null;
  const awayScore = isLive || isFinished ? rawAwayScore : null;
  const scoreSlash = homeScore !== null && awayScore !== null ? `${homeScore}/${awayScore}` : null;

  let winner;
  if (isFinished) {
    const registeredWinner = opponents.find(opponent => Number(opponent.registrationId) === winnerRegistrationId);
    if (registeredWinner?.name) winner = stripHtml(registeredWinner.name);
    else if (homeScore !== null && awayScore !== null && homeScore !== awayScore) {
      winner = homeScore > awayScore ? homeTeam : awayTeam;
    }
  }

  const gamesPerMatch = Number(detail?.gamesPerMatch);
  const bo = Number.isInteger(gamesPerMatch) && gamesPerMatch > 0 ? `Bo${gamesPerMatch}` : 'Bo3';
  const tournament = stripHtml(detail?.parentTournamentName || card.tournament) || 'Mobile Legends';
  const stage = stripHtml(detail?.childTournamentName || detail?.roundName || '');
  const league = stage && !tournament.toLowerCase().includes(stage.toLowerCase())
    ? `${tournament} - ${stage}`
    : tournament;

  const countryName = stripHtml(home.countryName || away.countryName || 'International');
  const countryCode = home.countryCode || away.countryCode || '';
  const day = isLive ? 'Today' : getDayLabel(timestamp, now, timeZone, isFinished);
  const time = isLive
    ? `LIVE ${scoreSlash || '0/0'} (${bo})`
    : isFinished
      ? `FT${scoreSlash ? ` ${scoreSlash}` : ''}`
      : (Number.isFinite(timestamp) ? formatKickoff(timestamp, timeZone) : (card.statusText || 'Scheduled'));

  const streams = Array.isArray(detail?.streams) ? detail.streams : [];
  const preferredStream = streams.find(stream => stream?.isLive) || streams[0];
  const videoId = getYouTubeVideoId(preferredStream);
  const streamChannel = getOfficialChannel(tournament, homeTeam, awayTeam);
  const numericId = Number(card.matchId) || 1;

  return {
    id: `mlbb_gosu_${card.matchId}`,
    providerId: String(card.matchId),
    sport: 'mlbb',
    sportSub: 'esports',
    sportName: 'Mobile Legends (MLBB)',
    homeTeam,
    awayTeam,
    homeLogo: toPublicLogo(home.opponentImage || card.homeLogo, homeTeam),
    awayLogo: toPublicLogo(away.opponentImage || card.awayLogo, awayTeam),
    homeScore,
    awayScore,
    scoreSlash,
    winner,
    rawLeague: `${league} • ${bo}`,
    league,
    country: `${countryFlag(countryCode)} ${countryName}`,
    leagueIcon: '🎮',
    bo,
    isLive,
    isFinished,
    isTop: true,
    day,
    time,
    kickoffTime: Number.isFinite(timestamp) ? formatKickoff(timestamp, timeZone) : (card.statusText || 'Scheduled'),
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    streamChannel,
    streamInfo: {
      channel: streamChannel,
      query: `${homeTeam} vs ${awayTeam} live`,
      videoId: videoId || undefined,
      title: preferredStream?.title || undefined,
      isLive: Boolean(preferredStream?.isLive),
      viewerCount: Number(preferredStream?.viewerCount) || 0
    },
    odds: {
      home: +(1.45 + (numericId % 8) * 0.11).toFixed(2),
      draw: 0,
      away: +(1.70 + (numericId % 7) * 0.13).toFixed(2)
    },
    source: 'GosuGamers',
    sourceUrl: `${GOSU_BASE_URL}${card.href}`,
    sourceUpdatedAt: new Date(now).toISOString()
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return output;
}

function createMobileLegendsFeed(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logger = options.logger || console;
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const requestTimeoutMs = options.requestTimeoutMs || 7000;

  if (typeof fetchImpl !== 'function') {
    throw new Error('Mobile Legends feed requires the Fetch API (Node.js 18 or newer).');
  }

  let scheduleCards = [];
  let resultCards = [];
  let lastScheduleFetch = 0;
  let lastResultsFetch = 0;
  let lastRefresh = 0;
  let cachedMatches = [];
  let refreshPromise = null;
  const detailCache = new Map();

  async function fetchText(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    timeout.unref?.();
    try {
      const response = await fetchImpl(`${GOSU_BASE_URL}${path}`, {
        headers: REQUEST_HEADERS,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`GosuGamers returned HTTP ${response.status} for ${path}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshCardList(type, force, hadLiveMatches) {
    const isSchedule = type === 'schedule';
    const previous = isSchedule ? scheduleCards : resultCards;
    const lastFetched = isSchedule ? lastScheduleFetch : lastResultsFetch;
    const ttl = isSchedule
      ? (hadLiveMatches ? 4000 : 15000)
      : (hadLiveMatches ? 5000 : 60000);

    if (!force && previous.length > 0 && Date.now() - lastFetched < ttl) return previous;

    const path = isSchedule ? SCHEDULE_PATH : RESULTS_PATH;
    try {
      const html = await fetchText(path);
      const next = parseListCards(html, isSchedule ? 'schedule' : 'finished');
      if (isSchedule) {
        scheduleCards = next;
        lastScheduleFetch = Date.now();
      } else {
        resultCards = next;
        lastResultsFetch = Date.now();
      }
      return next;
    } catch (error) {
      logger.warn?.(`MLBB ${type} list refresh: ${error.message}`);
      return previous;
    }
  }

  async function getMatchDetail(card, force) {
    const now = Date.now();
    const statusKey = card.isFinished ? 'finished' : card.isLive ? 'live' : 'upcoming';
    const cached = detailCache.get(card.matchId);
    let ttl = card.isLive ? 3500 : card.isFinished ? 300000 : 120000;

    const cachedStart = Number(cached?.detail?.startingAt);
    if (!card.isLive && !card.isFinished && Number.isFinite(cachedStart) && cachedStart - now < 15 * 60 * 1000) {
      ttl = 10000;
    }

    if (!force && cached && cached.statusKey === statusKey && now - cached.fetchedAt < ttl) {
      return cached.detail;
    }

    try {
      const html = await fetchText(card.href);
      const detail = parseMatchDetail(html);
      if (!detail) {
        const fallbackDetail = cached?.detail || null;
        detailCache.set(card.matchId, {
          detail: fallbackDetail,
          fetchedAt: Date.now(),
          statusKey
        });
        return fallbackDetail;
      }
      detailCache.set(card.matchId, { detail, fetchedAt: Date.now(), statusKey });
      return detail;
    } catch (error) {
      logger.warn?.(`MLBB detail ${card.matchId}: ${error.message}`);
      const fallbackDetail = cached?.detail || null;
      detailCache.set(card.matchId, {
        detail: fallbackDetail,
        fetchedAt: Date.now(),
        statusKey
      });
      return fallbackDetail;
    }
  }

  async function refresh(force = false) {
    const hadLiveMatches = cachedMatches.some(match => match.isLive);
    await Promise.all([
      refreshCardList('schedule', force, hadLiveMatches),
      refreshCardList('results', force, hadLiveMatches)
    ]);

    const cardsById = new Map();
    for (const card of scheduleCards) cardsById.set(card.matchId, card);
    for (const card of resultCards) cardsById.set(card.matchId, card);
    const cards = [...cardsById.values()];

    if (cards.length === 0) return cachedMatches;

    const now = Date.now();
    const hydrated = await mapWithConcurrency(cards, 6, async card => {
      const detail = await getMatchDetail(card, force);
      return buildMatch(card, detail, now, timeZone);
    });

    const nextMatches = hydrated.filter(Boolean);
    if (nextMatches.length > 0) {
      nextMatches.sort((left, right) => {
        if (left.isLive !== right.isLive) return left.isLive ? -1 : 1;
        if (left.isFinished !== right.isFinished) return left.isFinished ? 1 : -1;
        if (left.isFinished && right.isFinished) return (right.timestamp || 0) - (left.timestamp || 0);
        return (left.timestamp || Number.MAX_SAFE_INTEGER) - (right.timestamp || Number.MAX_SAFE_INTEGER);
      });
      cachedMatches = nextMatches;
      lastRefresh = Date.now();
    }

    return cachedMatches;
  }

  async function getMatches({ force = false } = {}) {
    const ttl = cachedMatches.some(match => match.isLive) ? 4000 : 15000;
    if (!force && cachedMatches.length > 0 && Date.now() - lastRefresh < ttl) {
      return cachedMatches;
    }
    if (refreshPromise) return refreshPromise;

    refreshPromise = refresh(force).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  return {
    getMatches,
    getCachedMatches: () => cachedMatches,
    getLastRefresh: () => lastRefresh
  };
}

module.exports = {
  createMobileLegendsFeed,
  parseListCards,
  parseMatchDetail
};
