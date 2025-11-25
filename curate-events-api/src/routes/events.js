/**
 * =============================================================================
 * SCRIPT NAME: events.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Express routes for event collection endpoints.
 * Integrates with EventPipeline to provide RESTful API access to events.
 * 
 * ENDPOINTS:
 * - GET /api/events/:category - Fetch events by category
 * - GET /api/events/categories - List supported categories
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-29
 * AUTHOR: Claude Code
 * =============================================================================
 */

import express from 'express';
import { EventPipeline } from '../pipeline/EventPipeline.js';
import { CategoryManager } from '../managers/CategoryManager.js';
import { EventDeduplicator } from '../utils/eventDeduplicator.js';
import { ExaClient } from '../clients/ExaClient.js';
import SerperClient from '../clients/SerperClient.js';
import TicketmasterClient from '../clients/TicketmasterClient.js';
import PerplexitySearchClient from '../clients/PerplexitySearchClient.js';
import { LocationFilter } from '../utils/locationFilter.js';
import { DateFilter } from '../utils/dateFilter.js';
import { createLogger, logRequest, logResponse } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { eventCache } from '../utils/cache.js';
import { buildCustomEventPrompt, buildProviderSearchQuery } from '../utils/promptUtils.js';
import { filterEvents as applyRulesFilter } from '../utils/rulesFilter.js';

const router = express.Router();
const logger = createLogger('EventsRoute');

// Initialize pipeline with API key from config
const eventPipeline = new EventPipeline(config.perplexityApiKey);
const categoryManager = new CategoryManager();
const exaClient = new ExaClient();
const serperClient = new SerperClient();
const ticketmasterClient = new TicketmasterClient();
const perplexitySearchClient = new PerplexitySearchClient();
const deduplicator = new EventDeduplicator();
const locationFilter = new LocationFilter();
const dateFilter = new DateFilter();

// Provider metadata
const PROVIDER_LABELS = {
  sonoma: 'Sonoma',
  serper: 'Serper',
  exa: 'EXA',
  perplexity: 'Perplexity (LLM)',
  // Removed: Apyflux, PredictHQ
  ticketmaster: 'Ticketmaster',
  pplx: 'Perplexity Search',
  pplx_search: 'Perplexity Search'
};

const ALL_PROVIDERS = [
  'sonoma',
  'serper',
  'exa',
  'perplexity',
  'ticketmaster',
  'pplx'
];

const SOURCE_PROVIDER_MAP = {
  serper: 'serper',
  serpapi: 'serper',
  exa: 'exa',
  exa_fast: 'exa',
  sonoma: 'sonoma',
  perplexity_api: 'perplexity',
  // Removed legacy mappings: apyflux_api, predicthq_api
  ticketmaster: 'ticketmaster',
  pplx_search: 'pplx'
};

const PROVIDER_DEFAULTS = {
  sonoma: config.superHybrid?.enabledByDefault !== false,
  serper: true,
  exa: true,
  perplexity: !(config.sources?.disablePerplexityByDefault ?? false),
  ticketmaster: !(config.sources?.disableTicketmasterByDefault ?? false),
  pplx: !(config.sources?.disablePplxSearchByDefault ?? false)
};

