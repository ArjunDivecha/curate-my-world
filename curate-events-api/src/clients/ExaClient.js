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
import { calculateAggregatorScore } from '../utils/eventPageDetector.js';
import { getVenueDomains, buildVenueQueries } from '../utils/venueWhitelist.js';

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
   * Search for events using the Exa API with targeted event page queries.
   * Uses multiple targeted queries to find actual event detail pages, not listings.
   * @param {Object} options - Search options.
   * @returns {Promise<Object>} API response with events.
   */
  async searchEvents({ category, location, limit = 10 }) {
    const startTime = Date.now();
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    
    // Build multiple targeted queries that specifically find event DETAIL pages
    // Key insight: Generic searches return aggregators; we need to target specific event URLs
    const queries = this.buildTargetedQueries(category, location);
    
    logger.info('Searching Exa with targeted event queries', { 
      category, 
      location, 
      queryCount: queries.length 
    });
    
    // Run multiple targeted queries in parallel
    // Request more results per query since we'll filter and dedupe
    const allEvents = [];
    const resultsPerQuery = Math.max(15, Math.ceil(effectiveLimit / 3));
    
    const queryPromises = queries.map(queryObj => {
      // Handle both new object format and legacy string format
      if (typeof queryObj === 'string') {
        return this.executeSearch(queryObj, resultsPerQuery, category);
      }
      return this.executeSearch(queryObj.query, resultsPerQuery, category, queryObj.includeDomains);
    });
    const results = await Promise.allSettled(queryPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allEvents.push(...result.value);
      }
    }
    
    // Deduplicate by URL
    const seen = new Set();
    const uniqueEvents = allEvents.filter(event => {
      const key = event.eventUrl || event.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const processingTime = Date.now() - startTime;
    
    logger.info(`Exa targeted search completed`, { 
      totalEvents: uniqueEvents.length,
      processingTime: `${processingTime}ms` 
    });

    return {
      success: uniqueEvents.length > 0,
      events: uniqueEvents.slice(0, effectiveLimit),
      count: Math.min(uniqueEvents.length, effectiveLimit),
      processingTime,
      source: 'exa_targeted'
    };
  }

  /**
   * Get curated venue domains for a specific category from whitelist.xlsx
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @returns {string[]} List of domains
   */
  getCuratedDomains(category, location = 'Bay Area') {
    return getVenueDomains(category, location);
  }

  /**
   * Build targeted queries that specifically find event detail pages
   * Combines platform-specific, venue-specific, and date-specific strategies
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @returns {Object[]} Array of query objects with query string and optional domains
   */
  buildTargetedQueries(category, location) {
    const queries = [];
    const cat = String(category || '').toLowerCase();
    
    // Get current and upcoming months
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const currentMonth = months[new Date().getMonth()];
    const nextMonth = months[(new Date().getMonth() + 1) % 12];
    const monthAfter = months[(new Date().getMonth() + 2) % 12];
    
    // Get curated venue domains for this category from whitelist.xlsx
    const venueDomains = this.getCuratedDomains(category, location);
    
    // === OFFICIAL VENUE SEARCHES (highest quality - uses include_domains) ===
    // Search directly on official venue websites for this category
    if (venueDomains.length > 0) {
      queries.push({
        query: `${category} event tickets 2025`,
        includeDomains: venueDomains.slice(0, 10), // Exa limits domains
        label: 'venue_official'
      });
      queries.push({
        query: `upcoming ${category} schedule`,
        includeDomains: venueDomains.slice(0, 10),
        label: 'venue_schedule'
      });
    }
    
    // === PLATFORM-SPECIFIC QUERIES (high quality) ===
    
    // Eventbrite event pages
    queries.push({ query: `site:eventbrite.com/e/ ${category} ${location}`, label: 'eventbrite' });
    queries.push({ query: `site:eventbrite.com/e/ ${category} Bay Area`, label: 'eventbrite_bayarea' });
    
    // Meetup events
    queries.push({ query: `site:meetup.com ${category} ${location} RSVP`, label: 'meetup' });
    
    // Lu.ma events (popular for tech/professional events)
    queries.push({ query: `site:lu.ma ${category} ${location}`, label: 'luma' });
    queries.push({ query: `site:lu.ma ${category} San Francisco Bay Area`, label: 'luma_bayarea' });
    
    // === DATE-SPECIFIC QUERIES (finds actual events with dates) ===
    
    // Events with specific month mentions
    queries.push({ query: `${category} ${location} "${currentMonth}" 2025 tickets`, label: 'month_current' });
    queries.push({ query: `${category} ${location} "${nextMonth}" 2025 tickets`, label: 'month_next' });
    queries.push({ query: `${category} ${location} "${monthAfter}" 2025`, label: 'month_after' });
    
    // === VENUE-SPECIFIC QUERIES (finds events at known venues) ===
    
    // These return events happening at specific venues
    queries.push({ query: `${category} ${location} "live at" OR "performing at" tickets`, label: 'live_at' });
    queries.push({ query: `${category} ${location} "doors open" OR "showtime" 2025`, label: 'showtime' });
    
    // === GENERAL EVENT QUERIES (broader but still targeted) ===
    
    // Events with registration/ticket signals
    queries.push({ query: `${category} event ${location} "get tickets" OR "buy tickets" 2025`, label: 'tickets' });
    queries.push({ query: `${category} ${location} "register now" OR "RSVP" -calendar -schedule`, label: 'rsvp' });
    
    // Specific event formats
    queries.push({ query: `${category} show ${location} tickets 2025`, label: 'show' });
    queries.push({ query: `${category} concert ${location} 2025`, label: 'concert' });
    queries.push({ query: `${category} performance ${location} tickets`, label: 'performance' });
    
    return queries;
  }

  /**
   * Execute a single Exa search
   */
  async executeSearch(query, limit, category) {
    const payload = {
      query: query,
      type: "auto",
      numResults: limit,
      contents: {
        text: { maxCharacters: 2000, includeHtmlTags: false },
        summary: { 
          query: 'What is this specific event? Extract: event name, date, time, venue, ticket price.',
          maxCharacters: 500 
        }
      }
    };

    logger.debug('Exa query', { query });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const resultsArray = Array.isArray(data.results) ? data.results : [];
      const transformedEvents = resultsArray
        .map(result => this.transformEvent(result, category))
        .filter(Boolean);

      return transformedEvents;
    } catch (error) {
      logger.debug('Exa query failed', { error: error.message, query: query.substring(0, 50) });
      return [];
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

      // Extract content first for aggregator detection
      const content = exaResult.summary || exaResult.text || '';

      // Filter out category/aggregator pages that aren't individual events
      // Using sophisticated multi-factor detection
      if (this.isAggregatorPage(exaResult.title, exaResult.url, content)) {
        return null;
      }
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
        externalUrl: eventUrl, // Add externalUrl field for frontend compatibility
        source: 'exa_fast',
        confidence: 0.8, // Higher confidence with better extraction
        aiReasoning: exaResult.summary
      };
    } catch (error) {
      logger.error('Error transforming Exa event', { error: error.message, exaResultId: exaResult.id });
      return null;
    }
  }

  /**
   * Check if a result is an aggregator/category page rather than an individual event
   * Uses sophisticated multi-factor scoring from eventPageDetector
   * @param {string} title - The page title
   * @param {string} url - The page URL
   * @param {string} description - The page description
   * @returns {boolean} True if this is an aggregator page to filter out
   */
  isAggregatorPage(title, url, description = '') {
    const result = calculateAggregatorScore(url, title, description);
    
    if (result.isAggregator) {
      logger.debug('Detected aggregator page', {
        title: (title || '').substring(0, 50),
        score: result.score,
        reasons: result.reasons.slice(0, 3)
      });
    }
    
    return result.isAggregator;
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
