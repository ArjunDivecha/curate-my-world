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
import { createLogger, logRequest, logResponse } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { eventCache } from '../utils/cache.js';

const router = express.Router();
const logger = createLogger('EventsRoute');

// Initialize pipeline with API key from config
const eventPipeline = new EventPipeline(config.perplexityApiKey);
const categoryManager = new CategoryManager();

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

export default router;