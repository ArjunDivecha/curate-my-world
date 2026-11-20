import { createLogger } from '../utils/logger.js';

const logger = createLogger('SceneF');
const ORIGIN = 'https://scenef.com';
const REGIONS = ['sf', 'eastbay', 'southbay', 'peninsula', 'marin', 'contracosta', 'winecountry'];
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SLUG = /^[a-z0-9][a-z0-9-]*$/i;
const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/;
const ATTRIBUTION = 'Showtimes via SceneF.com';

function normalizeBoard(board, region) {
  if (board?.region !== region || board.timezone !== 'America/Los_Angeles'
    || !Array.isArray(board.screenings) || !Array.isArray(board.films) || !Array.isArray(board.venues)) {
    throw new Error('Unexpected listings response');
  }

  const films = new Map(board.films.filter(Boolean).map(film => [film.key, film]));
  const venues = new Map(board.venues.filter(Boolean).map(venue => [venue.id, venue]));
  const events = [];
  for (const screening of board.screenings) {
    if (!screening) continue;
    const film = films.get(screening.filmKey);
    const venue = venues.get(screening.venueId);
    const startsAt = Date.parse(screening.startsAt);
    const verifiedAt = Date.parse(screening.verified_at);
    if (typeof film?.title !== 'string' || !film.title.trim()
      || typeof venue?.name !== 'string' || !venue.name.trim() || !SLUG.test(venue.id || '')
      || !SLUG.test(screening.id || '') || !OFFSET_SUFFIX.test(screening.startsAt)
      || !Number.isFinite(startsAt) || !Number.isFinite(verifiedAt)
      || screening.confidence === 'disputed' || screening.freshness?.status !== 'current') {
      continue;
    }

    const city = region === 'sf' ? 'San Francisco' : venue.neighborhood;
    const location = `${city || board.region_name}, CA`;
    const ticketUrl = new URL(`/go/${screening.id}`, ORIGIN);
    if (region !== 'sf') ticketUrl.searchParams.set('region', region);
    const endMs = Number.isFinite(film.runtimeMin) && film.runtimeMin > 0
      ? startsAt + film.runtimeMin * 60000
      : startsAt;
    const staleHours = Math.min(screening.freshness.stale_after_hours || 36, 36);
    events.push({
      startsAt,
      expiresAt: verifiedAt + staleHours * HOUR_MS,
      event: {
        id: `scenef-${screening.id}`,
        title: film.title,
        description: [screening.format, ATTRIBUTION].filter(Boolean).join(' · '),
        startDate: screening.startsAt,
        endDate: new Date(endMs).toISOString(),
        venue: venue.name,
        address: [venue.address, location].filter(Boolean).join(', '),
        location,
        category: 'movies',
        source: 'scenef',
        eventUrl: `${ORIGIN}/theater/${venue.id}`,
        ticketUrl: ticketUrl.href
      }
    });
  }
  return events;
}

export class SceneFClient {
  constructor({ fetchListings = globalThis.fetch, regions = REGIONS } = {}) {
    this.fetchListings = fetchListings;
    this.regions = regions;
    this.boards = new Map();
    this.loading = false;
  }

  start() {
    const refresh = () => void this.refresh();
    this.loading = true;
    void this.refresh().finally(() => { this.loading = false; });
    setInterval(refresh, REFRESH_INTERVAL_MS).unref();
  }

  async refresh() {
    await Promise.all(this.regions.map(async (region) => {
      const previous = this.boards.get(region);
      const url = new URL('/api/listings', ORIGIN);
      url.search = new URLSearchParams({ region, when: 'week', compact: '1' });
      try {
        const response = await this.fetchListings(url, {
          headers: previous?.etag ? { 'If-None-Match': previous.etag } : {},
          signal: AbortSignal.timeout(12000)
        });
        if (response.status === 304 && previous) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const events = normalizeBoard(await response.json(), region);
        this.boards.set(region, { events, etag: response.headers.get('etag') });
        logger.info('Movie showtimes loaded', { region, count: events.length });
      } catch (error) {
        logger.warn('Movie showtimes refresh failed', { region, error: error.message });
      }
    }));
  }

  getEvents(now = Date.now()) {
    const upcoming = new Map();
    for (const { events } of this.boards.values()) {
      for (const { startsAt, expiresAt, event } of events) {
        if (startsAt >= now && expiresAt > now) upcoming.set(event.id, event);
      }
    }
    return [...upcoming.values()].sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  }
}

export const sceneFClient = new SceneFClient();
