/**
 * =============================================================================
 * SCRIPT NAME: SerperClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Client for the Serper.dev service, which provides access to Google Search
 * results including events and organic search results. This replaces SerpAPI
 * due to credit limitations.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-08-06
 * AUTHOR: Cascade
 * =============================================================================
 */

import config from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { expandAggregatorUrl, isAggregatorDomain } from '../utils/aggregators/index.js';

const logger = createLogger('SerperClient');

export class SerperClient {
  constructor() {
    this.apiKey = config.serperApiKey;
    this.baseUrl = 'https://google.serper.dev/search';
    this.timeout = 15000; // 15 seconds
  }

  /**
   * Search for events using Serper Google Search API.
   * @param {Object} options - Search options.
   * @returns {Promise<Object>} API response with events.
   */
  async searchEvents({ category, location, limit = 10 }) {
    const startTime = Date.now();
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 10, 200));

    const eventsEndpointResult = await this.searchEventsEndpoint({ category, location, limit: effectiveLimit });
    if (eventsEndpointResult.success && eventsEndpointResult.events.length >= Math.min(effectiveLimit, 20)) {
      const enriched = await this.expandAggregators(eventsEndpointResult.events, category);
      return {
        success: true,
        events: enriched.slice(0, effectiveLimit),
        count: Math.min(enriched.length, effectiveLimit),
        processingTime: Date.now() - startTime,
        source: 'serper',
        metadata: {
          mode: 'events_endpoint',
          totalFetched: enriched.length
        }
      };
    }

    const base = `${category} ${location}`.trim();

    const staticVariants = [
      `${base} events 2025`,
      `${base} upcoming events`,
      `${base} tickets`,
      `${category} things to do in ${location}`,
      `${category} ${location} calendar`,
      `${category} events near ${location}`,
      `${category} ${location} schedule`,
      `${category} ${location} festival`,
      `upcoming ${category} shows in ${location}`,
      `${category} meetup ${location}`,
      `${category} conferences in ${location}`
    ];

    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    const currentMonthIndex = new Date().getMonth();
    const monthVariants = [];
    for (let i = 0; i < 6; i += 1) {
      const monthName = monthNames[(currentMonthIndex + i) % 12];
      monthVariants.push(`${category} ${location} ${monthName} events`);
    }

    const queryVariants = [...staticVariants, ...monthVariants];

    const aggregated = [];
    const seenUrls = new Set();
    const querySummaries = [];
    let lastError = null;

    for (const query of queryVariants) {
      if (aggregated.length >= effectiveLimit) break;

      logger.info('Searching Serper for events', { query });

      const perQueryLimit = Math.min(50, Math.max(20, Math.ceil(effectiveLimit / queryVariants.length) * 2));

      const payload = {
        q: query,
        gl: 'us',
        hl: 'en',
        num: perQueryLimit,
        type: 'search'
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }

        const organicResults = Array.isArray(data.organic) ? data.organic : [];
        const peopleAlsoAsk = Array.isArray(data.peopleAlsoAsk) ? data.peopleAlsoAsk : [];
        const eventResults = this.filterEventResults([...organicResults, ...peopleAlsoAsk]);

        for (const result of eventResults) {
          if (aggregated.length >= effectiveLimit) break;
          const transformed = this.transformEvent(result, category);
          if (!transformed || !transformed.eventUrl) continue;
          if (seenUrls.has(transformed.eventUrl)) continue;
          seenUrls.add(transformed.eventUrl);
          aggregated.push(transformed);
        }

        querySummaries.push({
          query,
          rawResults: organicResults.length,
          eventCandidates: eventResults.length,
          kept: aggregated.length
        });

      } catch (error) {
        lastError = error;
        logger.error('Serper error', { error: error.message, query });
      }
    }

    const processingTime = Date.now() - startTime;

    if (aggregated.length === 0 && lastError) {
      return {
        success: false,
        error: lastError.message,
        events: [],
        count: 0,
        processingTime,
        source: 'serper'
      };
    }

    const enriched = await this.expandAggregators(aggregated, category);

    return {
      success: true,
      events: enriched.slice(0, effectiveLimit),
      count: Math.min(enriched.length, effectiveLimit),
      processingTime,
      source: 'serper',
      metadata: {
        queriesTried: querySummaries,
        totalFetched: enriched.length,
        mode: 'search_fallback'
      }
    };
  }

  async searchEventsEndpoint({ category, location, limit }) {
    const query = `${category} ${location}`.trim();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch('https://google.serper.dev/events', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: query,
          gl: 'us',
          hl: 'en',
          num: Math.min(limit, 50)
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body}`);
      }
      const data = await response.json();
      const events = Array.isArray(data?.events) ? data.events : [];
      const normalized = events
        .map((event, index) => this.normalizeEventsEndpointResult(event, category, location, index))
        .filter(Boolean);
      return {
        success: normalized.length > 0,
        events: normalized,
        rawCount: events.length
      };
    } catch (error) {
      logger.debug('Serper events endpoint failed', { error: error.message, category, location });
      return { success: false, events: [] };
    }
  }

  normalizeEventsEndpointResult(event, category, location, index) {
    if (!event) return null;
    const url = event.link || event.url;
    const title = event.title || event.name;
    if (!url || !title) return null;

    const startDate = event.date?.startDate || event.startDate || event.start_time || event.date;
    const endDate = event.date?.endDate || event.endDate || event.end_time || startDate;

    const venueName = event.venue || event.location?.name || event.location;
    const address = event.address || event.location?.address || location;

    return {
      id: `serper_events_${Buffer.from(`${url}-${index}`).toString('base64').slice(0, 12)}`,
      title,
      description: event.description || event.snippet || 'See event page for details.',
      category,
      categories: [category].filter(Boolean),
      venue: venueName || 'See Event Page',
      location: address || location,
      startDate: this.normalizeDate(startDate),
      endDate: this.normalizeDate(endDate) || this.normalizeDate(startDate),
      eventUrl: url,
      ticketUrl: event.ticket || url,
      externalUrl: url,
      source: 'serper',
      confidence: 0.7,
      aiReasoning: event.snippet || 'Provided by Serper events endpoint.'
    };
  }

  async expandAggregators(events, category) {
    const expanded = [];
    const visitedAggregators = new Set();

    for (const event of events) {
      const domain = event?.eventUrl ? this.extractDomain(event.eventUrl) : null;
      if (domain && isAggregatorDomain(domain) && !visitedAggregators.has(domain)) {
        visitedAggregators.add(domain);
        const addition = await expandAggregatorUrl({
          url: event.eventUrl || event.externalUrl,
          category,
          provider: 'serper'
        });
        if (addition.length > 0) {
          expanded.push(...addition);
          continue;
        }
      }
      expanded.push(event);
    }

    return expanded;
  }

  /**
   * Filter search results to find event-related content.
   * @param {Array} results - Search results from Serper.
   * @returns {Array} Filtered results that appear to be events.
   */
  filterEventResults(results) {
    const eventKeywords = [
      'event', 'festival', 'concert', 'conference', 'workshop', 'meetup',
      'seminar', 'exhibition', 'show', 'performance', 'gathering', 'summit',
      'fair', 'expo', 'convention', 'symposium', 'webinar', 'class',
      'eventbrite', 'meetup.com', 'facebook.com/events', 'tickets',
      'registration', 'rsvp', 'calendar'
    ];

    return results.filter(result => {
      const title = (result.title || '').toLowerCase();
      const snippet = (result.snippet || '').toLowerCase();
      const link = (result.link || '').toLowerCase();
      const question = (result.question || '').toLowerCase();
      
      const searchText = `${title} ${snippet} ${link} ${question}`;
      
      return eventKeywords.some(keyword => searchText.includes(keyword)) ||
             this.containsDatePattern(searchText) ||
             this.containsVenuePattern(searchText);
    });
  }

  /**
   * Check if text contains date patterns indicating an event.
   * @param {string} text - Text to check.
   * @returns {boolean} True if date patterns found.
   */
  containsDatePattern(text) {
    const datePatterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
      /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*,?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
      /\b(today|tomorrow|tonight|this\s+(week|weekend|month))\b/i,
      /\b\d{1,2}(st|nd|rd|th)\s+(of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i
    ];
    
    return datePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Check if text contains venue/location patterns.
   * @param {string} text - Text to check.
   * @returns {boolean} True if venue patterns found.
   */
  containsVenuePattern(text) {
    const venuePatterns = [
      /\b(at|@)\s+[A-Z][a-zA-Z\s]+\b/,
      /\b(venue|location|address|hall|center|theatre|theater|auditorium|stadium|arena)\b/i,
      /\b\d+\s+[A-Z][a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)\b/i
    ];
    
    return venuePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Transform a Serper search result into our standard event format.
   * @param {Object} serperResult - A single result from Serper.
   * @param {string} category - The event category.
   * @returns {Object|null} A normalized event object or null if invalid.
   */
  transformEvent(serperResult, category) {
    try {
      const title = serperResult.title || serperResult.question;
      if (!title) return null;

      // Extract date information from snippet or title
      const snippet = serperResult.snippet || '';
      const dateInfo = this.extractDateInfo(title + ' ' + snippet);
      
      // Extract venue information
      const venue = this.extractVenue(title + ' ' + snippet);
      
      // Generate event ID
      const eventId = `serper_${title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

      return {
        id: eventId,
        title: title,
        description: snippet || 'Event details available on the event page.',
        category: category,
        venue: venue,
        location: venue,
        startDate: dateInfo.startDate,
        endDate: dateInfo.endDate,
        eventUrl: serperResult.link,
        ticketUrl: this.extractTicketUrl(serperResult.link, snippet),
        source: 'serper',
        confidence: this.calculateConfidence(serperResult, category),
        thumbnail: null // Serper doesn't provide thumbnails in basic search
      };
    } catch (error) {
      logger.error('Error transforming Serper event', { 
        error: error.message, 
        eventTitle: serperResult.title || serperResult.question 
      });
      return null;
    }
  }

  /**
   * Extract date information from text.
   * @param {string} text - Text to extract dates from.
   * @returns {Object} Object with startDate and endDate.
   */
  extractDateInfo(text) {
    const now = new Date();
    let startDate = now.toISOString();
    let endDate = startDate;

    // Try to extract specific dates
    const datePatterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s*(\d{4})?/i,
      /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/,
      /\b(\d{1,2})(st|nd|rd|th)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          let dateStr;
          if (pattern.source.includes('january|february')) {
            // Month name pattern
            const month = match[1];
            const day = match[2];
            const year = match[3] || now.getFullYear();
            dateStr = `${month} ${day}, ${year}`;
          } else if (pattern.source.includes('\\d{1,2}\\/')) {
            // MM/DD/YYYY pattern
            const month = match[1];
            const day = match[2];
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            dateStr = `${month}/${day}/${year}`;
          } else {
            // Day + month pattern
            const day = match[1];
            const month = match[3];
            const year = now.getFullYear();
            dateStr = `${month} ${day}, ${year}`;
          }
          
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            startDate = parsedDate.toISOString();
            endDate = startDate;
            break;
          }
        } catch (e) {
          // Continue to next pattern if parsing fails
        }
      }
    }

    return { startDate, endDate };
  }

  /**
   * Extract venue information from text.
   * @param {string} text - Text to extract venue from.
   * @returns {string} Venue name or default.
   */
  extractVenue(text) {
    const venuePatterns = [
      /\b(?:at|@)\s+([A-Z][a-zA-Z\s&'-]+(?:Center|Centre|Hall|Theatre|Theater|Auditorium|Stadium|Arena|Club|Bar|Restaurant|Hotel|Museum|Gallery|Park))\b/i,
      /\b([A-Z][a-zA-Z\s&'-]+(?:Center|Centre|Hall|Theatre|Theater|Auditorium|Stadium|Arena))\b/i,
      /\b(?:venue|location):\s*([A-Z][a-zA-Z\s&'-]+)/i
    ];

    for (const pattern of venuePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return 'See Event Page';
  }

  /**
   * Extract ticket URL if different from main event URL.
   * @param {string} eventUrl - Main event URL.
   * @param {string} snippet - Event snippet text.
   * @returns {string|null} Ticket URL or null.
   */
  extractTicketUrl(eventUrl, snippet) {
    // If the main URL is already a ticket platform, return it
    const ticketDomains = ['eventbrite.com', 'ticketmaster.com', 'universe.com', 'brownpapertickets.com'];
    if (ticketDomains.some(domain => eventUrl && eventUrl.includes(domain))) {
      return eventUrl;
    }

    // Look for ticket URLs in snippet
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = snippet.match(urlPattern) || [];
    
    for (const url of urls) {
      if (ticketDomains.some(domain => url.includes(domain))) {
        return url;
      }
    }

    return null;
  }

  /**
   * Calculate confidence score for an event.
   * @param {Object} result - Serper search result.
   * @param {string} category - Event category.
   * @returns {number} Confidence score between 0 and 1.
   */
  calculateConfidence(result, category) {
    let confidence = 0.6; // Base confidence for Serper results

    const text = `${result.title || ''} ${result.snippet || ''} ${result.link || ''}`.toLowerCase();
    
    // Boost confidence for event-specific domains
    const eventDomains = ['eventbrite.com', 'meetup.com', 'facebook.com/events', 'lu.ma'];
    if (eventDomains.some(domain => text.includes(domain))) {
      confidence += 0.2;
    }

    // Boost confidence for category-specific keywords
    if (text.includes(category.toLowerCase())) {
      confidence += 0.1;
    }

    // Boost confidence for event keywords
    const eventKeywords = ['event', 'festival', 'concert', 'conference', 'workshop'];
    if (eventKeywords.some(keyword => text.includes(keyword))) {
      confidence += 0.1;
    }

    // Boost confidence for date patterns
    if (this.containsDatePattern(text)) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get the health status of the Serper API.
   * @returns {Promise<Object>} Health status.
   */
  async getHealthStatus() {
    const startTime = Date.now();
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: 'test',
          num: 1
        })
      });
      
      const processingTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        return { 
          status: 'healthy', 
          latency: processingTime, 
          message: 'Serper API responding.',
          credits: data.credits || 'unknown'
        };
      } else {
        const errorText = await response.text();
        return { 
          status: 'unhealthy', 
          latency: processingTime, 
          message: `HTTP ${response.status}: ${errorText}` 
        };
      }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        latency: null, 
        message: error.message 
      };
    }
  }

  extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  normalizeDate(value) {
    if (!value) return null;
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString();
    } catch {
      return null;
    }
  }
}

export default SerperClient;