const PROVIDER_ORDER = [
  'ticketmaster',
  'serper',
  'exa',
  'sonoma',
  'perplexity',
  'pplx'
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

async function fetchTicketmasterByCategory(categories, location, limit) {
  const perCategory = {};
  let total = 0;
  let processingTime = 0;

  for (const category of categories) {
    const result = await ticketmasterClient.searchEvents({ category, location, limit });
    processingTime += result.processingTime || 0;
    const events = Array.isArray(result.events) ? result.events : [];
    perCategory[category] = events;
    total += events.length;
  }

  return {
    perCategory,
    total,
    processingTime,
    cost: 0
  };
}

async function fetchPplxByCategory(categories, location, limit) {
  const perCategory = {};
  let total = 0;
  let processingTime = 0;
  let cost = 0;

  for (const category of categories) {
    const result = await perplexitySearchClient.searchEvents({ category, location, limit });
    processingTime += result.processingTime || 0;
    cost += result.cost || 0;
    const events = Array.isArray(result.events) ? result.events : [];
    perCategory[category] = events;
    total += events.length;
  }

  return {
    perCategory,
    total,
    processingTime,
    cost: Number(cost.toFixed(3))
  };
}

async function augmentWithAdditionalProviders({
  eventsByCategory,
  categoryStats,
  categories,
  location,
  limit,
  selectedProviders,
  includeTicketmaster,
  includePplx,
  providerStats,
  deduplicatorInstance
}) {
  const additionalResults = {};

  if (includeTicketmaster) {
    additionalResults.ticketmaster = await fetchTicketmasterByCategory(categories, location, limit);
  }

  if (includePplx) {
    additionalResults.pplx = await fetchPplxByCategory(categories, location, limit);
  }

  const survivedCounts = {};
  let totalEvents = 0;

  const mappedCategories = categories.length ? categories : Object.keys(eventsByCategory);

  mappedCategories.forEach(category => {
    const existing = eventsByCategory[category] || [];
    const filteredExisting = existing.filter(ev => selectedProviders.has(mapSourceToProvider(ev.source)));

    const eventLists = [
      { source: 'existing', events: filteredExisting }
    ];

    if (includeTicketmaster) {
      eventLists.push({
        source: 'ticketmaster',
        events: additionalResults.ticketmaster.perCategory[category] || []
      });
    }

    if (includePplx) {
      eventLists.push({
        source: 'pplx_search',
        events: additionalResults.pplx.perCategory[category] || []
      });
    }

    const deduped = deduplicatorInstance.deduplicateEvents(eventLists);
    const dedupedEvents = deduped.uniqueEvents || [];
    // Apply whitelist/blacklist rules filter
    const uniqueEvents = applyRulesFilter(dedupedEvents);
    eventsByCategory[category] = uniqueEvents;

    if (!categoryStats[category]) {
      categoryStats[category] = {
        count: uniqueEvents.length,
        success: true,
        error: null
      };
    } else {
      categoryStats[category].count = uniqueEvents.length;
    }

    uniqueEvents.forEach(ev => {
      const providerKey = mapSourceToProvider(ev.source);
      survivedCounts[providerKey] = (survivedCounts[providerKey] || 0) + 1;
    });

    totalEvents += uniqueEvents.length;
  });

  // Update provider stats with additional providers
  if (includeTicketmaster) {
    const stats = ensureProviderStats(providerStats, 'ticketmaster', selectedProviders);
    stats.originalCount += additionalResults.ticketmaster.total;
    stats.processingTime += additionalResults.ticketmaster.processingTime;
    stats.cost += additionalResults.ticketmaster.cost;
  }

  if (includePplx) {
    const stats = ensureProviderStats(providerStats, 'pplx', selectedProviders);
    stats.originalCount += additionalResults.pplx.total;
    stats.processingTime += additionalResults.pplx.processingTime;
    stats.cost += additionalResults.pplx.cost;
  }

  // Finalize survivor counts and duplicates removed
  Object.keys(providerStats).forEach(providerKey => {
    const stats = providerStats[providerKey];
    if (!stats) return;
    stats.survivedCount = survivedCounts[providerKey] || 0;
    stats.duplicatesRemoved = Math.max(0, (stats.originalCount || 0) - stats.survivedCount);
    stats.success = stats.survivedCount > 0;
    stats.enabled = stats.enabled && stats.requested;
  });

  return {
    eventsByCategory,
    categoryStats,
    totalEvents,
    providerStats
  };
}

/**
 * GET /api/events/:category/combined
 * Get events from all three sources (Perplexity, Apyflux, PredictHQ) with deduplication
 */
router.get('/:category/combined', async (req, res) => {
  const startTime = Date.now();
  
  logRequest(logger, req, 'combinedEvents');
  
  try {
    const { category } = req.params;
    const { location, date_range, limit } = req.query;
    const disablePerplexity = ['true', '1', 'yes'].includes(String(req.query.disable_perplexity || '').toLowerCase()) || config.sources?.disablePerplexityByDefault;
    
    // Validate required parameters
    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location parameter is required',
        example: '/api/events/theatre/combined?location=San Francisco, CA',
        timestamp: new Date().toISOString()
      });
    }

    const eventLimit = limit ? parseInt(limit) : 20;
    
    logger.info('Starting combined event collection', {
      category,
      location,
      dateRange: date_range,
      limit: eventLimit
    });

    // Perplexity via EventPipeline (Apyflux removed)
    const [perplexityResult] = await Promise.allSettled([
      (disablePerplexity
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'perplexity_api' })
        : eventPipeline.collectEvents({
            category,
            location,
            dateRange: date_range,
            options: {
              limit: eventLimit,
              minConfidence: 0.5,
              maxTokens: config.perplexity.maxTokens,
              temperature: config.perplexity.temperature
            }
          }).then(result => ({ ...result, source: 'perplexity_api' }))
      )
    ]);

    // Prepare event lists for deduplication
    const eventLists = [];
    
    if (perplexityResult.status === 'fulfilled' && perplexityResult.value.success) {
      const pr = { ...perplexityResult.value, source: 'perplexity_api' };
      eventLists.push(pr);
    }
    
    // Apyflux removed

    // Deduplicate events
    const deduplicationResult = deduplicator.deduplicateEvents(eventLists);
    
    // Apply whitelist/blacklist rules filter
    const rulesFilteredEvents = applyRulesFilter(deduplicationResult.uniqueEvents);
    
    const duration = Date.now() - startTime;

    // Build response
    const response = {
      success: true,
      events: rulesFilteredEvents,
      count: rulesFilteredEvents.length,
      deduplication: {
        totalProcessed: deduplicationResult.totalProcessed,
        duplicatesRemoved: deduplicationResult.duplicatesRemoved,
        duplicateGroups: deduplicationResult.duplicateGroups,
        sources: deduplicationResult.sources
      },
      sources: {
        perplexity: {
          status: perplexityResult.status,
          count: perplexityResult.status === 'fulfilled' ? perplexityResult.value.count || 0 : 0,
          success: perplexityResult.status === 'fulfilled' ? perplexityResult.value.success : false
        }
      },
      processingTime: `${duration}ms`,
      category,
      location,
      dateRange: date_range || 'next 30 days',
      timestamp: new Date().toISOString()
    };

    logger.info('Combined event collection completed', {
      category,
      location,
      totalEvents: deduplicationResult.totalProcessed,
      uniqueEvents: deduplicationResult.uniqueEvents.length,
      duplicatesRemoved: deduplicationResult.duplicatesRemoved,
      duration: `${duration}ms`
    });

    logResponse(logger, res, 'combinedEvents', duration);
    res.json(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Error in combined event collection', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      query: req.query,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error during combined collection',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/events/:category/compare
 * Compare Perplexity and Apyflux results side by side
 */
router.get('/:category/compare', async (req, res) => {
  const startTime = Date.now();
  
  logRequest(logger, req, 'compareEvents');
  
  try {
    const { category } = req.params;
    const { location, date_range, limit } = req.query;
    const disablePerplexity = ['true', '1', 'yes'].includes(String(req.query.disable_perplexity || '').toLowerCase()) || config.sources?.disablePerplexityByDefault;
    
    // Validate required parameters
    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location parameter is required',
        example: '/api/events/theatre/compare?location=San Francisco, CA',
        timestamp: new Date().toISOString()
      });
    }

    const eventLimit = limit ? parseInt(limit) : 10;
    
    logger.info('Starting event comparison', {
      category,
      location,
      dateRange: date_range,
      limit: eventLimit
    });

    // Perplexity only
    const [perplexityResult] = await Promise.allSettled([
      (disablePerplexity
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'perplexity_api' })
        : eventPipeline.collectEvents({
            category,
            location,
            dateRange: date_range,
            options: {
              limit: eventLimit,
              minConfidence: 0.5,
              maxTokens: config.perplexity.maxTokens,
              temperature: config.perplexity.temperature
            }
          }).then(result => ({ ...result, source: 'perplexity_api' }))
      )
    ]);

    const duration = Date.now() - startTime;

    // Process results
    const comparison = {
      success: true,
      comparison: {
        perplexity: {
          status: perplexityResult.status,
          ...(perplexityResult.status === 'fulfilled' ? perplexityResult.value : {
            success: false,
            error: perplexityResult.reason?.message || 'Unknown error',
            events: [],
            count: 0
          })
        }
      },
      summary: {
        perplexityCount: perplexityResult.status === 'fulfilled' ? perplexityResult.value.count || 0 : 0,
        totalProcessingTime: `${duration}ms`,
        category,
        location,
        dateRange: date_range || 'next 30 days'
      },
      timestamp: new Date().toISOString()
    };

    logger.info('Event comparison completed', {
      category,
      location,
      perplexityEvents: comparison.summary.perplexityCount,
      duration: `${duration}ms`
    });

    logResponse(logger, res, 'compareEvents', duration);
    res.json(comparison);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Error in event comparison', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      query: req.query,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error during comparison',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/events/all-categories
 * Get events from all categories using the best-performing source combination
 */
