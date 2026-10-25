'use strict';

const API_BASE_URL = 'https://prod-public-api.livescore.com/v1/api/app';
const PROVIDER_TIME_ZONE_HOURS = 7;
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9'
};

const FINISHED_STATUSES = new Set(['FT', 'AET', 'AP', 'AOT', 'ENDED', 'FINISHED']);
const LIVE_STATUSES = new Set([
  '1H', '2H', 'HT', 'ET', 'P', 'BT',
  '1Q', '2Q', '3Q', '4Q', 'OT'
]);
const TOP_COMPETITIONS = [
  'premier league', 'champions league', 'europa league', 'conference league',
  'laliga', 'serie a', 'bundesliga', 'ligue 1', 'fa cup', 'efl cup',
  'copa del rey', 'copa libertadores', 'world cup', 'euro'
];

function formatProviderDate(timestamp) {
  const local = new Date(timestamp + PROVIDER_TIME_ZONE_HOURS * 60 * 60 * 1000);
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, '0'),
    String(local.getUTCDate()).padStart(2, '0')
  ].join('');
}

function parseProviderTimestamp(rawValue) {
  const value = String(rawValue || '');
  if (!/^\d{12,14}$/.test(value)) return null;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.length >= 14 ? value.slice(12, 14) : '00';
  const timestamp = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseScore(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const score = Number.parseInt(rawValue, 10);
  return Number.isFinite(score) ? score : null;
}

function isLiveStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  return LIVE_STATUSES.has(normalized)
    || /^\d{1,3}(?:\+\d{1,2})?'$/.test(normalized)
    || /^LIVE$/i.test(normalized);
}

function isFinishedStatus(status) {
  return FINISHED_STATUSES.has(String(status || '').trim().toUpperCase());
}

function getLogoUrl(team) {
  const image = team?.Img;
  if (!image) return '';
  const source = `https://lsm-static-prod.livescore.com/medium/${image}`;
  return `/api/logo-proxy?url=${encodeURIComponent(source)}`;
}

function formatKickoff(rawValue) {
  const value = String(rawValue || '');
  if (value.length < 12) return 'Scheduled';
  return `${value.slice(8, 10)}:${value.slice(10, 12)}`;
}

function getBroadcasts(media) {
  if (!media || typeof media !== 'object') return [];
  return Object.values(media)
    .flatMap(items => Array.isArray(items) ? items : [])
    .filter(item => item?.type === 'TV_CHANNEL' && item.eventId)
    .map(item => ({
      name: String(item.eventId),
      type: 'tv',
      allowedCountries: Array.isArray(item.allowedCountries) ? item.allowedCountries : []
    }));
}

function parseStages(stages, options = {}) {
  const matches = [];
  const bucket = options.bucket || 'today';
  const forceLive = Boolean(options.forceLive);
  const sourceUpdatedAt = options.sourceUpdatedAt || new Date().toISOString();

  for (const stage of stages || []) {
    const leagueName = stage?.Snm || 'Football';
    const countryName = stage?.Cnm || '';

    for (const event of stage?.Events || []) {
      if (!event?.Eid) continue;
      const home = event.T1?.[0];
      const away = event.T2?.[0];
      if (!home?.Nm || !away?.Nm) continue;

      const period = String(event.Eps || '').trim();
      const isFinished = isFinishedStatus(period);
      const isLive = !isFinished && (forceLive || isLiveStatus(period));
      const homeScore = isLive || isFinished ? parseScore(event.Tr1) : null;
      const awayScore = isLive || isFinished ? parseScore(event.Tr2) : null;
      const timestamp = parseProviderTimestamp(event.Esd);

      let winner;
      if (isFinished && homeScore !== null && awayScore !== null) {
        if (homeScore > awayScore) winner = home.Nm;
        else if (awayScore > homeScore) winner = away.Nm;
        else winner = 'Draw';
      }

      const normalizedLeague = `${countryName} ${leagueName}`.toLowerCase();
      const isTop = TOP_COMPETITIONS.some(name => normalizedLeague.includes(name));
      const time = isLive
        ? (period || 'LIVE')
        : isFinished
          ? (period || 'FT')
          : formatKickoff(event.Esd);

      matches.push({
        id: `football_ls_${event.Eid}`,
        providerId: String(event.Eid),
        sport: 'football',
        sportName: 'Football',
        homeTeam: home.Nm,
        awayTeam: away.Nm,
        homeLogo: getLogoUrl(home),
        awayLogo: getLogoUrl(away),
        homeScore,
        awayScore,
        winner,
        league: leagueName,
        rawLeague: leagueName,
        country: countryName,
        isLive,
        isFinished,
        isTop,
        day: isLive ? 'Live' : bucket === 'yesterday'
          ? 'Yesterday'
          : bucket === 'tomorrow'
            ? 'Tomorrow'
            : bucket === 'upcoming'
              ? 'Upcoming'
              : 'Today',
        time,
        period,
        kickoffTime: formatKickoff(event.Esd),
        timestamp,
        source: 'LiveScore',
        sourceVerified: true,
        sourceUrl: 'https://www.livescore.com/en/football/',
        sourceUpdatedAt,
        broadcasts: getBroadcasts(event.Media),
        competitionId: stage.CompId ? String(stage.CompId) : undefined
      });
    }
  }

  return matches;
}

