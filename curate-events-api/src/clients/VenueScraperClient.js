/**
 * =============================================================================
 * SCRIPT NAME: VenueScraperClient.js
 * =============================================================================
 *
 * DESCRIPTION:
 * Cache reader client for venue-scraped events. Reads from the pre-built
 * venue-events-cache.json (populated by scripts/scrape-venues.js) and
 * returns events in the same standardized format as TicketmasterClient.
 *
 * Stale-while-revalidate: always returns cached data immediately, but if the
 * cache is older than 24h, spawns the scraper as a background child process.
 * The user never waits for the scrape — they see current events instantly,
 * and fresh data appears on the next fetch after the scrape completes.
 *
 * VERSION: 1.1
 * LAST UPDATED: 2026-02-07
 * AUTHOR: Claude Code
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';
import { normalizeCategory } from '../utils/categoryMapping.js';
import {
  getLatestVenueScrapeRun,
  readVenueCacheFromDb,
  upsertVenueCacheToDb,
} from '../utils/venueCacheDb.js';

const logger = createLogger('VenueScraperClient');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CACHE_PATH = path.resolve(__dirname, '../../../data/venue-events-cache.json');
const SCRAPER_SCRIPT = path.resolve(__dirname, '../../scripts/scrape-venues.js');
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export class VenueScraperClient {
  constructor(cachePath) {
    this.cachePath = cachePath || DEFAULT_CACHE_PATH;
    const configuredMode = (process.env.VENUE_CACHE_STORAGE_MODE || '').toLowerCase().trim();
    const defaultMode = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL ? 'db' : 'file';
    this.storageMode = (configuredMode === 'db' || configuredMode === 'file') ? configuredMode : defaultMode;
    this._cache = null;
    this._cacheLoadedAt = null;
    this._cacheTTL = 5 * 60 * 1000; // Re-read file every 5 minutes
    this._scrapeInProgress = false;
    this._lastScrapeTriggeredAt = null;
  }

  /**
   * Load or refresh the cache (DB or file).
   * Returns the parsed cache object, or null if missing/corrupt/unavailable.
   */
  async _loadCache() {
    const now = Date.now();
    if (this._cache && this._cacheLoadedAt && (now - this._cacheLoadedAt < this._cacheTTL)) {
      return this._cache;
    }

    const loadFromFile = () => {
      try {
        if (!fs.existsSync(this.cachePath)) {
          logger.warn('Venue events cache file not found', { path: this.cachePath });
          return null;
        }

        const raw = fs.readFileSync(this.cachePath, 'utf-8');
        return JSON.parse(raw);
      } catch (error) {
        logger.error('Failed to load venue events cache from file', { error: error.message, path: this.cachePath });
        return null;
      }
    };

    try {
      let cache = null;

      if (this.storageMode === 'db') {
        const [dbCache, fileCache] = await Promise.all([
          readVenueCacheFromDb(),
          Promise.resolve(loadFromFile()),
        ]);

        const getLastUpdatedMs = (value) => {
          if (!value?.lastUpdated) return null;
          const ms = new Date(value.lastUpdated).getTime();
          return Number.isFinite(ms) ? ms : null;
        };

        const dbMs = getLastUpdatedMs(dbCache);
        const fileMs = getLastUpdatedMs(fileCache);

        if (dbCache && fileCache) {
          cache = (fileMs !== null && (dbMs === null || fileMs > dbMs)) ? fileCache : dbCache;
        } else {
          cache = dbCache || fileCache || null;
        }

        // If file is fresher, seed/repair DB in the background.
        if (cache === fileCache && fileCache) {
          void upsertVenueCacheToDb(fileCache);
        }
      } else {
        cache = loadFromFile();
      }

      this._cache = cache;
      this._cacheLoadedAt = now;
      return this._cache;
    } catch (error) {
      logger.error('Failed to load venue events cache', { error: error.message, storageMode: this.storageMode });
      return null;
    }
  }

  /**
   * Get all events from cache, optionally filtered by category.
   * Only returns future events.
   */
  async _getAllEvents(category) {
    const cache = await this._loadCache();
    if (!cache || !cache.venues) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const events = [];

    for (const venueData of Object.values(cache.venues)) {
      if (!venueData.events || !Array.isArray(venueData.events)) continue;

      for (const event of venueData.events) {
        // Normalize event category using central mapping (e.g. "theater" → "theatre")
        if (event.category) {
          event.category = normalizeCategory(event.category);
        }

        // Filter by category if specified
        if (category && category !== 'all') {
          const eventCat = (event.category || '').toLowerCase();
          const targetCat = category.toLowerCase();
          // Match on normalized event category; fall back to venue's default only if event has no category
          if (eventCat) {
            if (eventCat !== targetCat) continue;
          } else {
            // No event category — use venue default
            if ((venueData.category || '').toLowerCase() !== targetCat) continue;
          }
        }

        // Only include future events
        if (event.startDate) {
          try {
            const eventDate = new Date(event.startDate);
            if (eventDate < now) continue;
          } catch {
            // Keep events with unparseable dates
          }
        }

        // Filter out events that are clearly not in the Bay Area based on title
        const titleLower = (event.title || '').toLowerCase();
        const nonLocalSignals = [
          'istanbul', 'london', 'dubai', 'hong kong', 'amsterdam', 'oslo',
          'nairobi', 'pune', 'india', 'paraguay', 'lima', 'são paulo',
          'brazil', 'singapore', 'tokyo', 'berlin', 'paris', 'sydney',
          'toronto', 'melbourne', 'barcelona', 'madrid', 'mumbai',
          'bangkok', 'seoul', 'taipei', 'vietnam', 'africa', 'europe',
          'cern', 'new york', 'nyc', 'chicago', 'austin', 'miami',
          'seattle', 'boston', 'denver', 'las vegas', 'atlanta',
          'portland', 'phoenix', 'dallas', 'houston',
        ];
        if (nonLocalSignals.some(s => titleLower.includes(s))) {
          continue; // Skip obviously non-local events
        }

        // Filter out events with non-Bay Area cities (from global listing sites)
        if (event.city) {
          const cityLower = event.city.toLowerCase().trim();
          const bayAreaCities = [
            'san francisco', 'oakland', 'berkeley', 'san jose', 'palo alto',
            'mountain view', 'sunnyvale', 'santa clara', 'redwood city',
            'menlo park', 'fremont', 'hayward', 'concord', 'walnut creek',
            'san mateo', 'daly city', 'richmond', 'santa cruz', 'sausalito',
            'mill valley', 'tiburon', 'napa', 'sonoma', 'petaluma',
            'san rafael', 'novato', 'livermore', 'pleasanton', 'cupertino',
            'campbell', 'los gatos', 'saratoga', 'milpitas', 'union city',
            'alameda', 'emeryville', 'half moon bay', 'pacifica',
            'south san francisco', 'burlingame', 'san bruno', 'foster city',
            'belmont', 'san carlos', 'woodside', 'portola valley',
            'los altos', 'stanford', 'east palo alto',
          ];
          if (!bayAreaCities.some(ba => cityLower.includes(ba))) {
            continue; // Skip non-Bay Area events
          }
        }

        // Ensure every event has a URL — fall back to venue homepage
        // (avoid /events or /shows suffixes which trip the listing-URL validator)
        if (!event.eventUrl && event.venueDomain) {
          event.eventUrl = `https://${event.venueDomain}`;
        }

        events.push(event);
      }
    }

    return events;
  }

  /**
   * Check if the cache is stale and trigger a background scrape if needed.
   * Always returns immediately — never blocks the caller.
   */
  async _maybeRefreshInBackground() {
    const refreshMode = (process.env.VENUE_BACKGROUND_REFRESH || '').toLowerCase().trim();
    if (refreshMode === 'disabled' || refreshMode === 'off' || refreshMode === 'false' || refreshMode === '0') {
      return;
    }

    // Don't double-trigger
    if (this._scrapeInProgress) return;

    const cache = await this._loadCache();
    if (!cache || !cache.lastUpdated) return;

    const ageMs = Date.now() - new Date(cache.lastUpdated).getTime();
    if (ageMs < STALE_THRESHOLD_MS) return;

    // Don't re-trigger within 30 min of the last attempt
    if (this._lastScrapeTriggeredAt && (Date.now() - this._lastScrapeTriggeredAt < 30 * 60 * 1000)) return;

    this._scrapeInProgress = true;
    this._lastScrapeTriggeredAt = Date.now();

    const ageHours = Math.round(ageMs / (1000 * 60 * 60));
    logger.info(`Cache is ${ageHours}h old (>${STALE_THRESHOLD_MS / (1000 * 60 * 60)}h). Spawning background scrape.`);

    try {
      const args = [SCRAPER_SCRIPT];
      if (this.storageMode === 'db') {
        args.push('--write-db');
      }

      const child = spawn('node', args, {
        stdio: 'ignore',
        detached: true,
        env: { ...process.env }
      });

      child.unref(); // Let the parent exit without waiting

      child.on('exit', (code) => {
        this._scrapeInProgress = false;
        if (code === 0) {
          // Force re-read from disk on next request
          this._cacheLoadedAt = null;
          logger.info('Background venue scrape completed successfully');
        } else {
          logger.warn(`Background venue scrape exited with code ${code}`);
        }
      });

      child.on('error', (err) => {
        this._scrapeInProgress = false;
        logger.error('Failed to spawn background venue scrape', { error: err.message });
      });
    } catch (err) {
      this._scrapeInProgress = false;
      logger.error('Error starting background scrape', { error: err.message });
    }
  }

  /**
   * Search for events - matches the TicketmasterClient interface.
   * Returns cached data immediately. If cache is stale, triggers a background
   * refresh so the next fetch gets fresh data (stale-while-revalidate).
   * @param {Object} options - { category, location, limit }
   * @returns {Promise<Object>} Standard provider response
   */
  async searchEvents({ category, location, limit = 50 }) {
    const startTime = Date.now();

    // Check staleness and kick off background refresh if needed (non-blocking)
    void this._maybeRefreshInBackground();

    try {
      const allEvents = await this._getAllEvents(category);

      // Apply limit
      const limitedEvents = allEvents.slice(0, limit);

      const processingTime = Date.now() - startTime;

      logger.info('Venue scraper cache read', {
        category,
        totalCached: allEvents.length,
        returned: limitedEvents.length,
        processingTime: `${processingTime}ms`,
        backgroundScrapeRunning: this._scrapeInProgress
      });

      return {
        success: true,
        events: limitedEvents,
        count: limitedEvents.length,
        processingTime,
        source: 'venue_scraper',
        cost: 0,
        backgroundRefreshing: this._scrapeInProgress
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Venue scraper search error', { error: error.message, category });
      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        processingTime,
        source: 'venue_scraper',
        cost: 0
      };
    }
  }

  /**
   * Get health status of the venue scraper cache.
   * @returns {Object} Health status
   */
  async getHealthStatus() {
    const cache = await this._loadCache();

    if (!cache) {
      return {
        status: 'unhealthy',
        message: 'Cache not found or unreadable',
        cachePath: this.cachePath,
        storageMode: this.storageMode
      };
    }

    const lastUpdated = cache.lastUpdated ? new Date(cache.lastUpdated) : null;
    const ageHours = lastUpdated ? (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60) : null;
    const venueCount = cache.venues ? Object.keys(cache.venues).length : 0;
    const totalEvents = cache.totalEvents || 0;
    const isStale = ageHours !== null && ageHours > 48;

    // If we have DB access, use the latest run status as a stronger signal than in-memory state.
    // This makes refresh-status resilient to server restarts.
    let dbRun = null;
    let backgroundRefreshing = this._scrapeInProgress;
    if (this.storageMode === 'db') {
      dbRun = await getLatestVenueScrapeRun();
      if (dbRun?.status === 'running' && dbRun.started_at) {
        const startedAt = new Date(dbRun.started_at).getTime();
        // Treat a run as "active" only within a reasonable window (avoid "stuck running forever").
        if (Date.now() - startedAt < 3 * 60 * 60 * 1000) {
          backgroundRefreshing = true;
        }
      }
    }

    let message;
    if (backgroundRefreshing) {
      message = `Cache is ${ageHours !== null ? Math.round(ageHours) + 'h' : 'unknown age'} old — background refresh in progress`;
    } else if (isStale) {
      message = `Cache is ${Math.round(ageHours)}h old (>48h stale). Will auto-refresh on next fetch.`;
    } else {
      message = `Cache is ${ageHours !== null ? Math.round(ageHours) + 'h' : 'unknown age'} old with ${totalEvents} events from ${venueCount} venues`;
    }

    return {
      status: isStale ? 'degraded' : 'healthy',
      cacheExists: true,
      lastUpdated: cache.lastUpdated,
      ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
      isStale,
      backgroundRefreshing,
      storageMode: this.storageMode,
      latestRunStatus: dbRun?.status || null,
      venueCount,
      totalEvents,
      stats: cache.metadata?.stats || null,
      message
    };
  }
}

export default VenueScraperClient;
