/**
 * =============================================================================
 * SCRIPT NAME: SerpApiClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Client for the SerpAPI service, which provides access to scraped search
 * engine results, including the Google Events rich results.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-07-31
 * AUTHOR: Cascade
 * =============================================================================
 */

import config from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SerpApiClient');

export class SerpApiClient {
  constructor() {
    this.apiKey = config.serpApiKey;
    this.baseUrl = 'https://serpapi.com/search.json';
    this.timeout = 15000; // 15 seconds
  }

  /**
   * Search for events using the SerpAPI Google Events engine.
   * @param {Object} options - Search options.
   * @returns {Promise<Object>} API response with events.
   */
  async searchEvents({ category, location, limit = 10 }) {
    const startTime = Date.now();
    const query = `${category} events in ${location}`;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'google_events',
      q: query,
      hl: 'en',
      gl: 'us'
    });

    const url = `${this.baseUrl}?${params.toString()}`;
    logger.info('Searching SerpAPI for events', { query });

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(url, { signal: controller.signal });
      
      clearTimeout(timeoutId);
      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const events = data.events_results || [];
      const transformedEvents = events.slice(0, limit).map(event => this.transformEvent(event, category)).filter(Boolean);

      logger.info(`SerpAPI search successful, found ${transformedEvents.length} events.`, { processingTime: `${processingTime}ms` });

      return {
        success: true,
        events: transformedEvents,
        count: transformedEvents.length,
        processingTime,
        source: 'serpapi'
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('SerpAPI error', { error: error.message, query, processingTime: `${processingTime}ms` });
      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        processingTime,
        source: 'serpapi'
      };
    }
  }

  /**
   * Transform a SerpAPI event into our standard event format.
   * @param {Object} serpEvent - A single event from the SerpAPI.
   * @param {string} category - The event category.
   * @returns {Object|null} A normalized event object or null if invalid.
   */
  transformEvent(serpEvent, category) {
    try {
      if (!serpEvent.title) return null;

      return {
        id: `serpapi_${serpEvent.title.replace(/\s+/g, '_')}`,
        title: serpEvent.title,
        description: serpEvent.description || 'No description available.',
        category: category,
        venue: serpEvent.address?.join(', ') || 'See Event Page',
        location: serpEvent.address?.join(', ') || 'See Event Page',
        startDate: new Date(serpEvent.date.start_date).toISOString(),
        endDate: new Date(serpEvent.date.when).toISOString(),
        eventUrl: serpEvent.link,
        ticketUrl: serpEvent.ticket_info?.find(t => t.link)?.link,
        source: 'serpapi_api',
        confidence: 0.85, // High confidence as it's from Google Events
        thumbnail: serpEvent.thumbnail
      };
    } catch (error) {
      logger.error('Error transforming SerpAPI event', { error: error.message, eventTitle: serpEvent.title });
      return null;
    }
  }

  /**
   * Get the health status of the SerpAPI.
   * @returns {Promise<Object>} Health status.
   */
  async getHealthStatus() {
    const startTime = Date.now();
    try {
      const response = await fetch(`https://serpapi.com/account?api_key=${this.apiKey}`);
      const processingTime = Date.now() - startTime;
      const data = await response.json();

      if (response.ok && data.account_email) {
        return { status: 'healthy', latency: processingTime, message: 'SerpAPI responding.' };
      } else {
        return { status: 'unhealthy', latency: processingTime, message: data.error || 'Invalid response' };
      }
    } catch (error) {
      return { status: 'unhealthy', latency: null, message: error.message };
    }
  }
}

export default SerpApiClient;