router.get('/all-categories', async (req, res) => {
  const startTime = Date.now();
  const { location = 'San Francisco, CA', date_range, limit, custom_prompt } = req.query;
  const eventLimit = Math.min(parseInt(limit) || 15, config.api.maxLimit);
  
  logRequest(logger, req, 'allCategoriesEvents', { location, date_range, limit });

  let selectedProviders = parseProviderSelection(req);
  if (selectedProviders.size === 0) {
    const rawProviders = Array.isArray(req.query.providers)
      ? req.query.providers.join(',')
      : String(req.query.providers || '');
    logger.warn('No recognized providers parsed; falling back to defaults', {
      location,
      rawProviders
    });
    selectedProviders = new Set(
      Object.entries(PROVIDER_DEFAULTS)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
    );
  }
  let includeTicketmaster = selectedProviders.has('ticketmaster');
  let includePplx = selectedProviders.has('pplx');
  let includeSerper = selectedProviders.has('serper');
  let includeExa = selectedProviders.has('exa');
  let includeSonoma = selectedProviders.has('sonoma');
  let includePerplexityProvider = selectedProviders.has('perplexity');

  // Optional source toggles
  const disablePerplexityQuery = ['true', '1', 'yes'].includes(String(req.query.disable_perplexity || '').toLowerCase());

  const disablePerplexity = disablePerplexityQuery || !includePerplexityProvider;

  if (disablePerplexity) includePerplexityProvider = false;

  // Super-Hybrid mode (Phase 1: Production Switch):
  // Default to super-hybrid unless mode=legacy is specified
  // Smart fallback to legacy if super-hybrid fails or returns insufficient results
  const useLegacyMode = String(req.query.mode || '').toLowerCase() === 'legacy';
  const useSuperHybrid = !useLegacyMode && includeSonoma; // Only use super-hybrid when Sonoma is requested
  
  try {
    if (useSuperHybrid) {
      try {
        const supportedCategories = categoryManager.getSupportedCategories()
          .filter(cat => [
            // Tier 1: High volume (Ticketmaster + all sources)
            'music', 'theatre', 'comedy', 'movies', 'art',
            // Tier 2: Good coverage (web + some providers)
            'food', 'tech', 'lectures', 'kids'
          ].includes(cat.name))
          .map(cat => cat.name);

        // First try FULL SEARCH mode (includes both speed-demon + Sonoma for 903+ events)
        const fullUrl = new URL('/super-hybrid/search', config.superHybrid.url);
        fullUrl.searchParams.set('location', String(location));
        fullUrl.searchParams.set('limit', String(eventLimit));
        fullUrl.searchParams.set('categories', supportedCategories.join(','));
        logger.info('Attempting FULL SEARCH mode (speed-demon + Sonoma)', { 
          component: 'EventsRoute', 
          url: fullUrl.toString(),
          timestamp: new Date().toISOString()
        });
        let shRes = await fetch(fullUrl.toString());
        if (!shRes.ok) {
          logger.info('FULL SEARCH mode failed, falling back to turbo-only', { 
            component: 'EventsRoute',
            fullSearchStatus: shRes.status,
            fullSearchStatusText: shRes.statusText,
            timestamp: new Date().toISOString()
          });
          // Fallback to turbo-only mode
          const turboUrl = new URL('/super-hybrid/turbo', config.superHybrid.url);
          turboUrl.searchParams.set('location', String(location));
          turboUrl.searchParams.set('limit', String(eventLimit));
          shRes = await fetch(turboUrl.toString());
        } else {
          logger.info('FULL SEARCH mode succeeded', { 
            component: 'EventsRoute',
            fullSearchStatus: shRes.status,
            timestamp: new Date().toISOString()
          });
        }
        if (shRes.ok) {
          const sh = await shRes.json();
          const eventsByCategory = {};
          const categoryStats = {};
          const aggregatedProviderStats = {};
          let totalEvents = 0;
          (sh.events || []).forEach(ev => {
            const cat = ev.category || 'general';
            if (!eventsByCategory[cat]) eventsByCategory[cat] = [];
            eventsByCategory[cat].push(ev);
          });
          Object.entries(eventsByCategory).forEach(([cat, list]) => {
            categoryStats[cat] = { count: list.length, success: true, error: null, sourceStats: null, providerAttribution: null, totals: null };
            totalEvents += list.length;
            list.forEach(ev => {
              const p = ev.source || 'unknown';
              if (!aggregatedProviderStats[p]) aggregatedProviderStats[p] = { originalCount: 0, survivedCount: 0, duplicatesRemoved: 0 };
              aggregatedProviderStats[p].originalCount++;
              aggregatedProviderStats[p].survivedCount++;
            });
          });
          if (totalEvents >= 5) { // Require minimum 5 events for success
            const duration = Date.now() - startTime;

            const providerStats = {};
            Object.entries(aggregatedProviderStats).forEach(([key, stats]) => {
              const providerKey = mapSourceToProvider(key);
              const entry = ensureProviderStats(providerStats, providerKey, selectedProviders);
              entry.originalCount += stats.originalCount || stats.survivedCount || 0;
              entry.survivedCount += stats.survivedCount || 0;
              entry.duplicatesRemoved += stats.duplicatesRemoved || 0;
              entry.success = entry.survivedCount > 0;
            });

            const augmentation = await augmentWithAdditionalProviders({
              eventsByCategory,
              categoryStats,
              categories: supportedCategories,
              location,
              limit: eventLimit,
              selectedProviders,
              includeTicketmaster,
              includePplx,
              providerStats,
              deduplicatorInstance: deduplicator
            });

            const finalProviderStats = augmentation.providerStats;
            const finalEventsByCategory = augmentation.eventsByCategory;
            const finalCategoryStats = augmentation.categoryStats;
            const finalTotalEvents = Object.values(finalEventsByCategory).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);

            const providerDetails = PROVIDER_ORDER.map(providerKey => {
              const stats = ensureProviderStats(finalProviderStats, providerKey, selectedProviders);
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

            logger.info('Super-hybrid mode success', {
              totalEvents: finalTotalEvents,
              categories: Object.keys(finalEventsByCategory).length,
              duration: `${duration}ms`
            });

            return res.json({
              success: true,
              eventsByCategory: finalEventsByCategory,
              categoryStats: finalCategoryStats,
              totalEvents: finalTotalEvents,
              categories: Object.keys(finalEventsByCategory),
              providerStats: finalProviderStats,
              providerDetails,
              processingTime: duration,
              metadata: {
                location,
                dateRange: date_range || 'next 30 days',
                limitPerCategory: eventLimit,
                categoriesFetched: Object.keys(finalEventsByCategory).length,
                customMode: false,
                superHybrid: true,
                requestId: `sh_all_categories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              }
            });
          } else {
            logger.warn('Super-hybrid returned insufficient events, falling back to legacy', { 
              totalEvents,
              threshold: 5 
            });
          }
          // Fall through to legacy if insufficient events
        }
      } catch (error) {
        logger.error('Super-Hybrid proxy error, falling back to legacy', { 
          error: error.message,
          location,
          eventLimit 
        });
        // Fall through to legacy behavior if SH fails
      }
    } else {
      logger.info('Using legacy mode explicitly requested', { location, eventLimit });
    }
    const rawCustomPrompt = (custom_prompt || '').trim();
    const isCustomMode = rawCustomPrompt.length > 0;
    const appliedCustomPrompt = isCustomMode
      ? buildCustomEventPrompt({
          userPrompt: rawCustomPrompt,
          location,
          dateRange: date_range || 'next 30 days',
          limit: eventLimit * 5
        })
      : '';
    
    if (isCustomMode) {
      // Custom AI Instructions mode: Use only the custom prompt, skip category-based search
      logger.info('Using custom AI instructions mode', {
        rawPrompt: rawCustomPrompt.substring(0, 100) + '...',
        appliedPrompt: appliedCustomPrompt.substring(0, 120) + '...',
        location,
        eventLimit: eventLimit * 5 // Higher limit for custom search
      });
      
      // Single search with custom prompt instead of category-based searches
      const customResult = await eventPipeline.collectEvents({
        category: 'general', // Placeholder category
        location,
        dateRange: date_range,
        customPrompt: appliedCustomPrompt,
        options: {
          limit: eventLimit * 5, // Higher limit for custom search
          minConfidence: 0.5,
          maxTokens: config.perplexity.maxTokens,
          temperature: config.perplexity.temperature
        }
      });
      
      const duration = Date.now() - startTime;
      
      // Return custom search results
      if (customResult.success) {
        const response = {
          success: true,
          eventsByCategory: {
            'custom_search': customResult.events
          },
          categoryStats: {
            'custom_search': { count: customResult.events.length }
          },
          totalEvents: customResult.events.length,
          processingTime: duration,
          searchMode: 'custom_ai_instructions',
          customPrompt: rawCustomPrompt.substring(0, 200) + '...',
          appliedPrompt: appliedCustomPrompt.substring(0, 200) + '...',
          timestamp: new Date().toISOString()
        };
        
        logResponse(logger, req, response, 'allCategoriesEvents');
        return res.json(response);
      } else {
        throw new Error(customResult.error || 'Custom search failed');
      }
    }
    
    // Regular category-based search mode
    const supportedCategories = categoryManager.getSupportedCategories()
      .filter(cat => [
        // Tier 1: High volume (Ticketmaster + all sources)
        'music', 'theatre', 'comedy', 'movies', 'art',
        // Tier 2: Good coverage (web + some providers)
        'food', 'tech', 'lectures', 'kids'
      ].includes(cat.name))
      .map(cat => cat.name);
    
    logger.info('Using regular category-based search', {
      categories: supportedCategories,
      location,
      eventLimitPerCategory: eventLimit
    });
    
    // Fetch events for all categories in parallel using the combined endpoint approach
    const categoryPromises = supportedCategories.map(async (category) => {
      try {
        // Use the all-sources approach for comprehensive coverage
        const providerResults = {};
        const providerPromises = [];

        const enqueueProvider = (key, factory) => {
          providerPromises.push(
            factory()
              .then(value => ({ key, status: 'fulfilled', value }))
              .catch(error => ({ key, status: 'rejected', reason: error }))
          );
        };

        if (!disablePerplexity) {
          enqueueProvider('perplexity', async () => {
            const result = await eventPipeline.collectEvents({
              category,
              location,
              dateRange: date_range,
              options: {
                limit: eventLimit,
                minConfidence: 0.5,
                maxTokens: config.perplexity.maxTokens,
                temperature: config.perplexity.temperature
              }
            });
            return {
              success: result.success,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.processingTime || 0,
              source: 'perplexity_api'
            };
          });
        } else {
          providerResults.perplexity = { success: false, events: [], count: 0, source: 'perplexity_api', skipped: true };
        }

        if (includeExa) {
          enqueueProvider('exa', async () => {
            const result = await exaClient.searchEvents({
              category,
              location,
              limit: eventLimit
            });
            return {
              success: result.success || false,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.processingTime || 0,
              source: 'exa_fast',
              error: result.error
            };
          });
        } else {
          providerResults.exa = { success: false, events: [], count: 0, source: 'exa_fast', skipped: true };
        }

        if (includeSerper) {
          enqueueProvider('serper', async () => {
            const result = await serperClient.searchEvents({
              category,
              location,
              limit: eventLimit
            });
            return {
              success: result.success || false,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.processingTime || 0,
              source: 'serper',
              error: result.error
            };
          });
        } else {
          providerResults.serper = { success: false, events: [], count: 0, source: 'serper', skipped: true };
        }

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
              cost: result.cost || 0,
              error: result.error
            };
          });
        } else {
          providerResults.ticketmaster = { success: false, events: [], count: 0, source: 'ticketmaster', skipped: true };
        }

        if (includePplx) {
          enqueueProvider('pplx', async () => {
            const result = await perplexitySearchClient.searchEvents({
              category,
              location,
              limit: eventLimit
            });
            return {
              success: result.success || false,
              events: result.events || [],
              count: result.events?.length || 0,
              processingTime: result.processingTime || 0,
              source: 'pplx_search',
              cost: result.cost || 0,
              error: result.error
            };
          });
        } else {
          providerResults.pplx = { success: false, events: [], count: 0, source: 'pplx_search', skipped: true };
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
        
        // Apply date filtering to ensure events are within the specified date range
        const dateFilterResult = dateFilter.filterEventsByDateRange(
          rulesFilteredEvents,
          date_range || 'next 30 days'
        );
        
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
          events: dateFilterResult.filteredEvents,
          count: dateFilterResult.filteredCount,
          sourceStats,
          // Post-dedup provider attribution
          providerAttribution: dedupStats?.sourceBreakdown || null,
          totals: dedupStats ? { totalOriginal: dedupStats.totalOriginal, totalUnique: dedupStats.totalUnique } : null,
          dateFilterStats: {
            originalCount: dateFilterResult.originalCount,
            filteredCount: dateFilterResult.filteredCount,
            removedCount: dateFilterResult.removedCount
          }
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
    
    // Wait for all categories to complete
    const categoryResults = await Promise.all(categoryPromises);
    
    const duration = Date.now() - startTime;
    
    // Organize results by category
    const eventsByCategory = {};
    const categoryStats = {};
    const legacyProviderStats = {};
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
          const entry = ensureProviderStats(legacyProviderStats, providerKey, selectedProviders);
          entry.originalCount += stats.count || 0;
          // Use max processing time instead of accumulating (providers run in parallel per category)
          entry.processingTime = Math.max(entry.processingTime || 0, stats.processingTime || 0);
          entry.cost += stats.cost || 0;
          if ((stats.count || 0) > 0) {
            entry.success = true;
          }
        });
      }

      // Aggregate provider attribution across categories (post-dedup survived counts)
      if (result.providerAttribution) {
        Object.entries(result.providerAttribution).forEach(([provider, stats]) => {
          const providerKey = mapSourceToProvider(provider);
          const entry = ensureProviderStats(legacyProviderStats, providerKey, selectedProviders);
          entry.survivedCount += stats.survivedCount || 0;
        });
      }
    });

    // Ensure every known provider has an entry and finalize stats
    PROVIDER_ORDER.forEach(providerKey => {
      const entry = ensureProviderStats(legacyProviderStats, providerKey, selectedProviders);
      entry.survivedCount = entry.survivedCount || 0;
      entry.originalCount = entry.originalCount || 0;
      entry.duplicatesRemoved = Math.max(0, entry.originalCount - entry.survivedCount);
      entry.success = entry.success || entry.survivedCount > 0;
      entry.enabled = entry.requested && selectedProviders.has(providerKey);
      entry.processingTime = Math.max(0, Math.round(entry.processingTime || 0));
      entry.cost = Number((entry.cost || 0).toFixed(3));
    });
    
    // Log fallback performance metrics
    logger.info('Legacy mode fallback completed', {
      totalEvents,
      categories: supportedCategories.length,
      duration: `${duration}ms`,
      fallbackReason: useLegacyMode ? 'explicitly_requested' : 'super_hybrid_insufficient_or_failed'
    });

    const providerDetails = PROVIDER_ORDER.map(providerKey => {
      const stats = ensureProviderStats(legacyProviderStats, providerKey, selectedProviders);
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

    const response = {
      success: true,
      eventsByCategory,
      categoryStats,
      totalEvents,
      categories: supportedCategories,
      providerStats: legacyProviderStats,
      providerDetails,
      processingTime: duration,
      metadata: {
        location,
        dateRange: date_range || 'next 30 days',
        limitPerCategory: eventLimit,
        categoriesFetched: supportedCategories.length,
        customMode: isCustomMode,
        superHybrid: false, // This is legacy mode
        fallbackReason: useLegacyMode ? 'explicitly_requested' : 'super_hybrid_insufficient_or_failed',
        requestId: `legacy_all_categories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    res.json(response);
    logResponse(logger, res, 'allCategoriesEvents', duration, { 
      totalEvents,
      categoriesFetched: supportedCategories.length,
      categoryStats 
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
  }
});

/**
 * GET /api/events/:category
 * Fetch events for a specific category
 */
router.get('/:category', async (req, res) => {
  const startTime = Date.now();
  
  logRequest(logger, req, 'fetchEvents');
  
  try {
    const { category } = req.params;
    const { location, date_range, limit, min_confidence, custom_prompt } = req.query;
    const rawCustomPrompt = (custom_prompt || '').trim();
    const disablePerplexity = ['true', '1', 'yes'].includes(String(req.query.disable_perplexity || '').toLowerCase());
    
    // Validate required parameters
    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location parameter is required',
        example: '/api/events/theatre?location=San Francisco, CA',
        timestamp: new Date().toISOString()
      });
    }

    // Build options from query parameters
    const options = {
      limit: limit ? parseInt(limit) : 50,
      minConfidence: min_confidence ? parseFloat(min_confidence) : 0.5,
      maxTokens: config.perplexity.maxTokens,  // Use config value (16000)
      temperature: config.perplexity.temperature
    };

    // Validate limit
    if (options.limit > 200) {
      return res.status(400).json({
        success: false,
        error: 'Limit cannot exceed 200 events',
        maxLimit: 200,
        timestamp: new Date().toISOString()
      });
    }

    // Check cache first
    const cacheKey = eventCache.generateKey(category, location, date_range, options, rawCustomPrompt);
    const cachedResult = eventCache.get(cacheKey);
    
    if (cachedResult) {
      const duration = Date.now() - startTime;
      logger.info('Serving cached events', {
        category,
        location,
        eventsCount: cachedResult.count,
        cacheKey,
        duration: `${duration}ms`
      });
      
      logResponse(logger, res, 'fetchEvents-cached', duration);
      return res.json({
        ...cachedResult,
        cached: true,
        cacheStats: eventCache.getStats()
      });
    }

    logger.info('Processing event request', {
      category,
      location,
      dateRange: date_range,
      options,
      cacheKey,
      customPrompt: rawCustomPrompt || undefined
    });

    // Collect events from all 5 sources in parallel
    const [perplexityResult, exaResult, serpApiResult] = await Promise.allSettled([
      // Perplexity via EventPipeline (can be disabled)
      (disablePerplexity
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'perplexity_api' })
        : eventPipeline.collectEvents({
            category,
            location,
            dateRange: date_range,
            options
          }).then(result => ({ ...result, source: 'perplexity_api' }))
      ),
      
      // Exa direct
      exaClient.searchEvents({
        category,
        location,
        limit: options.limit
      }),
      
      // Serper direct
      serperClient.searchEvents({
        category,
        location,
        limit: options.limit
      })
    ]);

    // Prepare event lists for deduplication
    const eventLists = [];
    const sourceStats = {};
    
    if (perplexityResult.status === 'fulfilled' && perplexityResult.value.success) {
      eventLists.push(perplexityResult.value);
      sourceStats.perplexity = {
        count: perplexityResult.value.events.length,
        processingTime: perplexityResult.value.processingTime
      };
    } else {
      sourceStats.perplexity = {
        count: 0,
        error: perplexityResult.reason?.message || 'Unknown error'
      };
    }
    
    // Removed Apyflux and PredictHQ source accumulation
    
    if (exaResult.status === 'fulfilled' && exaResult.value.success) {
      eventLists.push(exaResult.value);
      sourceStats.exa_fast = {
        count: exaResult.value.events.length,
        processingTime: exaResult.value.processingTime
      };
    } else {
      sourceStats.exa_fast = {
        count: 0,
        error: exaResult.reason?.message || 'Unknown error'
      };
    }
    
    if (serpApiResult.status === 'fulfilled' && serpApiResult.value.success) {
      eventLists.push(serpApiResult.value);
      sourceStats.serpapi = {
        count: serpApiResult.value.events.length,
        processingTime: serpApiResult.value.processingTime
      };
    } else {
      sourceStats.serpapi = {
        count: 0,
        error: serpApiResult.reason?.message || 'Unknown error'
      };
    }

    // Deduplicate events across all sources
    const deduplicationResult = deduplicator.deduplicateEvents(eventLists);
    
    // Apply whitelist/blacklist rules filter
    const rulesFilteredEvents = applyRulesFilter(deduplicationResult.uniqueEvents);
    
    // Apply location filtering to remove events from incorrect locations
    const preLocationFilterCount = rulesFilteredEvents.length;
    const locationFilteredEvents = locationFilter.filterEventsByLocation(
      rulesFilteredEvents, 
      location, 
      {
        radiusKm: 50, // 50km radius for Bay Area
        allowBayArea: true, // Allow Bay Area cities for SF searches
        strictMode: false // Keep events if location is unclear
      }
    );
    const postLocationFilterCount = locationFilteredEvents.length;
    const locationFilterStats = {
      preFilterCount: preLocationFilterCount,
      postFilterCount: postLocationFilterCount,
      removedCount: preLocationFilterCount - postLocationFilterCount,
      removalRate: preLocationFilterCount > 0 ? ((preLocationFilterCount - postLocationFilterCount) / preLocationFilterCount * 100).toFixed(1) + '%' : '0%'
    };
    
    // Apply date filtering to ensure events are within the specified date range
    const dateFilterResult = dateFilter.filterEventsByDateRange(
      locationFilteredEvents,
      date_range || 'next 30 days'
    );
    const finalFilteredEvents = dateFilterResult.filteredEvents;
    const dateFilterStats = {
      preFilterCount: dateFilterResult.originalCount,
      postFilterCount: dateFilterResult.filteredCount,
      removedCount: dateFilterResult.removedCount,
      removalRate: dateFilterResult.originalCount > 0 
        ? ((dateFilterResult.removedCount / dateFilterResult.originalCount * 100).toFixed(1) + '%') 
        : '0%',
      dateRange: dateFilterResult.dateRange
    };
    
    // Create the result using the fully filtered events
    const result = {
      success: true,
      events: finalFilteredEvents,
      count: finalFilteredEvents.length,
      sources: ['perplexity_api', 'exa_fast', 'serpapi'],
      sourceStats,
      deduplication: {
        totalProcessed: deduplicationResult.totalProcessed,
        duplicatesRemoved: deduplicationResult.duplicatesRemoved,
        duplicateGroups: deduplicationResult.duplicateGroups,
        sources: deduplicationResult.sources
      },
      locationFilter: locationFilterStats,
      dateFilter: dateFilterStats,
      requestId: `multi_source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        category,
        location,
        dateRange: date_range || 'next 30 days',
        limit: options.limit,
        deduplicationApplied: true,
        dateFilteringApplied: true
      }
    };

    // Cache successful results
    if (result.success && result.events && result.events.length > 0) {
      // Cache for 5 minutes for successful results with events
      eventCache.set(cacheKey, result, 300000);
    } else if (result.success && result.events && result.events.length === 0) {
      // Cache empty results for 1 minute (shorter TTL)
      eventCache.set(cacheKey, result, 60000);
    }

    // Log the result
    const duration = Date.now() - startTime;
    logResponse(logger, res, 'fetchEvents', duration);

    if (result.success) {
      logger.info('Events fetched successfully', {
        category,
        location,
        eventsFound: result.count,
        requestId: result.requestId,
        duration: `${duration}ms`
      });
    } else {
      logger.warn('Event fetch failed', {
        category,
        location,
        error: result.error,
        requestId: result.requestId,
        duration: `${duration}ms`
      });
    }

    // Return result with appropriate status code
    const statusCode = result.success ? 200 : 500;
    res.status(statusCode).json(result);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Unexpected error in events route', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      query: req.query,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An unexpected error occurred while fetching events',
      requestId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...(config.isDevelopment && { 
        debugInfo: {
          error: error.message,
          params: req.params,
          query: req.query
        }
      })
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
 * GET /api/events/:category/all-sources
 * Get events from all three sources (Perplexity, Apyflux, PredictHQ) with deduplication
 */
router.get('/:category/all-sources', async (req, res) => {
  const startTime = Date.now();
  const { category } = req.params;
  const { location = 'San Francisco, CA', date_range, limit } = req.query;
  
  logRequest(logger, req, 'allSourcesEvents', { category, location, date_range, limit });

  // Optional source toggles
  const disablePerplexity = ['true', '1', 'yes'].includes(String(req.query.disable_perplexity || '').toLowerCase()) || config.sources?.disablePerplexityByDefault;
  
  try {
    const eventLimit = Math.min(parseInt(limit) || 20, config.api.maxLimit);
    
    // Validate category
    const validation = categoryManager.validateQuery({ category, location });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join(', '),
        validCategories: categoryManager.getSupportedCategories().map(c => c.name),
        sources: ['perplexity_api']
      });
    }
    
    // Perplexity only (Apyflux/PredictHQ removed)
    const [perplexityResult] = await Promise.allSettled([
      // Perplexity via EventPipeline (can be disabled)
      (disablePerplexity
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'perplexity_api' })
        : eventPipeline.collectEvents({
            category,
            location,
            dateRange: date_range,
            options: {
              limit: eventLimit,
              minConfidence: 0.5,
              maxTokens: config.perplexity.maxTokens,
              temperature: config.perplexity.temperature
            }
          })
      )
    ]);
    
    // Prepare event lists for deduplication
    const eventLists = [];
    const sourceStats = {};
    
    if (perplexityResult.status === 'fulfilled' && perplexityResult.value.success) {
      const pr = { ...perplexityResult.value, source: 'perplexity_api' };
      eventLists.push(pr);
      sourceStats.perplexity = {
        count: perplexityResult.value.events.length,
        processingTime: perplexityResult.value.processingTime
      };
    } else {
      sourceStats.perplexity = {
        count: 0,
        error: perplexityResult.reason?.message || 'Unknown error'
      };
    }
    
    // Removed apyflux/predicthq handling
    
    // Deduplicate events across all sources
    const deduplicationResult = deduplicator.deduplicateEvents(eventLists);
    
    // Apply whitelist/blacklist rules filter
    const rulesFilteredEvents = applyRulesFilter(deduplicationResult.uniqueEvents || deduplicationResult);
    
    const duration = Date.now() - startTime;
    
    const response = {
      success: true,
      events: rulesFilteredEvents,
      count: rulesFilteredEvents.length,
      sources: ['perplexity_api'],
      sourceStats,
      processingTime: duration,
      metadata: {
        category,
        location,
        dateRange: date_range || 'next 30 days',
        limit: eventLimit,
        deduplicationApplied: true,
        requestId: `all_sources_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    res.json(response);
    logResponse(logger, res, 'allSourcesEvents', duration, { 
      eventsFound: deduplicatedEvents.length,
      sourceStats 
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('All sources events error', {
      error: error.message,
      category,
      location,
      processingTime: `${duration}ms`
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      events: [],
      count: 0,
      sources: ['perplexity_api'],
      processingTime: duration
    });
    
    logResponse(logger, res, 'allSourcesEvents', duration, { error: error.message });
  }
});

/**
 * GET /api/events/:category/perplexity
 * Get events from Perplexity API only
 */
router.get('/:category/perplexity', async (req, res) => {
  const startTime = Date.now();
  const { category } = req.params;
  const { location = 'San Francisco, CA', date_range, limit, custom_prompt } = req.query;
  
  logRequest(logger, req, 'perplexityEvents');
  
  try {
    const rawCustomPrompt = (custom_prompt || '').trim();
    const formattedCustomPrompt = rawCustomPrompt
      ? buildCustomEventPrompt({
          userPrompt: rawCustomPrompt,
          location,
          dateRange: date_range || 'next 30 days',
          limit: parseInt(limit) || 10
        })
      : '';

    const result = await eventPipeline.collectEvents({
      category,
      location,
      dateRange: date_range,
      customPrompt: formattedCustomPrompt,
      options: {
        limit: parseInt(limit) || 10,
        minConfidence: 0.5,
        maxTokens: config.perplexity.maxTokens,
        temperature: config.perplexity.temperature
      }
    });

    const responseTime = Date.now() - startTime;
    
    res.json({
      success: true,
      events: result.events || [],
      count: result.events?.length || 0,
      source: 'perplexity',
      processingTime: responseTime,
      timestamp: new Date().toISOString(),
      category,
      location,
      appliedPrompt: formattedCustomPrompt ? formattedCustomPrompt.substring(0, 200) + '...' : undefined,
      customPrompt: rawCustomPrompt ? rawCustomPrompt.substring(0, 200) + '...' : undefined
    });

  } catch (error) {
    logger.error('Perplexity API error', { error: error.message, category, location });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Perplexity events',
      source: 'perplexity',
      processingTime: Date.now() - startTime
    });
  }
});

// Removed: Apyflux-only endpoint

/**
 * GET /api/events/:category/exa
 * Get events from Exa API only
 */
router.get('/:category/exa', async (req, res) => {
  const startTime = Date.now();
  const { category } = req.params;
  const { location = 'San Francisco, CA', date_range, limit, custom_prompt } = req.query;
  
  logRequest(logger, req, 'exaEvents');
  
  try {
    const rawCustomPrompt = (custom_prompt || '').trim();
    const providerQuery = rawCustomPrompt
      ? buildProviderSearchQuery({
          userPrompt: rawCustomPrompt,
          category,
          location
        })
      : '';

    const result = await exaClient.searchEvents({
      query: providerQuery || `${category} events in ${location}`,
      location,
      category,
      dateRange: date_range || 'next 30 days',
      limit: parseInt(limit) || 10
    });

    const responseTime = Date.now() - startTime;
    
    res.json({
      success: result.success || false,
      events: result.events || [],
      count: result.events?.length || 0,
      source: 'exa',
      processingTime: responseTime,
      timestamp: new Date().toISOString(),
      category,
      location,
      appliedQuery: providerQuery || undefined,
      customPrompt: rawCustomPrompt || undefined,
      error: result.error || null
    });

  } catch (error) {
    logger.error('Exa API error', { error: error.message, category, location });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Exa events',
      source: 'exa',
      processingTime: Date.now() - startTime
    });
  }
});

/**
 * GET /api/events/:category/serper
 * Get events from Serper API only
 */
router.get('/:category/serper', async (req, res) => {
  const startTime = Date.now();
  const { category } = req.params;
  const { location = 'San Francisco, CA', date_range, limit, custom_prompt } = req.query;
  
  logRequest(logger, req, 'serperEvents');
  
  try {
    const rawCustomPrompt = (custom_prompt || '').trim();
    const providerQuery = rawCustomPrompt
      ? buildProviderSearchQuery({
          userPrompt: rawCustomPrompt,
          category,
          location
        })
      : '';

    const result = await serperClient.searchEvents({
      query: providerQuery || `${category} events in ${location}`,
      location,
      category,
      dateRange: date_range || 'next 30 days',
      limit: parseInt(limit) || 10
    });

    const responseTime = Date.now() - startTime;
    
    res.json({
      success: result.success || false,
      events: result.events || [],
      count: result.events?.length || 0,
      source: 'serper',
      processingTime: responseTime,
      timestamp: new Date().toISOString(),
      category,
      location,
      appliedQuery: providerQuery || undefined,
      customPrompt: rawCustomPrompt || undefined,
      error: result.error || null
    });

  } catch (error) {
    logger.error('Serper API error', { error: error.message, category, location });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Serper events',
      source: 'serper',
      processingTime: Date.now() - startTime
    });
  }
});

/**
 * GET /api/events/:category/ticketmaster
 * Get events from Ticketmaster API only
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

    logResponse(logger, req, response, processingTime);

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
    logger.error('Ticketmaster API error', { error: error.message, category, location });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Ticketmaster events',
      source: 'ticketmaster',
      processingTime: Date.now() - startTime
    });
  }
});

export default router;
