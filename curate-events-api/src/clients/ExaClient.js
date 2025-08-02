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
    // Enhanced query to specifically target event pages with registration/ticket links
    const query = `${category} events ${location} 2025 tickets registration eventbrite meetup conference workshop`;

    const payload = {
      query: query,
      type: 'auto',
      numResults: limit,
      // Enhanced content extraction to get better event details and URLs
      contents: {
        text: {
          maxCharacters: 3000,
          includeHtmlTags: false
        },
        summary: {
          query: 'Extract: event name, exact venue/location, full date and time, ticket/registration URL, event description. Include any eventbrite, meetup, or registration links found.',
          maxCharacters: 800
        }
      }
      // Removed includeDomains filter to allow broader event discovery
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

      // Extract better venue and location info from summary/text
      const content = exaResult.summary || exaResult.text || '';
      const venue = this.extractVenue(content) || 'See Event Page';
      const location = this.extractLocation(content) || 'See Event Page';
      
      // Try to extract ticket/registration URL from content
      const ticketUrl = this.extractTicketUrl(content);
      
      // Use the main URL as eventUrl, and ticketUrl as backup
      const eventUrl = exaResult.url;
      const finalTicketUrl = ticketUrl || eventUrl;

      return {
        id: `exa_${exaResult.id}`,
        title: exaResult.title,
        description: exaResult.summary || exaResult.text || 'No description available.',
        category: category,
        venue: venue,
        location: location,
        startDate: this.extractDate(content) || new Date().toISOString(),
        endDate: this.extractDate(content) || new Date().toISOString(),
        eventUrl: eventUrl,
        ticketUrl: finalTicketUrl,
        source: 'exa_api',
        confidence: 0.8, // Higher confidence with better extraction
        aiReasoning: exaResult.summary
      };
    } catch (error) {
      logger.error('Error transforming Exa event', { error: error.message, exaResultId: exaResult.id });
      return null;
    }
  }

  /**
   * Extract venue information from content text
   * @param {string} content - The content to search
   * @returns {string|null} Extracted venue or null
   */
  extractVenue(content) {
    const venuePatterns = [
      /venue[:\s]+([^\n,.]+)/i,
      /location[:\s]+([^\n,.]+)/i,
      /at\s+([^\n,.]+(?:center|hall|hotel|building|room|auditorium|theater|conference|campus))/i,
      /held at\s+([^\n,.]+)/i
    ];
    
    for (const pattern of venuePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract location information from content text
   * @param {string} content - The content to search
   * @returns {string|null} Extracted location or null
   */
  extractLocation(content) {
    const locationPatterns = [
      /([A-Z][a-z]+,\s*[A-Z]{2})/,  // City, State
      /([A-Z][a-z]+\s+[A-Z][a-z]+,\s*[A-Z]{2})/,  // City Name, State
      /(\d+\s+[^\n,]+(?:street|st|avenue|ave|road|rd|blvd|boulevard)[^\n,]*)/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract ticket/registration URL from content text
   * @param {string} content - The content to search
   * @returns {string|null} Extracted ticket URL or null
   */
  extractTicketUrl(content) {
    const urlPatterns = [
      /(https?:\/\/[^\s]+eventbrite[^\s]*)/i,
      /(https?:\/\/[^\s]+meetup[^\s]*)/i,
      /(https?:\/\/[^\s]+tickets?[^\s]*)/i,
      /(https?:\/\/[^\s]+register[^\s]*)/i,
      /(https?:\/\/[^\s]+lu\.ma[^\s]*)/i,
      /(https?:\/\/[^\s]+universe\.com[^\s]*)/i
    ];
    
    for (const pattern of urlPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].replace(/[),.;]$/, ''); // Remove trailing punctuation
      }
    }
    return null;
  }

  /**
   * Extract date information from content text
   * @param {string} content - The content to search
   * @returns {string|null} Extracted date in ISO format or null
   */
  extractDate(content) {
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{4})/,  // MM/DD/YYYY
      /(\d{4}-\d{2}-\d{2})/,        // YYYY-MM-DD
      /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,  // Month DD, YYYY
      /(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/i     // DD Month YYYY
    ];
    
    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        try {
          const date = new Date(match[1]);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }
    return null;
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
