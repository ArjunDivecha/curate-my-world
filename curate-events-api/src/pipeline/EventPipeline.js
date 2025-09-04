/**
 * =============================================================================
 * SCRIPT NAME: EventPipeline.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Main orchestration pipeline that coordinates the event collection process.
 * Integrates PerplexityClient, EventParser, and CategoryManager using proven patterns.
 * 
 * WORKFLOW:
 * 1. Validate input parameters
 * 2. Build optimized query using CategoryManager
 * 3. Fetch events from Perplexity API
 * 4. Parse and normalize events using EventParser
 * 5. Apply filters and post-processing
 * 6. Return structured response
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-29
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { PerplexityClient } from '../clients/PerplexityClient.js';
import { EventParser } from '../parsers/EventParser.js';
import { CategoryManager } from '../managers/CategoryManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EventPipeline');

export class EventPipeline {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Perplexity API key is required');
    }
    
    this.perplexityClient = new PerplexityClient(apiKey);
    this.eventParser = new EventParser();
    this.categoryManager = new CategoryManager();
    
    logger.info('EventPipeline initialized successfully');
  }

  /**
   * Main event collection method
   * @param {Object} params - Query parameters
   * @param {string} params.category - Event category
   * @param {string} params.location - Location string
   * @param {string} params.dateRange - Optional date range
   * @param {Object} params.options - Optional processing options
   * @returns {Promise<Object>} Processed event results
   */
  async collectEvents({ category, location, dateRange, customPrompt, options = {} }) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    logger.info('Starting event collection', {
      requestId,
      category,
      location,
      dateRange,
      customPrompt,
      options
    });

    try {
      // Step 1: Validate input parameters
      const validation = this.validateInput({ category, location, dateRange });
      if (!validation.valid) {
        return this.createErrorResponse('Validation failed', validation.errors, requestId);
      }

      // Step 2: Build optimized query (use custom prompt if provided)
      const query = customPrompt || this.categoryManager.buildQuery({
        category: validation.normalizedCategory,
        location,
        dateRange: dateRange || 'next 30 days'
      });

      // Step 3: Fetch data from Perplexity API
      const apiResponse = await this.perplexityClient.query(query, {
        max_tokens: options.maxTokens || 8000,
        temperature: options.temperature || 0.1
      });

      // Step 4: Parse events from response
      const events = this.eventParser.parseResponse(
        apiResponse.content,
        validation.normalizedCategory,
        location
      );

      // Step 5: Apply post-processing
      const processedEvents = this.postProcessEvents(events, options);

      // Step 6: Generate final response
      const response = this.createSuccessResponse({
        events: processedEvents,
        query,
        apiResponse,
        validation,
        requestId,
        processingTime: Date.now() - startTime
      });

      logger.info('Event collection completed successfully', {
        requestId,
        eventsFound: processedEvents.length,
        processingTime: response.processingTime,
        expectedEvents: 30
      });

      return response;

    } catch (error) {
      logger.error('Event collection failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime
      });

      return this.createErrorResponse(
        'Event collection failed',
        [error.message],
        requestId,
        Date.now() - startTime
      );
    }
  }

  /**
   * Validate input parameters
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result
   */
  validateInput(params) {
    const validation = this.categoryManager.validateQuery(params);
    
    // Additional pipeline-specific validations
    if (params.location && params.location.length > 100) {
      validation.errors.push('Location must be less than 100 characters');
      validation.valid = false;
    }

    if (params.dateRange && params.dateRange.length > 50) {
      validation.errors.push('Date range must be less than 50 characters');
      validation.valid = false;
    }

    return validation;
  }

  /**
   * Apply post-processing to events
   * @param {Array} events - Raw events
   * @param {Object} options - Processing options
   * @returns {Array} Processed events
   */
  postProcessEvents(events, options = {}) {
    let processed = [...events];

    // Remove duplicates by title and date
    processed = this.removeDuplicates(processed);

    // Apply confidence filtering
    if (options.minConfidence) {
      processed = processed.filter(event => 
        (event.confidence || 0.5) >= options.minConfidence
      );
    }

    // Sort by date
    processed.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    // Apply result limit
    const limit = options.limit || 50;
    if (processed.length > limit) {
      processed = processed.slice(0, limit);
      logger.info(`Applied result limit`, { originalCount: events.length, limitedCount: processed.length });
    }

    // Add derived fields
    processed = processed.map(event => ({
      ...event,
      isToday: this.isToday(event.startDate),
      isThisWeek: this.isThisWeek(event.startDate),
      daysFromNow: this.getDaysFromNow(event.startDate)
    }));

    return processed;
  }

  /**
   * Remove duplicate events
   * @param {Array} events - Events array
   * @returns {Array} Deduplicated events
   */
  removeDuplicates(events) {
    const seen = new Map();
    const unique = [];

    for (const event of events) {
      // Create unique key from title and date
      const key = `${event.title.toLowerCase().trim()}|${new Date(event.startDate).toDateString()}`;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        unique.push(event);
      }
    }

    if (unique.length < events.length) {
      logger.info('Removed duplicate events', {
        original: events.length,
        unique: unique.length,
        duplicates: events.length - unique.length
      });
    }

    return unique;
  }

  /**
   * Check if date is today
   * @param {string} dateStr - Date string
   * @returns {boolean} Is today
   */
  isToday(dateStr) {
    const eventDate = new Date(dateStr);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  }

  /**
   * Check if date is this week
   * @param {string} dateStr - Date string
   * @returns {boolean} Is this week
   */
  isThisWeek(dateStr) {
    const eventDate = new Date(dateStr);
    const today = new Date();
    const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    return eventDate >= weekStart && eventDate < weekEnd;
  }

  /**
   * Get days from now
   * @param {string} dateStr - Date string
   * @returns {number} Days from now
   */
  getDaysFromNow(dateStr) {
    const eventDate = new Date(dateStr);
    const today = new Date();
    const diffTime = eventDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Create success response
   * @param {Object} data - Response data
   * @returns {Object} Success response
   */
  createSuccessResponse(data) {
    const { events, query, apiResponse, validation, requestId, processingTime } = data;
    
    return {
      success: true,
      requestId,
      events: events,
      count: events.length,
      query: {
        category: validation.normalizedCategory,
        location: query.match(/happening in ([^,]+(?:, [^,]+)?)/)?.[1] || 'Unknown',
        dateRange: query.match(/over the ([^.]+)/)?.[1] || 'Unknown'
      },
      processingTime: `${processingTime}ms`,
      metadata: {
        apiModel: apiResponse.model,
        contentLength: apiResponse.contentLength,
        apiProcessingTime: apiResponse.processingTime,
        apiUsage: apiResponse.usage,
        expectedVsActual: {
          expected: 30,
          actual: events.length,
          ratio: (events.length / 30).toFixed(2)
        }
      },
      debug: {
        validation: validation,
        suggestions: this.categoryManager.getOptimizationSuggestions({
          category: validation.normalizedCategory,
          location: query.match(/happening in ([^,]+(?:, [^,]+)?)/)?.[1]
        })
      }
    };
  }

  /**
   * Create error response
   * @param {string} message - Error message
   * @param {Array} errors - Error details
   * @param {string} requestId - Request ID
   * @param {number} processingTime - Processing time
   * @returns {Object} Error response
   */
  createErrorResponse(message, errors = [], requestId, processingTime = 0) {
    return {
      success: false,
      requestId,
      error: message,
      errors: errors,
      count: 0,
      events: [],
      processingTime: processingTime ? `${processingTime}ms` : '0ms'
    };
  }

  /**
   * Generate unique request ID
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check for the entire pipeline
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      // Test Perplexity API connectivity
      const apiHealth = await this.perplexityClient.testConnection();
      
      // Test category manager
      const categoryTest = this.categoryManager.validateQuery({
        category: 'theatre',
        location: 'San Francisco, CA'
      });

      // Test event parser
      const parserTest = this.eventParser.parseResponse('Test content', 'theatre', 'San Francisco, CA');

      return {
        status: 'healthy',
        components: {
          perplexityApi: {
            status: apiHealth.success ? 'healthy' : 'error',
            details: apiHealth
          },
          categoryManager: {
            status: categoryTest.valid ? 'healthy' : 'error',
            details: categoryTest
          },
          eventParser: {
            status: 'healthy',
            details: { testParsed: Array.isArray(parserTest) }
          }
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default EventPipeline;