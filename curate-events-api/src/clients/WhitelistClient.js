/**
 * =============================================================================
 * WHITELIST CLIENT - Fetch events from whitelisted domains
 * =============================================================================
 * 
 * Uses Serper site: queries to search whitelisted domains for events.
 * All events are tagged with source: "whitelist" for display.
 * 
 * =============================================================================
 */

import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { getWhitelistDomains } from '../utils/listManager.js';

const logger = createLogger('WhitelistClient');

class WhitelistClient {
  constructor() {
    this.name = 'whitelist';
    this.apiKey = config.serperApiKey;
    this.baseUrl = 'https://google.serper.dev/search';
  }

  /**
   * Search whitelisted domains for events
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @param {Object} options - Additional options
   * @returns {Object} { events, stats }
   */
  async searchEvents(category, location, options = {}) {
    const startTime = Date.now();
    const { limit = 20 } = options;
    
    // Get whitelist domains for this category/location
    const whitelistEntries = getWhitelistDomains(category, location);
    
    if (whitelistEntries.length === 0) {
      logger.info(`No whitelist entries for category: ${category}, location: ${location}`);
      return {
        events: [],
        stats: {
          source: 'whitelist',
          totalResults: 0,
          domainsSearched: 0,
          processingTime: Date.now() - startTime,
        }
      };
    }

    logger.info(`Searching ${whitelistEntries.length} whitelist domains for ${category} in ${location}`);

    // Search each domain in parallel (max 5 concurrent)
    const allEvents = [];
    const batchSize = 5;
    
    for (let i = 0; i < whitelistEntries.length; i += batchSize) {
      const batch = whitelistEntries.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(entry => this.searchDomain(entry, category, location))
      );
      
      batchResults.forEach(result => {
        if (result.events) {
          allEvents.push(...result.events);
        }
      });
      
      // Stop if we have enough events
      if (allEvents.length >= limit * 2) break;
    }

    // Dedupe and limit
    const uniqueEvents = this.dedupeEvents(allEvents);
    const limitedEvents = uniqueEvents.slice(0, limit);

    const processingTime = Date.now() - startTime;
    logger.info(`Whitelist search complete: ${limitedEvents.length} events from ${whitelistEntries.length} domains in ${processingTime}ms`);

    return {
      events: limitedEvents,
      stats: {
        source: 'whitelist',
        totalResults: allEvents.length,
        uniqueResults: uniqueEvents.length,
        returnedResults: limitedEvents.length,
        domainsSearched: whitelistEntries.length,
        processingTime,
      }
    };
  }

  /**
   * Search a single domain for events
   */
  async searchDomain(entry, category, location) {
    const { domain, name } = entry;
    
    try {
      const query = `site:${domain} events 2025 ${location}`;
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: query,
          num: 10
        })
      });

      if (!response.ok) {
        logger.warn(`Serper request failed for ${domain}: ${response.status}`);
        return { events: [] };
      }

      const data = await response.json();
      const results = data.organic || [];

      // Transform to event format
      const events = results
        .filter(r => this.looksLikeEvent(r))
        .map(r => this.transformToEvent(r, entry, category));

      logger.debug(`Found ${events.length} events from ${domain}`);
      return { events };

    } catch (error) {
      logger.error(`Error searching ${domain}:`, error.message);
      return { events: [] };
    }
  }

  /**
   * Check if a search result looks like an event (not a listing page)
   */
  looksLikeEvent(result) {
    const url = (result.link || '').toLowerCase();
    const title = (result.title || '').toLowerCase();
    
    // Block listing/calendar pages
    const listingPatterns = [
      /\/calendar\/?$/,
      /\/events\/?$/,
      /\/shows\/?$/,
      /\/schedule\/?$/,
      /all-events/,
      /upcoming-events/,
      /what's-on/,
    ];
    
    for (const pattern of listingPatterns) {
      if (pattern.test(url)) return false;
    }
    
    // Block generic pages
    if (url.endsWith('/') && url.split('/').length <= 4) return false;
    if (title.includes('calendar') && !title.includes('2025')) return false;
    
    return true;
  }

  /**
   * Transform Serper result to event format
   */
  transformToEvent(result, whitelistEntry, category) {
    const { domain, name: venueName } = whitelistEntry;
    
    // Try to extract date from title or snippet
    const dateMatch = (result.title + ' ' + result.snippet).match(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?/i
    );
    
    let startDate = null;
    if (dateMatch) {
      try {
        const parsed = new Date(dateMatch[0] + (dateMatch[0].includes('202') ? '' : ' 2025'));
        if (!isNaN(parsed.getTime())) {
          startDate = parsed.toISOString();
        }
      } catch {}
    }

    return {
      id: `whitelist_${domain}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: result.title || 'Untitled Event',
      description: result.snippet || '',
      venue: venueName || domain,
      address: '',
      city: whitelistEntry.city || '',
      state: 'CA',
      startDate,
      endDate: null,
      priceRange: { min: null, max: null },
      eventUrl: result.link,
      ticketUrl: result.link,
      externalUrl: result.link,
      category,
      originalCategory: category,
      source: 'whitelist',  // <-- Tagged as whitelist!
      originalSource: 'whitelist',
      confidence: 0.8,
      metadata: {
        whitelistDomain: domain,
        whitelistVenue: venueName,
        searchRank: result.position || 0,
      }
    };
  }

  /**
   * Dedupe events by URL
   */
  dedupeEvents(events) {
    const seen = new Set();
    return events.filter(event => {
      const key = event.eventUrl || event.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export default WhitelistClient;

