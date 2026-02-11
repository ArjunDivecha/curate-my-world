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

// Coalesce identical all-categories requests so repeated clicks do not spawn parallel heavy jobs.
const allCategoriesInFlight = new Map();
const allCategoriesResponseCache = new Map();
const ALL_CATEGORIES_CACHE_TTL_MS = 60 * 1000;
const DB_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — survives restarts/deploys

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

/**
 * GET /api/events/all-categories
 * Main endpoint: Three-layer architecture
 *   Layer 1: Ticketmaster (backbone)
 *   Layer 2: Venue Calendar Scraper (gap filler)
 *   Layer 3: Event Validation Gate (quality filter)
 */
router.get('/all-categories', async (req, res) => {
  const startTime = Date.now();
  const { location = 'San Francisco, CA', date_range, limit } = req.query;
  const eventLimit = Math.min(parseInt(limit) || 15, config.api.maxLimit);

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

  const requestKey = JSON.stringify({
    location,
    date_range: date_range || 'next 30 days',
    limit: eventLimit,
    providers: Array.from(selectedProviders).sort()
  });

  const cached = allCategoriesResponseCache.get(requestKey);
  if (cached && (Date.now() - cached.timestamp) < ALL_CATEGORIES_CACHE_TTL_MS) {
    const duration = Date.now() - startTime;
    logger.info('Serving cached all-categories response', {
      location,
      eventLimit,
      ageMs: Date.now() - cached.timestamp,
      duration: `${duration}ms`
    });
    res.json({
      ...cached.payload,
      metadata: {
        ...(cached.payload.metadata || {}),
        responseCache: true,
        cacheAgeMs: Date.now() - cached.timestamp
      }
    });
    logResponse(logger, res, 'allCategoriesEvents-cached', duration, {
      totalEvents: cached.payload.totalEvents || 0
    });
    return;
  }

  // Layer 2 cache: Postgres (survives restarts/deploys, 6h TTL)
  try {
    const dbCached = await readAllCategoriesCache(requestKey);
    if (dbCached && (Date.now() - dbCached.updatedAt) < DB_CACHE_TTL_MS) {
      const ageMs = Date.now() - dbCached.updatedAt;
      const duration = Date.now() - startTime;
      logger.info('Serving DB-cached all-categories response', {
        location,
        eventLimit,
        ageMs,
        duration: `${duration}ms`
      });
      // Also populate in-memory cache so subsequent requests within 60s skip the DB query
      allCategoriesResponseCache.set(requestKey, {
        timestamp: Date.now(),
        payload: dbCached.payload
      });
      res.json({
        ...dbCached.payload,
        metadata: {
          ...(dbCached.payload.metadata || {}),
          dbCache: true,
          dbCacheAgeMs: ageMs
        }
      });
      logResponse(logger, res, 'allCategoriesEvents-dbCached', duration, {
        totalEvents: dbCached.payload.totalEvents || 0
      });
      return;
    }
  } catch (dbErr) {
    logger.warn('DB cache lookup failed, proceeding to live fetch', { error: dbErr.message });
  }

  if (allCategoriesInFlight.has(requestKey)) {
    logger.warn('Coalescing duplicate all-categories request', {
      location,
      eventLimit,
      providers: Array.from(selectedProviders)
    });
    try {
      const { response: sharedResponse } = await allCategoriesInFlight.get(requestKey);
      const duration = Date.now() - startTime;
      res.json({
        ...sharedResponse,
        metadata: {
          ...(sharedResponse.metadata || {}),
          coalesced: true
        }
      });
      logResponse(logger, res, 'allCategoriesEvents-coalesced', duration, {
        totalEvents: sharedResponse.totalEvents || 0
      });
      return;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Coalesced all-categories request failed', {
        error: error.message,
        location,
        processingTime: `${duration}ms`
      });
      res.status(500).json({
        success: false,
        error: error.message,
        eventsByCategory: {},
        categoryStats: {},
        totalEvents: 0,
        categories: [],
        processingTime: duration
      });
      logResponse(logger, res, 'allCategoriesEvents-coalesced', duration, { error: error.message });
      return;
    }
  }

  const computePromise = (async () => {
    const supportedCategories = categoryManager.getSupportedCategories()
      .filter(cat => [
        'music', 'theatre', 'comedy', 'movies', 'art',
        'food', 'tech', 'lectures', 'kids'
      ].includes(cat.name))
      .map(cat => cat.name);

    logger.info('Fetching events from Ticketmaster + Venue Scraper', {
      categories: supportedCategories,
      location,
      eventLimitPerCategory: eventLimit,
      providers: Array.from(selectedProviders)
    });

    // Fetch events for all categories in parallel
    const categoryPromises = supportedCategories.map(async (category) => {
      try {
        const providerResults = {};
        const providerPromises = [];

        const enqueueProvider = (key, factory) => {
          providerPromises.push(
            factory()
              .then(value => ({ key, status: 'fulfilled', value }))
              .catch(error => ({ key, status: 'rejected', reason: error }))
          );
        };

        // Layer 1: Ticketmaster (backbone)
        if (includeTicketmaster) {
          enqueueProvider('ticketmaster', async () => {
            const result = await ticketmasterClient.searchEvents({
              category,
              location,
              limit: eventLimit
            });
            return {
              success: result.success || false,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.processingTime || 0,
              source: 'ticketmaster',
              cost: 0
            };
          });
        }

        // Layer 2: Venue Calendar Scraper (gap filler)
        if (includeVenueScraper) {
          enqueueProvider('venue_scraper', async () => {
            const result = await venueScraperClient.searchEvents({
              category,
              location,
              limit: eventLimit
            });
            return {
              success: result.success || false,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.processingTime || 0,
              source: 'venue_scraper',
              cost: 0
            };
          });
        }

        // Legacy: Whitelist (disabled by default)
        if (includeWhitelist) {
          enqueueProvider('whitelist', async () => {
            const result = await whitelistClient.searchEvents(category, location, { limit: eventLimit });
            return {
              success: true,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.stats?.processingTime || 0,
              source: 'whitelist',
              cost: 0
            };
          });
        }

        const settled = await Promise.all(providerPromises);
        settled.forEach(result => {
          const { key, status } = result;
          if (status === 'fulfilled') {
            providerResults[key] = result.value;
          } else {
            providerResults[key] = {
              success: false,
              events: [],
              count: 0,
              source: key,
              error: result.reason?.message || String(result.reason)
            };
          }
        });

        // Collect event lists for deduplication
        const eventLists = [];
        Object.entries(providerResults).forEach(([key, value]) => {
          if (!value || !Array.isArray(value.events)) return;
          const providerKey = mapSourceToProvider(value.source || key);
          if (!selectedProviders.has(providerKey)) return;
          if (value.events.length === 0) return;
          eventLists.push(value);
        });

        // Deduplicate events for this category
        const deduplicationResult = deduplicator.deduplicateEvents(eventLists);
        const dedupStats = deduplicator.getDeduplicationStats(eventLists, deduplicationResult);

        // Apply whitelist/blacklist rules filter
        const rulesFilteredEvents = applyRulesFilter(deduplicationResult.uniqueEvents);

        // Apply XLSX blacklist filtering
        const blacklistFilteredEvents = filterBlacklistedEvents(rulesFilteredEvents);

        // Layer 3: Event Validation Gate
        const { validEvents: validatedEvents } = filterValidEvents(blacklistFilteredEvents, {
          requireDate: true,
          requireVenue: false
        });

        // Apply location filtering (was missing from /all-categories before!)
        const locationFilteredEvents = locationFilter.filterEventsByLocation(
          validatedEvents,
          location,
          { radiusKm: 50, allowBayArea: true, strictMode: false }
        );

        // Filter out past events
        const pastFilterResult = dateFilter.filterPastEvents(locationFilteredEvents);

        // Apply date range filtering
        const dateFilterResult = dateFilter.filterEventsByDateRange(
          pastFilterResult.filteredEvents,
          date_range || 'next 30 days'
        );

        // Filter by normalized category — ensures events land in the correct bucket
        // Uses centralised normalizeCategory() so "theater" → "theatre", "film" → "movies", etc.
        const categoryFilteredEvents = dateFilterResult.filteredEvents.filter(event => {
          const eventCat = (event.category || '').toLowerCase();
          if (!eventCat) return true; // No category — keep in requested bucket
          const normalized = normalizeCategory(eventCat);
          return normalized === category;
        });

        const sourceStats = {};
        Object.entries(providerResults).forEach(([key, value]) => {
          if (!value) return;
          const mappedKey = value.source || key;
          sourceStats[mappedKey] = {
            count: value.count || 0,
            processingTime: value.processingTime || 0,
            error: value.error,
            cost: value.cost || 0
          };
        });

        return {
          category,
          success: true,
          events: categoryFilteredEvents,
          count: categoryFilteredEvents.length,
          sourceStats,
          providerAttribution: dedupStats?.sourceBreakdown || null,
          totals: dedupStats ? { totalOriginal: dedupStats.totalOriginal, totalUnique: dedupStats.totalUnique } : null
        };

      } catch (error) {
        logger.error(`Error fetching events for category ${category}`, {
          error: error.message,
          category
        });
        return {
          category,
          success: false,
          error: error.message,
          events: [],
          count: 0
        };
      }
    });

    const categoryResults = await Promise.all(categoryPromises);
    const duration = Date.now() - startTime;

    // Organize results by category
    const eventsByCategory = {};
    const categoryStats = {};
    const providerStatsMap = {};
    let totalEvents = 0;

    categoryResults.forEach(result => {
      eventsByCategory[result.category] = result.events || [];
      categoryStats[result.category] = {
        count: result.count || 0,
        success: result.success,
        error: result.error || null,
        sourceStats: result.sourceStats || null,
        providerAttribution: result.providerAttribution || null,
        totals: result.totals || null
      };
      totalEvents += result.count || 0;

      if (result.sourceStats) {
        Object.entries(result.sourceStats).forEach(([rawProviderKey, stats = {}]) => {
          const providerKey = mapSourceToProvider(rawProviderKey);
          const entry = ensureProviderStats(providerStatsMap, providerKey, selectedProviders);
          entry.originalCount += stats.count || 0;
          entry.processingTime = Math.max(entry.processingTime || 0, stats.processingTime || 0);
          entry.cost += stats.cost || 0;
          if ((stats.count || 0) > 0) entry.success = true;
        });
      }

      if (result.providerAttribution) {
        Object.entries(result.providerAttribution).forEach(([provider, stats]) => {
          const providerKey = mapSourceToProvider(provider);
          const entry = ensureProviderStats(providerStatsMap, providerKey, selectedProviders);
          entry.survivedCount += stats.survivedCount || 0;
        });
      }
    });

    // Finalize provider stats
    PROVIDER_ORDER.forEach(providerKey => {
      const entry = ensureProviderStats(providerStatsMap, providerKey, selectedProviders);
      entry.survivedCount = entry.survivedCount || 0;
      entry.originalCount = entry.originalCount || 0;
      entry.duplicatesRemoved = Math.max(0, entry.originalCount - entry.survivedCount);
      entry.success = entry.success || entry.survivedCount > 0;
      entry.enabled = entry.requested && selectedProviders.has(providerKey);
      entry.processingTime = Math.max(0, Math.round(entry.processingTime || 0));
      entry.cost = Number((entry.cost || 0).toFixed(3));
    });

    const providerDetails = PROVIDER_ORDER.map(providerKey => {
      const stats = ensureProviderStats(providerStatsMap, providerKey, selectedProviders);
      return {
        provider: providerKey,
        label: stats.label,
        requested: stats.requested,
        enabled: stats.enabled,
        success: stats.success,
        originalCount: stats.originalCount,
        survivedCount: stats.survivedCount,
        duplicatesRemoved: stats.duplicatesRemoved,
        processingTime: stats.processingTime,
        cost: stats.cost
      };
    });

    logger.info('All categories fetch completed', {
      totalEvents,
      categories: supportedCategories.length,
      duration: `${duration}ms`,
      providers: Array.from(selectedProviders)
    });

    // Check if venue scraper is refreshing in the background
    const venueHealth = await venueScraperClient.getHealthStatus();
    const backgroundRefreshing = venueHealth.backgroundRefreshing || false;

    const response = {
      success: true,
      eventsByCategory,
      categoryStats,
      totalEvents,
      categories: supportedCategories,
      providerStats: providerStatsMap,
      providerDetails,
      processingTime: duration,
      backgroundRefreshing,
      metadata: {
        location,
        dateRange: date_range || 'next 30 days',
        limitPerCategory: eventLimit,
        categoriesFetched: supportedCategories.length,
        requestId: `all_categories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    return { response, duration, categoriesFetched: supportedCategories.length };
  })();

  allCategoriesInFlight.set(requestKey, computePromise);

  try {
    const { response, duration, categoriesFetched } = await computePromise;
    allCategoriesResponseCache.set(requestKey, {
      timestamp: Date.now(),
      payload: response
    });
    // Persist to Postgres so the cache survives restarts/deploys
    writeAllCategoriesCache(requestKey, response).catch(err => {
      logger.warn('Failed to persist all-categories cache to DB', { error: err.message });
    });
    res.json(response);
    logResponse(logger, res, 'allCategoriesEvents', duration, {
      totalEvents: response.totalEvents,
      categoriesFetched
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('All categories events error', {
      error: error.message,
      location,
      processingTime: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: error.message,
      eventsByCategory: {},
      categoryStats: {},
      totalEvents: 0,
      categories: [],
      processingTime: duration
    });

    logResponse(logger, res, 'allCategoriesEvents', duration, { error: error.message });
  } finally {
    allCategoriesInFlight.delete(requestKey);
  }
});

/**
 * GET /api/events/refresh-status
 * Lightweight polling endpoint for frontend to check if a background
 * venue scrape is in progress. Used for the "Refreshing Data" indicator.
 */
router.get('/refresh-status', async (req, res) => {
  const health = await venueScraperClient.getHealthStatus();
  res.json({
    refreshing: health.backgroundRefreshing || false,
    lastUpdated: health.lastUpdated || null,
    ageHours: health.ageHours,
    isStale: health.isStale || false,

    // Extra status for UI (non-breaking; existing fields preserved)
    message: health.message || null,
    latestRunStatus: health.latestRunStatus || null,
    storageMode: health.storageMode || null,
    venueCount: typeof health.venueCount === 'number' ? health.venueCount : null,
    totalEvents: typeof health.totalEvents === 'number' ? health.totalEvents : null
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
