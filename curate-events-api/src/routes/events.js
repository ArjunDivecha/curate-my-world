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
import { ApyfluxClient } from '../clients/ApyfluxClient.js';
import { PredictHQClient } from '../clients/PredictHQClient.js';
import { EventDeduplicator } from '../utils/eventDeduplicator.js';
import { ExaClient } from '../clients/ExaClient.js';
import SerperClient from '../clients/SerperClient.js';
import TicketmasterClient from '../clients/TicketmasterClient.js';
import { LocationFilter } from '../utils/locationFilter.js';
import { createLogger, logRequest, logResponse } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { eventCache } from '../utils/cache.js';

const router = express.Router();
const logger = createLogger('EventsRoute');

// Initialize pipeline with API key from config
const eventPipeline = new EventPipeline(config.perplexityApiKey);
const categoryManager = new CategoryManager();
const apyfluxClient = new ApyfluxClient();
const predictHQClient = new PredictHQClient(config.predictHQApiKey);
const exaClient = new ExaClient();
const serperClient = new SerperClient();
const ticketmasterClient = new TicketmasterClient();
const deduplicator = new EventDeduplicator();
const locationFilter = new LocationFilter();

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

    // Optional source toggles
    const disableApyflux = ['true', '1', 'yes'].includes(String(req.query.disable_apyflux || '').toLowerCase()) || config.sources?.disableApyfluxByDefault;

    // Run both APIs in parallel (Apyflux optionally disabled)
    const [perplexityResult, apyfluxResult] = await Promise.allSettled([
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
          }).then(result => ({ ...result, source: 'perplexity_api' }))
      ),
      
      // Apyflux direct
      (disableApyflux
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by default', source: 'apyflux_api' })
        : apyfluxClient.searchEvents({
            query: apyfluxClient.buildSearchQuery(category, location),
            location,
            category,
            dateRange: date_range || 'next 30 days',
            limit: eventLimit
          }).then(result => {
            if (result.success && result.events.length > 0) {
              // Transform events to our standard format
              const transformedEvents = result.events.map(event => 
                apyfluxClient.transformEvent(event, category)
              ).filter(event => event !== null);
              
              return {
                success: true,
                events: transformedEvents,
                count: transformedEvents.length,
                processingTime: result.processingTime,
                source: 'apyflux_api',
                requestId: result.requestId
              };
            }
            return { ...result, source: 'apyflux_api' };
          })
      )
    ]);

    // Prepare event lists for deduplication
    const eventLists = [];
    
    if (perplexityResult.status === 'fulfilled' && perplexityResult.value.success) {
      const pr = { ...perplexityResult.value, source: 'perplexity_api' };
      eventLists.push(pr);
    }
    
    if (apyfluxResult.status === 'fulfilled' && apyfluxResult.value.success) {
      eventLists.push(apyfluxResult.value);
    }

    // Deduplicate events
    const deduplicationResult = deduplicator.deduplicateEvents(eventLists);
    
    const duration = Date.now() - startTime;

    // Build response
    const response = {
      success: true,
      events: deduplicationResult.uniqueEvents,
      count: deduplicationResult.uniqueEvents.length,
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
        },
        apyflux: {
          status: apyfluxResult.status,
          count: apyfluxResult.status === 'fulfilled' ? apyfluxResult.value.count || 0 : 0,
          success: apyfluxResult.status === 'fulfilled' ? apyfluxResult.value.success : false
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
    const disableApyflux = ['true', '1', 'yes'].includes(String(req.query.disable_apyflux || '').toLowerCase()) || config.sources?.disableApyfluxByDefault;
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

    // Run both APIs in parallel
    const [perplexityResult, apyfluxResult] = await Promise.allSettled([
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
          }).then(result => ({ ...result, source: 'perplexity_api' }))
      ),
      
      // Apyflux direct
      (disableApyflux
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by default', source: 'apyflux_api' })
        : apyfluxClient.searchEvents({
            query: apyfluxClient.buildSearchQuery(category, location),
            location,
            category,
            dateRange: date_range || 'next 30 days',
            limit: eventLimit
          }).then(result => {
            if (result.success && result.events.length > 0) {
              // Transform events to our standard format
              const transformedEvents = result.events.map(event => 
                apyfluxClient.transformEvent(event, category)
              ).filter(event => event !== null);
              
              return {
                success: true,
                events: transformedEvents,
                count: transformedEvents.length,
                processingTime: result.processingTime,
                source: 'apyflux_api',
                requestId: result.requestId
              };
            }
            return { ...result, source: 'apyflux_api' };
          })
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
        },
        apyflux: {
          status: apyfluxResult.status,
          ...(apyfluxResult.status === 'fulfilled' ? apyfluxResult.value : {
            success: false,
            error: apyfluxResult.reason?.message || 'Unknown error',
            events: [],
            count: 0
          })
        }
      },
      summary: {
        perplexityCount: perplexityResult.status === 'fulfilled' ? perplexityResult.value.count || 0 : 0,
        apyfluxCount: apyfluxResult.status === 'fulfilled' ? apyfluxResult.value.count || 0 : 0,
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
      apyfluxEvents: comparison.summary.apyfluxCount,
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
  
  logRequest(logger, req, 'allCategoriesEvents', { location, date_range, limit });

  // Optional source toggles
  const disableApyflux = ['true', '1', 'yes'].includes(String(req.query.disable_apyflux || '').toLowerCase()) || config.sources?.disableApyfluxByDefault;
  const disablePredictHQ = ['true', '1', 'yes'].includes(String(req.query.disable_predicthq || '').toLowerCase()) || config.sources?.disablePredictHQByDefault;
  const disablePerplexity = ['true', '1', 'yes'].includes(String(req.query.disable_perplexity || '').toLowerCase()) || config.sources?.disablePerplexityByDefault;

  // Super-Hybrid mode (no frontend changes required):
  // If mode=super-hybrid or SUPER_HYBRID_DEFAULT=1, proxy to experiment server
  const useSuperHybrid = String(req.query.mode || '').toLowerCase() === 'super-hybrid' || config.superHybrid?.enabledByDefault;
  
  try {
    if (useSuperHybrid) {
      try {
        const eventLimit = Math.min(parseInt(limit) || 15, config.api.maxLimit);
        // Determine supported categories same as legacy branch
        const supportedCategories = categoryManager.getSupportedCategories()
          .filter(cat => [
            'theatre', 'music', 'art', 'food', 'tech', 'education', 'movies',
            'technology', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
          ].includes(cat.name))
          .map(cat => cat.name);

        // First, fetch TURBO results for fast initial response (unless full=1)
        const isFull = String(req.query.full || '').toLowerCase() === '1';
        const u = new URL(isFull ? '/super-hybrid/search' : '/super-hybrid/turbo', config.superHybrid.url);
        u.searchParams.set('location', String(location));
        u.searchParams.set('limit', String(eventLimit));
        if (isFull) {
          const supportedCategories = categoryManager.getSupportedCategories()
            .filter(cat => [
              'theatre', 'music', 'art', 'food', 'tech', 'education', 'movies',
              'technology', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
            ].includes(cat.name))
            .map(cat => cat.name);
          u.searchParams.set('categories', supportedCategories.join(','));
        }

        const shRes = await fetch(u.toString());
        if (!shRes.ok) {
          const txt = await shRes.text();
          throw new Error(`SuperHybrid HTTP ${shRes.status}: ${txt}`);
        }
        const sh = await shRes.json();

        // Group by category to match current schema
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
          // Aggregate provider stats by ev.source
          list.forEach(ev => {
            const p = ev.source || 'unknown';
            if (!aggregatedProviderStats[p]) aggregatedProviderStats[p] = { originalCount: 0, survivedCount: 0, duplicatesRemoved: 0 };
            aggregatedProviderStats[p].originalCount++;
            aggregatedProviderStats[p].survivedCount++;
          });
        });

        // Finalize dup removed as 0 (already deduped on SH side)
        Object.keys(aggregatedProviderStats).forEach(p => {
          const s = aggregatedProviderStats[p];
          s.duplicatesRemoved = Math.max(0, (s.originalCount || 0) - (s.survivedCount || 0));
        });

        const duration = Date.now() - startTime;
        const response = {
          success: true,
          eventsByCategory,
          categoryStats,
          totalEvents,
          categories: Object.keys(eventsByCategory),
          providerStats: aggregatedProviderStats,
          processingTime: duration,
          metadata: {
            location,
            dateRange: date_range || 'next 30 days',
            limitPerCategory: eventLimit,
            categoriesFetched: Object.keys(eventsByCategory).length,
            customMode: false,
            superHybrid: true,
            stage: isFull ? 'full' : 'turbo',
            requestId: `sh_all_categories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }
        };
        return res.json(response);
      } catch (error) {
        logger.error('Super-Hybrid proxy error', { error: error.message });
        // Fall through to legacy behavior if SH fails
      }
    }
    const customPrompt = (custom_prompt || '').trim();
    const isCustomMode = customPrompt.length > 0;
    const eventLimit = Math.min(parseInt(limit) || 15, config.api.maxLimit);
    
    
    if (isCustomMode) {
      // Custom AI Instructions mode: Use only the custom prompt, skip category-based search
      logger.info('Using custom AI instructions mode', {
        customPrompt: customPrompt.substring(0, 100) + '...',
        location,
        eventLimit: eventLimit * 5 // Higher limit for custom search
      });
      
      // Single search with custom prompt instead of category-based searches
      const customResult = await eventPipeline.collectEvents({
        category: 'general', // Placeholder category
        location,
        dateRange: date_range,
        customPrompt: customPrompt,
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
          customPrompt: customPrompt.substring(0, 200) + '...',
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
        // Original categories
        'theatre', 'music', 'art', 'food', 'tech', 'education', 'movies',
        // New personalized categories
        'technology', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
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
        const [perplexityResult, apyfluxResult, predictHQResult, exaResult, serpApiResult] = await Promise.allSettled([
          // Perplexity via EventPipeline (can be disabled)
          (disablePerplexity
            ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by default', source: 'perplexity_api' })
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
          ),
          
          // Apyflux direct
          (disableApyflux
            ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'apyflux_api' })
            : apyfluxClient.searchEvents({
                query: apyfluxClient.buildSearchQuery(category, location),
                location,
                category,
                dateRange: date_range || 'next 30 days',
                limit: eventLimit
              }).then(result => {
                if (result.success && result.events.length > 0) {
                  const transformedEvents = result.events.map(event => 
                    apyfluxClient.transformEvent(event, category)
                  ).filter(event => event !== null);
                  
                  return {
                    success: true,
                    events: transformedEvents,
                    count: transformedEvents.length,
                    processingTime: result.processingTime,
                    source: 'apyflux_api',
                    requestId: result.requestId
                  };
                }
                return result;
              })
          ),
          
          // PredictHQ direct
          (disablePredictHQ
            ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'predicthq_api' })
            : predictHQClient.searchEvents({
                category,
                location,
                dateRange: date_range || 'next 30 days',
                limit: eventLimit
              }).then(result => {
                if (result.success && result.events.length > 0) {
                  const transformedEvents = result.events.map(event => 
                    predictHQClient.transformEvent(event, category)
                  ).filter(event => event !== null);
                  
                  return {
                    success: true,
                    events: transformedEvents,
                    count: transformedEvents.length,
                    processingTime: result.processingTime,
                    source: 'predicthq_api',
                    totalAvailable: result.totalAvailable
                  };
                }
                return result;
              })
          ),
          
          // Exa direct
          exaClient.searchEvents({
            category,
            location,
            limit: eventLimit
          }),
          
          // Serper direct
          serperClient.searchEvents({
            category,
            location,
            limit: eventLimit
          })
        ]);
        
        // Prepare event lists for deduplication
        const eventLists = [];
        
        if (perplexityResult.status === 'fulfilled' && perplexityResult.value.success) {
          const pr = { ...perplexityResult.value, source: 'perplexity_api' };
          eventLists.push(pr);
        }
        
        if (apyfluxResult.status === 'fulfilled' && apyfluxResult.value.success) {
          eventLists.push(apyfluxResult.value);
        }
        
        if (predictHQResult.status === 'fulfilled' && predictHQResult.value.success) {
          eventLists.push(predictHQResult.value);
        }
        
        if (exaResult.status === 'fulfilled' && exaResult.value.success) {
          eventLists.push(exaResult.value);
        }
        
        if (serpApiResult.status === 'fulfilled' && serpApiResult.value.success) {
          eventLists.push(serpApiResult.value);
        }
        
        // Deduplicate events for this category
        const deduplicationResult = deduplicator.deduplicateEvents(eventLists);
        const dedupStats = deduplicator.getDeduplicationStats(eventLists, deduplicationResult);
        
        return {
          category,
          success: true,
          events: deduplicationResult.uniqueEvents,
          count: deduplicationResult.uniqueEvents.length,
          sourceStats: {
            perplexity: perplexityResult.status === 'fulfilled' && perplexityResult.value.success ? 
              { count: perplexityResult.value.events.length, processingTime: perplexityResult.value.processingTime } : 
              { count: 0, error: perplexityResult.reason?.message || 'Unknown error' },
            apyflux: apyfluxResult.status === 'fulfilled' && apyfluxResult.value.success ? 
              { count: apyfluxResult.value.events.length, processingTime: apyfluxResult.value.processingTime } : 
              { count: 0, error: apyfluxResult.reason?.message || 'Unknown error' },
            predicthq: predictHQResult.status === 'fulfilled' && predictHQResult.value.success ? 
              { count: predictHQResult.value.events.length, processingTime: predictHQResult.value.processingTime } : 
              { count: 0, error: predictHQResult.reason?.message || 'Unknown error' },
            exa_fast: exaResult.status === 'fulfilled' && exaResult.value.success ? 
              { count: exaResult.value.events.length, processingTime: exaResult.value.processingTime } : 
              { count: 0, error: exaResult.reason?.message || 'Unknown error' },
            serpapi: serpApiResult.status === 'fulfilled' && serpApiResult.value.success ? 
              { count: serpApiResult.value.events.length, processingTime: serpApiResult.value.processingTime } : 
              { count: 0, error: serpApiResult.reason?.message || 'Unknown error' }
          },
          // Post-dedup provider attribution
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
    
    // Wait for all categories to complete
    const categoryResults = await Promise.all(categoryPromises);
    
    const duration = Date.now() - startTime;
    
    // Organize results by category
    const eventsByCategory = {};
    const categoryStats = {};
    const aggregatedProviderStats = {};
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

      // Aggregate provider attribution across categories (post-dedup survived counts)
      if (result.providerAttribution) {
        Object.entries(result.providerAttribution).forEach(([provider, stats]) => {
          if (!aggregatedProviderStats[provider]) {
            aggregatedProviderStats[provider] = { originalCount: 0, survivedCount: 0, duplicatesRemoved: 0 };
          }
          aggregatedProviderStats[provider].originalCount += stats.originalCount || 0;
          aggregatedProviderStats[provider].survivedCount += stats.survivedCount || 0;
        });
      }
    });

    // Finalize aggregated duplicatesRemoved
    Object.keys(aggregatedProviderStats).forEach(provider => {
      const s = aggregatedProviderStats[provider];
      s.duplicatesRemoved = Math.max(0, (s.originalCount || 0) - (s.survivedCount || 0));
    });
    
    const response = {
      success: true,
      eventsByCategory,
      categoryStats,
      totalEvents,
      categories: supportedCategories,
      providerStats: aggregatedProviderStats,
      processingTime: duration,
      metadata: {
        location,
        dateRange: date_range || 'next 30 days',
        limitPerCategory: eventLimit,
        categoriesFetched: supportedCategories.length,
        customMode: isCustomMode,
        requestId: `all_categories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
    const disableApyflux = ['true', '1', 'yes'].includes(String(req.query.disable_apyflux || '').toLowerCase()) || config.sources?.disableApyfluxByDefault;
    const disablePredictHQ = ['true', '1', 'yes'].includes(String(req.query.disable_predicthq || '').toLowerCase()) || config.sources?.disablePredictHQByDefault;
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
    const cacheKey = eventCache.generateKey(category, location, date_range, options, custom_prompt);
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
      cacheKey
    });

    // Collect events from all 5 sources in parallel
    const [perplexityResult, apyfluxResult, predictHQResult, exaResult, serpApiResult] = await Promise.allSettled([
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
      
      // Apyflux direct
      (disableApyflux
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by default', source: 'apyflux_api' })
        : apyfluxClient.searchEvents({
            query: apyfluxClient.buildSearchQuery(category, location),
            location,
            category,
            dateRange: date_range || 'next 30 days',
            limit: options.limit
          }).then(result => {
            if (result.success && result.events.length > 0) {
              const transformedEvents = result.events.map(event => 
                apyfluxClient.transformEvent(event, category)
              ).filter(event => event !== null);
              
              return {
                success: true,
                events: transformedEvents,
                count: transformedEvents.length,
                processingTime: result.processingTime,
                source: 'apyflux_api',
                requestId: result.requestId
              };
            }
            return { ...result, source: 'apyflux_api' };
          })
      ),
      
      // PredictHQ direct
      (disablePredictHQ
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by default', source: 'predicthq_api' })
        : predictHQClient.searchEvents({
            category,
            location,
            dateRange: date_range || 'next 30 days',
            limit: options.limit
          }).then(result => {
            if (result.success && result.events.length > 0) {
              const transformedEvents = result.events.map(event => 
                predictHQClient.transformEvent(event, category)
              ).filter(event => event !== null);
              
              return {
                success: true,
                events: transformedEvents,
                count: transformedEvents.length,
                processingTime: result.processingTime,
                source: 'predicthq_api',
                totalAvailable: result.totalAvailable
              };
            }
            return { ...result, source: 'predicthq_api' };
          })
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
    
    if (apyfluxResult.status === 'fulfilled' && apyfluxResult.value.success) {
      eventLists.push(apyfluxResult.value);
      sourceStats.apyflux = {
        count: apyfluxResult.value.events.length,
        processingTime: apyfluxResult.value.processingTime
      };
    } else {
      sourceStats.apyflux = apyfluxResult.status === 'fulfilled'
        ? { count: 0, error: apyfluxResult.value?.error || 'Unknown error' }
        : { count: 0, error: apyfluxResult.reason?.message || 'Unknown error' };
    }
    
    if (predictHQResult.status === 'fulfilled' && predictHQResult.value.success) {
      eventLists.push(predictHQResult.value);
      sourceStats.predicthq = {
        count: predictHQResult.value.events.length,
        processingTime: predictHQResult.value.processingTime,
        totalAvailable: predictHQResult.value.totalAvailable
      };
    } else {
      sourceStats.predicthq = predictHQResult.status === 'fulfilled'
        ? { count: 0, error: predictHQResult.value?.error || 'Unknown error' }
        : { count: 0, error: predictHQResult.reason?.message || 'Unknown error' };
    }
    
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
    
    // Apply location filtering to remove events from incorrect locations
    const preFilterCount = deduplicationResult.uniqueEvents.length;
    const filteredEvents = locationFilter.filterEventsByLocation(
      deduplicationResult.uniqueEvents, 
      location, 
      {
        radiusKm: 50, // 50km radius for Bay Area
        allowBayArea: true, // Allow Bay Area cities for SF searches
        strictMode: false // Keep events if location is unclear
      }
    );
    const postFilterCount = filteredEvents.length;
    const locationFilterStats = {
      preFilterCount,
      postFilterCount,
      removedCount: preFilterCount - postFilterCount,
      removalRate: preFilterCount > 0 ? ((preFilterCount - postFilterCount) / preFilterCount * 100).toFixed(1) + '%' : '0%'
    };
    
    // Create the result using the location-filtered events
    const result = {
      success: true,
      events: filteredEvents,
      count: filteredEvents.length,
      sources: ['perplexity_api', 'apyflux_api', 'predicthq_api', 'exa_fast', 'serpapi'],
      sourceStats,
      deduplication: {
        totalProcessed: deduplicationResult.totalProcessed,
        duplicatesRemoved: deduplicationResult.duplicatesRemoved,
        duplicateGroups: deduplicationResult.duplicateGroups,
        sources: deduplicationResult.sources
      },
      locationFilter: locationFilterStats,
      requestId: `multi_source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        category,
        location,
        dateRange: date_range || 'next 30 days',
        limit: options.limit,
        deduplicationApplied: true
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

/**
 * GET /api/events/:category/predicthq
 * Get events from PredictHQ API only
 */
router.get('/:category/predicthq', async (req, res) => {
  const startTime = Date.now();
  const { category } = req.params;
  const { location = 'San Francisco, CA', date_range, limit } = req.query;
  
  logRequest(logger, req, 'predictHQEvents', { category, location, date_range, limit });
  
  try {
    const eventLimit = Math.min(parseInt(limit) || 20, config.api.maxLimit);
    
    // Validate category
    const validation = categoryManager.validateQuery({ category, location });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join(', '),
        validCategories: categoryManager.getSupportedCategories().map(c => c.name),
        source: 'predicthq_api'
      });
    }
    
    // Search PredictHQ events
    const result = await predictHQClient.searchEvents({
      category,
      location,
      dateRange: date_range || 'next 30 days',
      limit: eventLimit
    });
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        events: [],
        count: 0,
        source: 'predicthq_api',
        processingTime: result.processingTime
      });
    }
    
    // Transform events to our standard format
    const transformedEvents = result.events.map(event => 
      predictHQClient.transformEvent(event, category)
    ).filter(event => event !== null);
    
    const duration = Date.now() - startTime;
    
    const response = {
      success: true,
      events: transformedEvents,
      count: transformedEvents.length,
      totalAvailable: result.totalAvailable,
      source: 'predicthq_api',
      processingTime: duration,
      metadata: {
        category,
        location,
        dateRange: date_range || 'next 30 days',
        limit: eventLimit,
        requestId: `predicthq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    res.json(response);
    logResponse(logger, res, 'predictHQEvents', duration, { eventsFound: transformedEvents.length });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('PredictHQ events error', {
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
      source: 'predicthq_api',
      processingTime: duration
    });
    
    logResponse(logger, res, 'predictHQEvents', duration, { error: error.message });
  }
});

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
  const disableApyflux = ['true', '1', 'yes'].includes(String(req.query.disable_apyflux || '').toLowerCase()) || config.sources?.disableApyfluxByDefault;
  const disablePredictHQ = ['true', '1', 'yes'].includes(String(req.query.disable_predicthq || '').toLowerCase()) || config.sources?.disablePredictHQByDefault;
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
        sources: ['perplexity_api', 'apyflux_api', 'predicthq_api']
      });
    }
    
    // Run all three APIs in parallel
    const [perplexityResult, apyfluxResult, predictHQResult] = await Promise.allSettled([
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
      ),
      
      // Apyflux direct
      (disableApyflux
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'apyflux_api' })
        : apyfluxClient.searchEvents({
            query: apyfluxClient.buildSearchQuery(category, location),
            location,
            category,
            dateRange: date_range || 'next 30 days',
            limit: eventLimit
          }).then(result => {
            if (result.success && result.events.length > 0) {
              const transformedEvents = result.events.map(event => 
                apyfluxClient.transformEvent(event, category)
              ).filter(event => event !== null);
              
              return {
                success: true,
                events: transformedEvents,
                count: transformedEvents.length,
                processingTime: result.processingTime,
                source: 'apyflux_api',
                requestId: result.requestId
              };
            }
            return result;
          })
      ),
      
      // PredictHQ direct
      (disablePredictHQ
        ? Promise.resolve({ success: false, events: [], count: 0, error: 'disabled by flag', source: 'predicthq_api' })
        : predictHQClient.searchEvents({
            category,
            location,
            dateRange: date_range || 'next 30 days',
            limit: eventLimit
          }).then(result => {
            if (result.success && result.events.length > 0) {
              const transformedEvents = result.events.map(event => 
                predictHQClient.transformEvent(event, category)
              ).filter(event => event !== null);
              
              return {
                success: true,
                events: transformedEvents,
                count: transformedEvents.length,
                processingTime: result.processingTime,
                source: 'predicthq_api',
                totalAvailable: result.totalAvailable
              };
            }
            return result;
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
    
    if (apyfluxResult.status === 'fulfilled' && apyfluxResult.value.success) {
      eventLists.push(apyfluxResult.value);
      sourceStats.apyflux = {
        count: apyfluxResult.value.events.length,
        processingTime: apyfluxResult.value.processingTime
      };
    } else {
      sourceStats.apyflux = {
        count: 0,
        error: apyfluxResult.reason?.message || 'Unknown error'
      };
    }
    
    if (predictHQResult.status === 'fulfilled' && predictHQResult.value.success) {
      eventLists.push(predictHQResult.value);
      sourceStats.predicthq = {
        count: predictHQResult.value.events.length,
        processingTime: predictHQResult.value.processingTime,
        totalAvailable: predictHQResult.value.totalAvailable
      };
    } else {
      sourceStats.predicthq = {
        count: 0,
        error: predictHQResult.reason?.message || 'Unknown error'
      };
    }
    
    // Deduplicate events across all sources
    const deduplicatedEvents = deduplicator.deduplicateEvents(eventLists);
    
    const duration = Date.now() - startTime;
    
    const response = {
      success: true,
      events: deduplicatedEvents,
      count: deduplicatedEvents.length,
      sources: ['perplexity_api', 'apyflux_api', 'predicthq_api'],
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
      sources: ['perplexity_api', 'apyflux_api', 'predicthq_api'],
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
    const result = await eventPipeline.collectEvents({
      category,
      location,
      dateRange: date_range,
      customPrompt: custom_prompt,
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
      location
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

/**
 * GET /api/events/:category/apyflux
 * Get events from Apyflux API only
 */
router.get('/:category/apyflux', async (req, res) => {
  const startTime = Date.now();
  const { category } = req.params;
  const { location = 'San Francisco, CA', date_range, limit, custom_prompt } = req.query;
  
  logRequest(logger, req, 'apyfluxEvents');
  
  try {
    const result = await apyfluxClient.searchEvents({
      query: custom_prompt || apyfluxClient.buildSearchQuery(category, location),
      location,
      category,
      dateRange: date_range || 'next 30 days',
      limit: parseInt(limit) || 10
    });

    const responseTime = Date.now() - startTime;
    
    if (result.success && result.events.length > 0) {
      const transformedEvents = result.events.map(event => 
        apyfluxClient.transformEvent(event, category)
      ).filter(event => event !== null);
      
      res.json({
        success: true,
        events: transformedEvents,
        count: transformedEvents.length,
        source: 'apyflux',
        processingTime: responseTime,
        timestamp: new Date().toISOString(),
        category,
        location
      });
    } else {
      res.json({
        success: false,
        events: [],
        count: 0,
        source: 'apyflux',
        error: result.error || 'No events found',
        processingTime: responseTime
      });
    }

  } catch (error) {
    logger.error('Apyflux API error', { error: error.message, category, location });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Apyflux events',
      source: 'apyflux',
      processingTime: Date.now() - startTime
    });
  }
});

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
    const result = await exaClient.searchEvents({
      query: custom_prompt || `${category} events in ${location}`,
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
    const result = await serperClient.searchEvents({
      query: custom_prompt || `${category} events in ${location}`,
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
