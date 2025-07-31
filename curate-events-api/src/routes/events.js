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
const deduplicator = new EventDeduplicator();

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

    // Run both APIs in parallel
    const [perplexityResult, apyfluxResult] = await Promise.allSettled([
      // Perplexity via EventPipeline
      eventPipeline.collectEvents({
        category,
        location,
        dateRange: date_range,
        options: {
          limit: eventLimit,
          minConfidence: 0.5,
          maxTokens: config.perplexity.maxTokens,
          temperature: config.perplexity.temperature
        }
      }),
      
      // Apyflux direct
      apyfluxClient.searchEvents({
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
        return result;
      })
    ]);

    // Prepare event lists for deduplication
    const eventLists = [];
    
    if (perplexityResult.status === 'fulfilled' && perplexityResult.value.success) {
      eventLists.push(perplexityResult.value);
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
      // Perplexity via EventPipeline
      eventPipeline.collectEvents({
        category,
        location,
        dateRange: date_range,
        options: {
          limit: eventLimit,
          minConfidence: 0.5,
          maxTokens: config.perplexity.maxTokens,
          temperature: config.perplexity.temperature
        }
      }),
      
      // Apyflux direct
      apyfluxClient.searchEvents({
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
        return result;
      })
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
 * GET /api/events/:category
 * Fetch events for a specific category
 */
router.get('/:category', async (req, res) => {
  const startTime = Date.now();
  
  logRequest(logger, req, 'fetchEvents');
  
  try {
    const { category } = req.params;
    const { location, date_range, limit, min_confidence } = req.query;
    
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
    const cacheKey = eventCache.generateKey(category, location, date_range, options);
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

    // Collect events using the pipeline
    const result = await eventPipeline.collectEvents({
      category,
      location,
      dateRange: date_range,
      options
    });

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
      // Perplexity via EventPipeline
      eventPipeline.collectEvents({
        category,
        location,
        dateRange: date_range,
        options: {
          limit: eventLimit,
          minConfidence: 0.5,
          maxTokens: config.perplexity.maxTokens,
          temperature: config.perplexity.temperature
        }
      }),
      
      // Apyflux direct
      apyfluxClient.searchEvents({
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
      }),
      
      // PredictHQ direct
      predictHQClient.searchEvents({
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

export default router;