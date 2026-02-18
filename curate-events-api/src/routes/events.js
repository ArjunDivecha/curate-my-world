/**
 * =============================================================================
 * SCRIPT NAME: events.js
 * =============================================================================
 *
 * DESCRIPTION:
 * Express routes for event collection endpoints.
 * Three-layer architecture:
 *   Layer 1: Ticketmaster API (backbone - structured, real events)
 *   Layer 2: Venue Calendar Scraper (gap filler - scrapes whitelist venues)
 *   Layer 3: Event Validation Gate (quality filter on all events)
 *
 * ENDPOINTS:
 * - GET /api/events/all-categories - Main endpoint for all events
 * - GET /api/events/:category - Fetch events by category
 * - GET /api/events/categories - List supported categories
 *
 * VERSION: 2.0
 * LAST UPDATED: 2026-02-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import express from 'express';
import { CategoryManager } from '../managers/CategoryManager.js';
import { EventDeduplicator } from '../utils/eventDeduplicator.js';
import TicketmasterClient from '../clients/TicketmasterClient.js';
import { VenueScraperClient } from '../clients/VenueScraperClient.js';
import WhitelistClient from '../clients/WhitelistClient.js';
import { LocationFilter } from '../utils/locationFilter.js';
import { DateFilter } from '../utils/dateFilter.js';
import { filterValidEvents } from '../utils/eventValidator.js';
import { createLogger, logRequest, logResponse } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { eventCache } from '../utils/cache.js';
import { filterEvents as applyRulesFilter } from '../utils/rulesFilter.js';
import { filterBlacklistedEvents } from '../utils/listManager.js';
import { normalizeCategory, SUPPORTED_CATEGORIES } from '../utils/categoryMapping.js';
import { readAllCategoriesCache, writeAllCategoriesCache } from '../utils/venueCacheDb.js';

const router = express.Router();
const logger = createLogger('EventsRoute');

// Initialize clients
const categoryManager = new CategoryManager();
const ticketmasterClient = new TicketmasterClient();
const venueScraperClient = new VenueScraperClient();
const whitelistClient = new WhitelistClient();
const deduplicator = new EventDeduplicator();
const locationFilter = new LocationFilter();
const dateFilter = new DateFilter();

// Provider metadata
const PROVIDER_LABELS = {
  ticketmaster: 'Ticketmaster',
  venue_scraper: 'Venue Scraper',
  whitelist: 'Whitelist (Legacy)'
};

const ALL_PROVIDERS = [
  'ticketmaster',
  'venue_scraper',
  'whitelist'
];

const SOURCE_PROVIDER_MAP = {
  ticketmaster: 'ticketmaster',
  venue_scraper: 'venue_scraper',
  whitelist: 'whitelist'
};

const PROVIDER_DEFAULTS = {
  ticketmaster: true,
  venue_scraper: true,
  whitelist: false  // Legacy - disabled by default
};

const PROVIDER_ORDER = [
  'ticketmaster',
  'venue_scraper',
  'whitelist'
];

function mapSourceToProvider(source) {
  return SOURCE_PROVIDER_MAP[source] || source || 'unknown';
}

function parseProviderSelection(req) {
  const param = String(req.query.providers || '').toLowerCase();
  const selected = new Set();
  if (param) {
    param
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .forEach(p => {
        if (ALL_PROVIDERS.includes(p)) {
          selected.add(p);
        }
      });
  } else {
    Object.entries(PROVIDER_DEFAULTS).forEach(([key, enabled]) => {
      if (enabled) selected.add(key);
    });
  }
  return selected;
}

function ensureProviderStats(map, providerKey, selected) {
  if (!map[providerKey]) {
    map[providerKey] = {
      provider: providerKey,
      label: PROVIDER_LABELS[providerKey] || providerKey,
      requested: selected.has(providerKey),
      enabled: selected.has(providerKey),
      success: false,
      originalCount: 0,
      survivedCount: 0,
      duplicatesRemoved: 0,
      processingTime: 0,
      cost: 0
    };
  }
  return map[providerKey];
}

// ---------------------------------------------------------------------------
// Background refresh: re-computes all-categories and writes to Postgres.
// Called by the daily orchestrator and when explicitly requested via `refresh=1|true`.
// Guard prevents overlapping refreshes.
// ---------------------------------------------------------------------------
let _bgRefreshInProgress = false;
const ALL_CATEGORIES_REFRESH_TIMEZONE = 'America/Los_Angeles';
const ALL_CATEGORIES_REFRESH_HOUR = 6;
const ALL_CATEGORIES_REFRESH_MINUTE = 0;
const ALL_CATEGORIES_CACHE_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function getZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUTC - date.getTime();
}

function zonedTimeToUtcMs({ year, month, day, hour, minute, second }, timeZone) {
  const wallClockAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(new Date(wallClockAsUTC), timeZone);
  let utc = wallClockAsUTC - offset;
  offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
  utc = wallClockAsUTC - offset;
  return utc;
}

function getNextRunTimestampMs({ timeZone, hour, minute }) {
  const now = new Date();
  const zonedNow = getZonedParts(now, timeZone);

  const targetToday = {
    year: zonedNow.year,
    month: zonedNow.month,
    day: zonedNow.day,
    hour,
    minute,
    second: 0,
  };
  const nextTodayMs = zonedTimeToUtcMs(targetToday, timeZone);
  if (nextTodayMs <= now.getTime()) {
    return zonedTimeToUtcMs({ ...targetToday, day: targetToday.day + 1 }, timeZone);
  }
  return nextTodayMs;
}

export async function triggerBackgroundAllCategoriesRefresh(requestKey, opts) {
  if (_bgRefreshInProgress) {
    logger.info('Background all-categories refresh already in progress, skipping');
    return;
  }
  _bgRefreshInProgress = true;
  logger.info('Starting background all-categories refresh', { requestKey: requestKey.slice(0, 80) });

  try {
    const { location, date_range, eventLimit, selectedProviders,
            includeTicketmaster, includeVenueScraper, includeWhitelist } = opts;

    const supportedCategorySet = new Set(SUPPORTED_CATEGORIES);
    const supportedCategories = categoryManager.getSupportedCategories()
      .filter(cat => supportedCategorySet.has(cat.name))
      .map(cat => cat.name);

    const categoryPromises = supportedCategories.map(async (category) => {
      const providerPromises = [];
      const enqueue = (key, fn) => providerPromises.push(
        fn().then(v => ({ key, status: 'fulfilled', value: v }))
            .catch(e => ({ key, status: 'rejected', reason: e }))
      );
      if (includeTicketmaster) {
        enqueue('ticketmaster', () => ticketmasterClient.searchEvents({ category, location, limit: eventLimit })
          .then(r => ({ success: r.success||false, events: r.events||[], count: r.events?.length||0, source:'ticketmaster', cost:0 })));
      }
      if (includeVenueScraper) {
        enqueue('venue_scraper', () => venueScraperClient.searchEvents({ category, location, limit: eventLimit })
          .then(r => ({ success: r.success||false, events: r.events||[], count: r.events?.length||0, source:'venue_scraper', cost:0 })));
      }
      const settled = await Promise.all(providerPromises);
      const providerResults = {};
      settled.forEach(r => { providerResults[r.key] = r.status === 'fulfilled' ? r.value : { success:false, events:[], count:0, source:r.key }; });
      const eventLists = Object.values(providerResults).filter(v => v && Array.isArray(v.events) && v.events.length > 0);
      const dedupResult = deduplicator.deduplicateEvents(eventLists);
      const rulesFiltered = applyRulesFilter(dedupResult.uniqueEvents);
      const blFiltered = filterBlacklistedEvents(rulesFiltered);
      const { validEvents } = filterValidEvents(blFiltered, { requireDate: true, requireVenue: false });
      const locFiltered = locationFilter.filterEventsByLocation(validEvents, location, { radiusKm: 50, allowBayArea: true, strictMode: false });
      const pastResult = dateFilter.filterPastEvents(locFiltered);
      const dateResult = dateFilter.filterEventsByDateRange(pastResult.filteredEvents, date_range || 'next 30 days');
      const catFiltered = dateResult.filteredEvents.filter(ev => {
        const c = (ev.category||'').toLowerCase();
        return !c || normalizeCategory(c) === category;
      });
      return { category, events: catFiltered, count: catFiltered.length };
    });

    const results = await Promise.all(categoryPromises);
    const eventsByCategory = {};
    const categoryStats = {};
    let totalEvents = 0;
    results.forEach(({ category, events, count }) => {
      eventsByCategory[category] = events;
      categoryStats[category] = { count };
      totalEvents += count;
    });

    const response = {
      success: true, eventsByCategory, categoryStats, totalEvents,
      categories: supportedCategories, providerStats: {}, providerDetails: [],
      processingTime: 0, backgroundRefreshing: false,
      metadata: { location, dateRange: date_range || 'next 30 days', limitPerCategory: eventLimit,
        categoriesFetched: supportedCategories.length,
        requestId: `bg_refresh_${Date.now()}_${Math.random().toString(36).substr(2,9)}` }
    };

    await writeAllCategoriesCache(requestKey, response);
    logger.info('Background all-categories refresh complete', { totalEvents });
  } catch (error) {
    logger.error('Background all-categories refresh failed', { error: error.message });
  } finally {
    _bgRefreshInProgress = false;
  }
}

export function getDefaultAllCategoriesRefreshRequest() {
  const defaultProviders = new Set(Object.entries(PROVIDER_DEFAULTS).filter(([,v])=>v).map(([k])=>k));
  const defaultLimit = Math.min(500, config.api.maxLimit); // match frontend's limit=500
  const requestKey = JSON.stringify({
    location: 'San Francisco, CA',
    date_range: 'next 30 days',
    limit: defaultLimit,
    providers: Array.from(defaultProviders).sort()
  });

  return {
    requestKey,
    opts: {
      location: 'San Francisco, CA',
      date_range: 'next 30 days',
      eventLimit: defaultLimit,
      selectedProviders: defaultProviders,
      includeTicketmaster: true,
      includeVenueScraper: true,
      includeWhitelist: false
    }
  };
}

export async function refreshDefaultAllCategoriesCache({ reason = 'manual' } = {}) {
  const { requestKey, opts } = getDefaultAllCategoriesRefreshRequest();
  logger.info('Refreshing default all-categories cache', { reason });
  await triggerBackgroundAllCategoriesRefresh(requestKey, opts);
  const dbCached = await readAllCategoriesCache(requestKey);
  return {
    success: !!dbCached,
    requestKey,
    updatedAt: dbCached?.updatedAt || null,
    totalEvents: dbCached?.payload?.totalEvents || 0
  };
}

/**
 * GET /api/events/all-categories
 * Main endpoint: Three-layer architecture
 *   Layer 1: Ticketmaster (backbone)
 *   Layer 2: Venue Calendar Scraper (gap filler)
 *   Layer 3: Event Validation Gate (quality filter)
 */
