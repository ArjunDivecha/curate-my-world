/**
 * =============================================================================
 * SCRIPT NAME: ExaClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Client for the Exa API, a search engine specialized in finding high-quality
 * content and extracting structured information.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-07-31
 * AUTHOR: Cascade
 * =============================================================================
 */

import config from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ExaClient');

export class ExaClient {
  constructor() {
    this.apiKey = config.exaApiKey;
    this.baseUrl = 'https://api.exa.ai';
    this.headers = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'CurateMyWorld/1.0'
    };
    this.timeout = 30000; // 30 seconds, as Exa can be slow
  }

  /**
   * Search for events using the Exa API.
   * @param {Object} options - Search options.
   * @returns {Promise<Object>} API response with events.
   */
  async searchEvents({ category, location, limit = 10 }) {
    const startTime = Date.now();
    const query = `${category} events in ${location} for the next 30 days`;

    const payload = {
      query: query,
      type: 'auto',
      numResults: limit,
      contents: {
        text: {
          maxCharacters: 2000
        },
        summary: {
          query: 'For each event found, list its name, venue, full date, and a ticket link if available. Format as a list.',
          maxCharacters: 500
        }
      }
    };

    logger.info('Searching Exa for events', { query });

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const transformedEvents = data.results.map(result => this.transformEvent(result, category)).filter(Boolean);

      logger.info(`Exa search successful, found ${transformedEvents.length} events.`, { processingTime: `${processingTime}ms` });

      return {
        success: true,
        events: transformedEvents,
        count: transformedEvents.length,
        processingTime,
        source: 'exa'
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Exa API error', { error: error.message, query, processingTime: `${processingTime}ms` });
      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        processingTime,
        source: 'exa'
      };
    }
  }

  /**
   * Transform an Exa result into our standard event format.
   * @param {Object} exaResult - A single result from the Exa API.
   * @param {string} category - The event category.
   * @returns {Object|null} A normalized event object or null if invalid.
   */
  transformEvent(exaResult, category) {
    try {
      if (!exaResult.title) return null;

      return {
        id: `exa_${exaResult.id}`,
        title: exaResult.title,
        description: exaResult.summary || exaResult.text || 'No description available.',
        category: category,
        venue: 'See Event Page',
        location: 'See Event Page',
        startDate: exaResult.publishedDate || new Date().toISOString(),
        endDate: exaResult.publishedDate || new Date().toISOString(),
        eventUrl: exaResult.url,
        source: 'exa_api',
        confidence: 0.7, // Lower confidence as it's from web search
        aiReasoning: exaResult.summary
      };
    } catch (error) {
      logger.error('Error transforming Exa event', { error: error.message, exaResultId: exaResult.id });
      return null;
    }
  }

  /**
   * Get the health status of the Exa API.
   * @returns {Promise<Object>} Health status.
   */
  async getHealthStatus() {
    const startTime = Date.now();
    try {
      const response = await this.searchEvents({ category: 'test', location: 'test', limit: 1 });
      const processingTime = Date.now() - startTime;

      if (response.success) {
        return { status: 'healthy', latency: processingTime, message: 'Exa API responding.' };
      } else {
        return { status: 'unhealthy', latency: processingTime, message: response.error };
      }
    } catch (error) {
      return { status: 'unhealthy', latency: null, message: error.message };
    }
  }
}

export default ExaClient;