function createFootballFeed(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logger = options.logger || console;
  const requestTimeoutMs = options.requestTimeoutMs || 7000;

  if (typeof fetchImpl !== 'function') {
    throw new Error('Football feed requires the Fetch API (Node.js 18 or newer).');
  }

  const buckets = new Map();
  let cachedMatches = [];
  let lastRefresh = 0;
  let refreshPromise = null;

  function getDefinitions(now, hasLiveMatches) {
    const today = formatProviderDate(now);
    const tomorrow = formatProviderDate(now + 86400000);

    return [
      {
        key: 'live',
        path: '/live/soccer/0.00',
        ttl: 4000,
        bucket: 'today',
        forceLive: true
      },
      {
        key: 'today',
        path: `/date/soccer/${today}/7.00`,
        ttl: hasLiveMatches ? 8000 : 20000,
        bucket: 'today'
      },
      {
        key: 'tomorrow',
        path: `/date/soccer/${tomorrow}/7.00`,
        ttl: 120000,
        bucket: 'tomorrow'
      }
    ];
  }

  async function fetchJson(path) {
    const controller = new AbortController();
    let timeout;
    const request = (async () => {
      const response = await fetchImpl(`${API_BASE_URL}${path}`, {
        headers: REQUEST_HEADERS,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`LiveScore returned HTTP ${response.status} for ${path}`);
      return response.json();
    })();
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`LiveScore request timed out for ${path}`));
      }, requestTimeoutMs);
    });

    try {
      return await Promise.race([request, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshBucket(definition, force) {
    const previous = buckets.get(definition.key);
    if (!force && previous && Date.now() - previous.fetchedAt < definition.ttl) {
      return previous;
    }

    try {
      const payload = await fetchJson(definition.path);
      const next = {
        stages: Array.isArray(payload?.Stages) ? payload.Stages : [],
        fetchedAt: Date.now(),
        bucket: definition.bucket,
        forceLive: Boolean(definition.forceLive)
      };
      buckets.set(definition.key, next);
      return next;
    } catch (error) {
      logger.warn?.(`Football ${definition.key} refresh: ${error.message}`);
      return previous || {
        stages: [],
        fetchedAt: 0,
        bucket: definition.bucket,
        forceLive: Boolean(definition.forceLive)
      };
    }
  }

  async function refresh(force = false) {
    const now = Date.now();
    const hadLiveMatches = cachedMatches.some(match => match.isLive);
    const definitions = getDefinitions(now, hadLiveMatches);
    const results = await Promise.all(definitions.map(definition => refreshBucket(definition, force)));

    const merged = new Map();
    const orderedKeys = ['today', 'tomorrow', 'live'];
    for (const key of orderedKeys) {
      const index = definitions.findIndex(definition => definition.key === key);
      if (index < 0) continue;
      const result = results[index];
      const sourceUpdatedAt = result.fetchedAt
        ? new Date(result.fetchedAt).toISOString()
        : new Date(now).toISOString();
      const matches = parseStages(result.stages, {
        bucket: result.bucket,
        forceLive: result.forceLive,
        sourceUpdatedAt
      });
      for (const match of matches) merged.set(match.id, match);
    }

    const nextMatches = [...merged.values()];
    if (nextMatches.length > 0) {
      nextMatches.sort((left, right) => {
        if (left.isLive !== right.isLive) return left.isLive ? -1 : 1;
        if (left.isFinished !== right.isFinished) return left.isFinished ? 1 : -1;
        if (left.isTop !== right.isTop) return left.isTop ? -1 : 1;
        if (left.isFinished && right.isFinished) return (right.timestamp || 0) - (left.timestamp || 0);
        return (left.timestamp || Number.MAX_SAFE_INTEGER) - (right.timestamp || Number.MAX_SAFE_INTEGER);
      });
      cachedMatches = nextMatches;
      lastRefresh = Math.max(...results.map(result => result.fetchedAt || 0), lastRefresh);
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
  createFootballFeed,
  parseStages,
  parseProviderTimestamp,
  isLiveStatus,
  isFinishedStatus
};
