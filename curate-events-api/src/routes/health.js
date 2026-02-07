/**
 * health.js
 *
 * Health check endpoint for API monitoring and status verification.
 * Checks Ticketmaster API connectivity and venue scraper cache freshness.
 */

import express from 'express';
import { createLogger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import TicketmasterClient from '../clients/TicketmasterClient.js';
import { VenueScraperClient } from '../clients/VenueScraperClient.js';

const router = express.Router();
const logger = createLogger('HealthRoute');

const ticketmasterClient = new TicketmasterClient();
const venueScraperClient = new VenueScraperClient();

/**
 * GET /api/health
 *
 * Returns server health status, configuration info, and API connectivity
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  logger.info('Health check requested');

  try {
    const healthInfo = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: config.nodeEnv,
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    };

    const configInfo = {
      api: {
        maxEventsPerCategory: config.api.maxEventsPerCategory,
        defaultCategories: config.api.defaultCategories,
        timeout: config.api.timeout,
        rateLimitingEnabled: config.rateLimiting.enabled
      },
      providers: {
        ticketmaster: {
          hasApiKey: !!config.ticketmasterConsumerKey
        },
        venue_scraper: {
          cachePath: config.venueScraper?.venueEventsCachePath || 'not configured'
        }
      }
    };

    // Check providers if requested
    let providerStatus = null;
    if (req.query.check_api === 'true') {
      logger.info('Testing provider connectivity');

      const [ticketmasterResult] = await Promise.allSettled([
        (async () => {
          try {
            const health = await ticketmasterClient.getHealthStatus();
            return {
              available: health.status === 'healthy',
              latency: health.latency,
              message: health.message
            };
          } catch (error) {
            return { available: false, error: error.message };
          }
        })()
      ]);

      const venueScraperHealth = venueScraperClient.getHealthStatus();

      providerStatus = {
        ticketmaster: ticketmasterResult.status === 'fulfilled' ? ticketmasterResult.value : {
          available: false,
          error: ticketmasterResult.reason?.message || 'Unknown error'
        },
        venue_scraper: venueScraperHealth
      };

      // Degrade overall status if venue cache is stale
      if (venueScraperHealth.isStale) {
        healthInfo.status = 'degraded';
      }

      logger.info('Provider connectivity tests completed', providerStatus);
    }

    const responseTime = Date.now() - startTime;

    const response = {
      ...healthInfo,
      config: configInfo,
      ...(providerStatus && { providerStatus }),
      responseTime: `${responseTime}ms`
    };

    logger.info('Health check completed', {
      responseTime: `${responseTime}ms`,
      apiTestRequested: req.query.check_api === 'true',
      status: healthInfo.status
    });

    res.json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error('Health check failed', {
      error: error.message,
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: `${responseTime}ms`
    });
  }
});

/**
 * GET /api/health/deep
 *
 * Comprehensive health check including API connectivity test
 */
router.get('/deep', async (req, res) => {
  req.query.check_api = 'true';
  return router.handle(req, res);
});

export default router;