router.get('/all-categories', async (req, res) => {
  const startTime = Date.now();
  const { location = 'San Francisco, CA', date_range, limit, refresh } = req.query;
  const eventLimit = Math.min(parseInt(limit) || 15, config.api.maxLimit);
  const forceRefresh = String(refresh || '').toLowerCase() === '1' || String(refresh || '').toLowerCase() === 'true';

  logRequest(logger, req, 'allCategoriesEvents', { location, date_range, limit });

  let selectedProviders = parseProviderSelection(req);
  if (selectedProviders.size === 0) {
    logger.warn('No recognized providers parsed; falling back to defaults', { location });
    selectedProviders = new Set(
      Object.entries(PROVIDER_DEFAULTS)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
    );
  }

  const includeTicketmaster = selectedProviders.has('ticketmaster');
  const includeVenueScraper = selectedProviders.has('venue_scraper');
  const includeWhitelist = selectedProviders.has('whitelist');

  // Postgres-backed cache: ALWAYS serve cached data if it exists.
  // This endpoint NEVER makes live TM API calls.
  // A daily orchestrated update refreshes this cache at 6:00 AM America/Los_Angeles.
  // Request-time refresh is opt-in only via `refresh=1|true`.
  const requestKey = JSON.stringify({
    location,
    date_range: date_range || 'next 30 days',
    limit: eventLimit,
    providers: Array.from(selectedProviders).sort()
  });

  try {
    const dbCached = await readAllCategoriesCache(requestKey);
    if (dbCached) {
      const ageMs = Date.now() - dbCached.updatedAt;
      const duration = Date.now() - startTime;
      const isStale = ageMs > ALL_CATEGORIES_CACHE_STALE_THRESHOLD_MS;
      const shouldRefresh = forceRefresh;
      logger.info('Serving DB-cached all-categories response', {
        location, eventLimit, ageMs, stale: isStale, forceRefresh, duration: `${duration}ms`
      });
      res.json({
        ...dbCached.payload,
        backgroundRefreshing: shouldRefresh || _bgRefreshInProgress || !!dbCached.payload?.backgroundRefreshing,
        metadata: {
          ...(dbCached.payload.metadata || {}),
          dbCache: true,
          dbCacheAgeMs: ageMs,
          stale: isStale,
          forceRefreshRequested: forceRefresh
        }
      });
      logResponse(logger, res, 'allCategoriesEvents-dbCached', duration, {
        totalEvents: dbCached.payload.totalEvents || 0
      });
      // Trigger background refresh (non-blocking) only when explicitly requested.
      if (shouldRefresh) {
        triggerBackgroundAllCategoriesRefresh(requestKey, {
          location, date_range, eventLimit, selectedProviders,
          includeTicketmaster, includeVenueScraper, includeWhitelist
        });
      }
      return;
    }
  } catch (dbErr) {
    logger.warn('DB cache lookup failed', { error: dbErr.message });
  }

  // No cache available yet — return empty response.
  // Request-time build is opt-in only via `refresh=1|true`.
  // Fetch Events NEVER makes live TM API calls.
  const duration = Date.now() - startTime;
  const shouldRefresh = forceRefresh;
  const nextScheduledRefreshUtc = new Date(getNextRunTimestampMs({
    timeZone: ALL_CATEGORIES_REFRESH_TIMEZONE,
    hour: ALL_CATEGORIES_REFRESH_HOUR,
    minute: ALL_CATEGORIES_REFRESH_MINUTE
  })).toISOString();
  logger.info('No cached data available yet; returning empty response', { location, duration: `${duration}ms` });

  const supportedCategorySet = new Set(SUPPORTED_CATEGORIES);
  const supportedCategories = categoryManager.getSupportedCategories()
    .filter(cat => supportedCategorySet.has(cat.name))
    .map(cat => cat.name);

  const emptyByCategory = {};
  const emptyStats = {};
  supportedCategories.forEach(cat => {
    emptyByCategory[cat] = [];
    emptyStats[cat] = { count: 0 };
  });

  res.json({
    success: true,
    eventsByCategory: emptyByCategory,
    categoryStats: emptyStats,
    totalEvents: 0,
    categories: supportedCategories,
    providerStats: {},
    providerDetails: [],
    processingTime: duration,
    backgroundRefreshing: shouldRefresh || _bgRefreshInProgress,
    metadata: {
      location,
      dateRange: date_range || 'next 30 days',
      limitPerCategory: eventLimit,
      categoriesFetched: supportedCategories.length,
      dbCache: false,
      forceRefreshRequested: forceRefresh,
      nextScheduledRefreshUtc,
      message: shouldRefresh
        ? 'Cache is being built now due to explicit refresh request.'
        : 'No cache is available yet. Automatic build runs in the daily 6:00 AM Pacific orchestrated update; pass refresh=true to build now.',
      requestId: `all_categories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  });
  logResponse(logger, res, 'allCategoriesEvents-empty', duration, { totalEvents: 0 });
  if (shouldRefresh) {
    triggerBackgroundAllCategoriesRefresh(requestKey, {
      location, date_range, eventLimit, selectedProviders,
      includeTicketmaster, includeVenueScraper, includeWhitelist
    });
  }
});

/**
 * GET /api/events/refresh-status
 * Lightweight polling endpoint for frontend to check if a background
 * venue scrape is in progress. Used for the "Refreshing Data" indicator.
 */
router.get('/refresh-status', async (req, res) => {
  const health = await venueScraperClient.getHealthStatus();
  const refreshingAllCategories = _bgRefreshInProgress;
  res.json({
    refreshing: (health.backgroundRefreshing || false) || refreshingAllCategories,
    lastUpdated: health.lastUpdated || null,
    ageHours: health.ageHours,
    isStale: health.isStale || false,

    // Extra status for UI (non-breaking; existing fields preserved)
    message: health.message || null,
    latestRunStatus: health.latestRunStatus || null,
    storageMode: health.storageMode || null,
    venueCount: typeof health.venueCount === 'number' ? health.venueCount : null,
    totalEvents: typeof health.totalEvents === 'number' ? health.totalEvents : null,
    allCategoriesRefreshing: refreshingAllCategories
  });
});

/**
 * GET /api/events/:category
 * Fetch events for a specific category using Ticketmaster + Venue Scraper
 */
router.get('/:category', async (req, res) => {
  const startTime = Date.now();

  logRequest(logger, req, 'fetchEvents');

  try {
    const { category } = req.params;
    const { location, date_range, limit } = req.query;

    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location parameter is required',
        example: '/api/events/theatre?location=San Francisco, CA',
        timestamp: new Date().toISOString()
      });
    }

    const eventLimit = limit ? Math.min(parseInt(limit), config.api.maxLimit) : 50;

    // Check cache first
    const cacheKey = eventCache.generateKey(category, location, date_range, { limit: eventLimit }, '');
    const cachedResult = eventCache.get(cacheKey);

    if (cachedResult) {
      const duration = Date.now() - startTime;
      logger.info('Serving cached events', { category, location, eventsCount: cachedResult.count, duration: `${duration}ms` });
      logResponse(logger, res, 'fetchEvents-cached', duration);
      return res.json({ ...cachedResult, cached: true, cacheStats: eventCache.getStats() });
    }

    logger.info('Processing event request', { category, location, dateRange: date_range, limit: eventLimit });

    // Fetch from Ticketmaster + Venue Scraper in parallel
    const [ticketmasterResult, venueScraperResult] = await Promise.allSettled([
      ticketmasterClient.searchEvents({ category, location, limit: eventLimit }),
      venueScraperClient.searchEvents({ category, location, limit: eventLimit })
    ]);

    // Prepare event lists for deduplication
    const eventLists = [];
    const sourceStats = {};

    if (ticketmasterResult.status === 'fulfilled' && ticketmasterResult.value.success) {
      eventLists.push(ticketmasterResult.value);
      sourceStats.ticketmaster = {
        count: ticketmasterResult.value.events.length,
        processingTime: ticketmasterResult.value.processingTime
      };
    } else {
      sourceStats.ticketmaster = {
        count: 0,
        error: ticketmasterResult.reason?.message || ticketmasterResult.value?.error || 'Unknown error'
      };
    }

    if (venueScraperResult.status === 'fulfilled' && venueScraperResult.value.success) {
      eventLists.push(venueScraperResult.value);
      sourceStats.venue_scraper = {
        count: venueScraperResult.value.events.length,
        processingTime: venueScraperResult.value.processingTime
      };
    } else {
      sourceStats.venue_scraper = {
        count: 0,
        error: venueScraperResult.reason?.message || venueScraperResult.value?.error || 'Unknown error'
      };
    }

    // Deduplicate
    const deduplicationResult = deduplicator.deduplicateEvents(eventLists);

    // Apply rules filter + blacklist
    const rulesFilteredEvents = applyRulesFilter(deduplicationResult.uniqueEvents);
    const blacklistFilteredEvents = filterBlacklistedEvents(rulesFilteredEvents);

    // Layer 3: Event Validation Gate
    const { validEvents: validatedEvents } = filterValidEvents(blacklistFilteredEvents, {
      requireDate: true,
      requireVenue: false
    });

    // Location filtering
    const locationFilteredEvents = locationFilter.filterEventsByLocation(
      validatedEvents,
      location,
      { radiusKm: 50, allowBayArea: true, strictMode: false }
    );

    // Date filtering
    const pastFilterResult = dateFilter.filterPastEvents(locationFilteredEvents);
    const dateFilterResult = dateFilter.filterEventsByDateRange(
      pastFilterResult.filteredEvents,
      date_range || 'next 30 days'
    );

    const result = {
      success: true,
      events: dateFilterResult.filteredEvents,
      count: dateFilterResult.filteredCount,
      sources: ['ticketmaster', 'venue_scraper'],
      sourceStats,
      deduplication: {
        totalProcessed: deduplicationResult.totalProcessed,
        duplicatesRemoved: deduplicationResult.duplicatesRemoved,
        duplicateGroups: deduplicationResult.duplicateGroups,
        sources: deduplicationResult.sources
      },
      requestId: `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        category,
        location,
        dateRange: date_range || 'next 30 days',
        limit: eventLimit
      }
    };

    // Cache results
    if (result.events.length > 0) {
      eventCache.set(cacheKey, result, 300000);
    } else {
      eventCache.set(cacheKey, result, 60000);
    }

    const duration = Date.now() - startTime;
    logger.info('Events fetched successfully', {
      category, location, eventsFound: result.count, duration: `${duration}ms`
    });

    logResponse(logger, res, 'fetchEvents', duration);
    res.json(result);

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Unexpected error in events route', {
      error: error.message, params: req.params, query: req.query, duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      requestId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/events/categories
 * List all supported event categories
 */
router.get('/', async (req, res) => {
  logRequest(logger, req, 'getCategories');
  
  try {
    const categories = categoryManager.getSupportedCategories();
    
    const result = {
      success: true,
      categories: categories,
      count: categories.length,
      usage: {
        endpoint: '/api/events/:category',
        requiredParams: ['location'],
        optionalParams: ['date_range', 'limit', 'min_confidence'],
        example: '/api/events/theatre?location=San Francisco, CA&date_range=this weekend'
      }
    };

    logResponse(logger, res, 'getCategories', 0);
    res.json(result);

  } catch (error) {
    logger.error('Error fetching categories', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      categories: [],
      count: 0,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/events/cache/stats
 * Get cache statistics (development only)
 */
if (config.isDevelopment) {
  router.get('/cache/stats', (req, res) => {
    logRequest(logger, req, 'getCacheStats');
    
    const stats = eventCache.getStats();
    
    res.json({
      success: true,
      cache: stats,
      message: 'Cache statistics (development mode only)'
    });
    
    logResponse(logger, res, 'getCacheStats', 0);
  });

  /**
   * DELETE /api/events/cache
   * Clear cache (development only)
   */
  router.delete('/cache', (req, res) => {
    logRequest(logger, req, 'clearCache');
    
    eventCache.clear();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
    
    logResponse(logger, res, 'clearCache', 0);
  });
}

// Removed: PredictHQ-only endpoint

/**
 * GET /api/events/:category/ticketmaster
 * Get events from Ticketmaster API only (diagnostic endpoint)
 */
router.get('/:category/ticketmaster', async (req, res) => {
  const startTime = Date.now();

  logRequest(logger, req, 'ticketmasterEvents');

  try {
    const { category } = req.params;
    const { location = 'San Francisco, CA', limit = 10 } = req.query;

    logger.info('Fetching Ticketmaster events', { category, location, limit });

    const response = await ticketmasterClient.searchEvents({
      category,
      location,
      limit: parseInt(limit)
    });

    const processingTime = Date.now() - startTime;

    res.json({
      success: response.success,
      events: response.events || [],
      count: response.count || 0,
      source: 'ticketmaster',
      processingTime,
      timestamp: new Date().toISOString(),
      category,
      location,
      error: response.error || null
    });

  } catch (error) {
    logger.error('Ticketmaster API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Ticketmaster events',
      source: 'ticketmaster',
      processingTime: Date.now() - startTime
    });
  }
});

/**
 * GET /api/events/:category/venue-scraper
 * Get events from venue scraper cache only (diagnostic endpoint)
 */
router.get('/:category/venue-scraper', async (req, res) => {
  const startTime = Date.now();

  logRequest(logger, req, 'venueScraperEvents');

  try {
    const { category } = req.params;
    const { location = 'San Francisco, CA', limit = 50 } = req.query;

    const response = await venueScraperClient.searchEvents({
      category,
      location,
      limit: parseInt(limit)
    });

    const processingTime = Date.now() - startTime;

    res.json({
      success: response.success,
      events: response.events || [],
      count: response.count || 0,
      source: 'venue_scraper',
      processingTime,
      timestamp: new Date().toISOString(),
      category,
      location,
      error: response.error || null
    });

  } catch (error) {
    logger.error('Venue scraper error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to read venue scraper cache',
      source: 'venue_scraper',
      processingTime: Date.now() - startTime
    });
  }
});

export default router;
