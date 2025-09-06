/**
 * =============================================================================
 * SCRIPT NAME: HighVolumeSerperClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * High-volume Serper client optimized for Google Events data with comprehensive
 * location filtering, cost tracking, and Bay Area event discovery. Ported from
 * Python implementation with performance optimizations for Node.js.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-09-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import config from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { WhitelistManager } from '../utils/WhitelistManager.js';
import { BlacklistManager } from '../utils/BlacklistManager.js';
import { CostTracker, SerperCostCalculator } from '../utils/costTracking.js';

const logger = createLogger('HighVolumeSerperClient');

export class HighVolumeSerperClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.serperApiKey;
    this.baseUrl = 'https://google.serper.dev/search';
    this.headers = {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'CurateMyWorld-HighVolume/2.0'
    };
    this.timeout = 5000; // Fast timeout for high volume
    
    // Initialize managers
    this.whitelistManager = new WhitelistManager();
    this.blacklistManager = new BlacklistManager();
    this.costTracker = new CostTracker();
    
    // TTL Cache (1 hour for fresher data)
    this.cache = new Map();
    this.cacheTimeout = 1 * 60 * 60 * 1000;
    
    // Cost tracking for statistics
    this.totalCost = 0;
    this.requestCount = 0;

    // Geographic filtering for Bay Area
    this.bayAreaCities = [
      'San Francisco', 'Oakland', 'Berkeley', 'Palo Alto', 'Mountain View',
      'Redwood City', 'San Jose', 'Fremont', 'Hayward', 'Sunnyvale',
      'Santa Clara', 'Cupertino', 'Menlo Park', 'San Mateo', 'Daly City',
      'Union City', 'Pleasanton', 'Livermore', 'San Rafael', 'Petaluma'
    ];

    logger.info('High-volume Serper client initialized with geographic filtering and cost tracking');
  }

  /**
   * Search for events using Serper Google Events API
   * @param {Object} options - Search options
   * @returns {Promise<Object>} API response with events
   */
  async searchEvents({ 
    category, 
    location, 
    limit = 20,
    scope = 'bayarea',           // berkeley, eastbay, bayarea
    topicProfile = 'arts-culture', // Category-specific filtering
    precision = 'official',      // official, broad
    horizonDays = 30,           // Event horizon for filtering
    mode = 'events'             // events, news (future expansion)
  }) {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = this.generateCacheKey({
      category, location, limit, scope, topicProfile, precision, horizonDays, mode
    });

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.info('Returning cached Serper results', { processingTime: '0ms (cached)' });
      return cached;
    }

    try {
      // Build enhanced query for Google Events
      const enhancedQuery = this.buildEnhancedQuery(category, location, topicProfile);
      
      // Calculate geographic location for Google Events
      const geoLocation = this.calculateGeoLocation(location, scope);

      // Build search payload (using 'search' type like working SerperClient)
      const searchPayload = {
        q: enhancedQuery,
        type: 'search',
        location: geoLocation,
        num: Math.min(limit * 2, 100), // Get more results to filter for events
        gl: 'us',
        hl: 'en'
      };

      logger.info('Executing Serper Google Events search', { 
        query: enhancedQuery, 
        location: geoLocation,
        limit
      });

      const searchResponse = await this.makeRequest('', searchPayload);
      // Extract from organic results like the working SerperClient
      const organicResults = searchResponse.organic || [];
      const peopleAlsoAsk = searchResponse.peopleAlsoAsk || [];
      
      // Filter and combine results that look like events
      const rawEvents = this.filterEventResults([...organicResults, ...peopleAlsoAsk]);

      if (!rawEvents.length) {
        const cost = await this.costTracker.logSerperCost({
          query: enhancedQuery,
          numRequests: 1,
          operation: 'search'
        });

        // Update local cost tracking
        this.totalCost += cost;
        this.requestCount++;

        const response = {
          success: true,
          events: [],
          count: 0,
          processingTime: Date.now() - startTime,
          source: 'serper_highvolume',
          cost,
          metadata: { location: geoLocation, mode }
        };

        this.setCache(cacheKey, response);
        return response;
      }

      // Process and filter events
      const events = await this.processEvents(rawEvents, {
        category,
        topicProfile,
        location,
        scope,
        precision,
        horizonDays
      });

      // Calculate and log costs
      const cost = await this.costTracker.logSerperCost({
        query: enhancedQuery,
        numRequests: 1,
        operation: 'search'
      });

      // Update local cost tracking
      this.totalCost += cost;
      this.requestCount++;

      const processingTime = Date.now() - startTime;
      const response = {
        success: true,
        events,
        count: events.length,
        processingTime,
        source: 'serper_highvolume',
        cost,
        metadata: {
          rawResults: rawEvents.length,
          location: geoLocation,
          filtered: rawEvents.length - events.length,
          mode
        }
      };

      // Cache results
      this.setCache(cacheKey, response);

      logger.info('Serper high-volume search completed', { 
        query: enhancedQuery,
        rawResults: rawEvents.length,
        processedEvents: events.length,
        cost: `$${cost.toFixed(6)}`,
        processingTime: `${processingTime}ms`
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Serper API error', { 
        error: error.message, 
        category, 
        location,
        processingTime: `${processingTime}ms`
      });

      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        processingTime,
        source: 'serper_highvolume'
      };
    }
  }

  /**
   * Build enhanced query for Google Events
   * @param {string} category - Event category
   * @param {string} location - Location
   * @param {string} topicProfile - Topic profile for targeting
   * @returns {string} Enhanced query
   */
  buildEnhancedQuery(category, location, topicProfile) {
    const baseQuery = `${category} events ${location}`;
    
    // Add topic-specific enhancers for Google Events
    const topicEnhancements = {
      'arts-culture': 'exhibitions museums galleries performances',
      'talks-ai': 'AI artificial intelligence machine learning conference',
      'talks-childdev': 'child development parenting early childhood',
      'talks-general': 'lecture seminar academic university',
      'technology': 'tech startup meetup conference innovation',
      'finance': 'financial investment trading workshop',
      'business': 'business networking entrepreneurship',
      'music': 'concert live music festival performance',
      'theatre': 'theater play musical drama',
      'art': 'art gallery exhibition opening',
      'comedy': 'comedy show standup humor',
      'fitness': 'fitness yoga workout health',
      'food': 'food festival restaurant tasting',
      'nightlife': 'nightlife party club DJ',
      'networking': 'networking professional business'
    };

    const enhancement = topicEnhancements[topicProfile] || '';
    return `${baseQuery} ${enhancement}`.trim();
  }

  /**
   * Calculate optimal geo-location for Google Events API
   * @param {string} location - Base location
   * @param {string} scope - Geographic scope
   * @returns {string} Formatted geo-location
   */
  calculateGeoLocation(location, scope) {
    const scopeLocations = {
      berkeley: 'Berkeley, California, United States',
      eastbay: 'East Bay, California, United States', 
      bayarea: 'San Francisco Bay Area, California, United States'
    };

    return scopeLocations[scope] || `${location}, California, United States`;
  }

  /**
   * Process and filter raw Google Events results
   * @param {Array} rawEvents - Raw events from Google
   * @param {Object} context - Processing context
   * @returns {Array} Processed and filtered events
   */
  async processEvents(rawEvents, context) {
    const events = [];
    const seenTitles = new Set();

    for (const rawEvent of rawEvents) {
      try {
        // Extract core event fields
        const eventFields = this.extractEventFields(rawEvent);
        
        // Skip if missing essential data
        if (!eventFields.title) {
          continue;
        }

        // Deduplicate by title (simple approach for Google Events)
        const titleKey = this.normalizeTitle(eventFields.title);
        if (seenTitles.has(titleKey)) {
          continue;
        }
        seenTitles.add(titleKey);

        // Geographic filtering
        if (!this.passesGeographicFilter(eventFields, context.scope)) {
          continue;
        }

        // Domain filtering (for event links)
        if (eventFields.link && await this.blacklistManager.isBlacklisted(eventFields.link)) {
          continue;
        }

        // Date filtering
        if (!this.passesDateFilter(eventFields.date, context.horizonDays)) {
          continue;
        }

        // Create standardized event object
        const event = {
          id: `serper_${this.generateEventId(eventFields)}`,
          title: this.cleanTitle(eventFields.title),
          description: eventFields.description || '',
          category: this.mapCategoryName(context.topicProfile),
          tags: this.generateTags(context.topicProfile),
          venue: eventFields.venue,
          location: eventFields.address || context.location,
          startDate: this.normalizeDate(eventFields.date),
          endDate: null, // Google Events typically doesn't provide end dates
          url: eventFields.link || null,
          imageUrl: eventFields.thumbnail || null,
          price: null, // Google Events doesn't typically include pricing
          source: 'serper_highvolume',
          metadata: {
            originalAddress: eventFields.address,
            eventId: rawEvent.event_id || null
          }
        };

        events.push(event);

      } catch (error) {
        logger.warn('Error processing Serper event', { 
          error: error.message, 
          title: rawEvent.title 
        });
        continue;
      }
    }

    return events;
  }

  /**
   * Extract structured fields from organic search result
   * @param {Object} rawEvent - Raw search result from Google/Serper
   * @returns {Object} Extracted fields
   */
  extractEventFields(rawEvent) {
    const snippet = rawEvent.snippet || rawEvent.description || '';
    
    return {
      title: rawEvent.title || '',
      description: snippet,
      venue: this.extractVenueFromText(snippet),
      address: this.extractAddressFromText(snippet),
      date: this.extractDateFromText(snippet),
      link: rawEvent.link || rawEvent.url || null,
      thumbnail: null // Organic results typically don't have thumbnails
    };
  }

  /**
   * Extract venue from text content
   * @param {string} text - Text to search
   * @returns {string|null} Extracted venue
   */
  extractVenueFromText(text) {
    const venuePatterns = [
      /at\s+([A-Z][^,\n.]+(?:center|hall|theater|theatre|museum|gallery|club|bar|venue))/i,
      /venue:\s*([A-Z][^,\n.]+)/i,
      /location:\s*([A-Z][^,\n.]+)/i,
      /hosted by\s+([A-Z][^,\n.]+)/i
    ];

    for (const pattern of venuePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 100);
      }
    }
    return null;
  }

  /**
   * Extract address from text content
   * @param {string} text - Text to search
   * @returns {string|null} Extracted address
   */
  extractAddressFromText(text) {
    const addressPatterns = [
      /\b\d+\s+[A-Z][^,\n.]*(?:street|st|avenue|ave|road|rd|drive|dr|blvd|boulevard)[^,\n.]*/i,
      /\b[A-Z][^,\n.]*,\s*[A-Z][A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}/i, // City, State ZIP
      /\b[A-Z][^,\n.]*\s+(?:berkeley|oakland|san francisco|palo alto|mountain view)/i
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim().substring(0, 200);
      }
    }
    return null;
  }

  /**
   * Extract date from text content
   * @param {string} text - Text to search
   * @returns {string|null} Extracted date
   */
  extractDateFromText(text) {
    const datePatterns = [
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?\b/i,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
    return null;
  }

  /**
   * Check if event passes geographic filtering
   * @param {Object} eventFields - Extracted event fields
   * @param {string} scope - Geographic scope
   * @returns {boolean} True if passes filter
   */
  passesGeographicFilter(eventFields, scope) {
    const address = (eventFields.address || '').toLowerCase();
    const venue = (eventFields.venue || '').toLowerCase();
    const locationText = `${address} ${venue}`;

    // Berkeley scope - must mention Berkeley
    if (scope === 'berkeley') {
      return locationText.includes('berkeley');
    }

    // East Bay scope - Berkeley + East Bay cities
    if (scope === 'eastbay') {
      const eastBayCities = ['berkeley', 'oakland', 'fremont', 'hayward', 'union city', 'livermore'];
      return eastBayCities.some(city => locationText.includes(city));
    }

    // Bay Area scope - broader geographic filter
    if (scope === 'bayarea') {
      return this.bayAreaCities.some(city => 
        locationText.includes(city.toLowerCase())
      );
    }

    return true; // Default to include if unknown scope
  }

  /**
   * Check if event passes date filtering
   * @param {string} dateStr - Date string from Google
   * @param {number} horizonDays - Days horizon for filtering
   * @returns {boolean} True if passes filter
   */
  passesDateFilter(dateStr, horizonDays) {
    if (!dateStr) return false;

    try {
      const eventDate = new Date(dateStr);
      const now = new Date();
      const horizonDate = new Date();
      horizonDate.setDate(now.getDate() + horizonDays);

      return eventDate >= now && eventDate <= horizonDate;
    } catch (error) {
      return false; // Invalid date format
    }
  }

  /**
   * Normalize date to ISO format
   * @param {string} dateStr - Raw date string
   * @returns {string|null} ISO date string
   */
  normalizeDate(dateStr) {
    if (!dateStr) return null;

    try {
      return new Date(dateStr).toISOString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate unique event ID
   * @param {Object} eventFields - Event fields
   * @returns {string} Unique ID
   */
  generateEventId(eventFields) {
    const baseString = `${eventFields.title}_${eventFields.venue}_${eventFields.date}`;
    return Buffer.from(baseString).toString('base64').substring(0, 12);
  }

  /**
   * Normalize title for deduplication
   * @param {string} title - Event title
   * @returns {string} Normalized title
   */
  normalizeTitle(title) {
    return title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clean and format event title
   * @param {string} title - Raw title
   * @returns {string} Cleaned title
   */
  cleanTitle(title) {
    return title.replace(/\s+/g, ' ').trim();
  }

  /**
   * Map topic profile to standardized category
   * @param {string} topicProfile - Topic profile
   * @returns {string} Standardized category
   */
  mapCategoryName(topicProfile) {
    const categoryMap = {
      'arts-culture': 'arts-culture',
      'talks-ai': 'technology',
      'talks-childdev': 'education',
      'talks-general': 'education',
      'technology': 'technology',
      'finance': 'business',
      'business': 'business',
      'music': 'music',
      'theatre': 'arts-culture',
      'art': 'arts-culture',
      'comedy': 'entertainment',
      'fitness': 'health',
      'food': 'food',
      'nightlife': 'nightlife',
      'networking': 'business'
    };
    
    return categoryMap[topicProfile] || 'general';
  }

  /**
   * Generate relevant tags for topic
   * @param {string} topicProfile - Topic profile
   * @returns {Array} Array of relevant tags
   */
  generateTags(topicProfile) {
    const tagMap = {
      'arts-culture': ['arts', 'culture', 'exhibition'],
      'talks-ai': ['AI', 'technology', 'machine learning'],
      'talks-childdev': ['parenting', 'education', 'children'],
      'talks-general': ['academic', 'lecture', 'education'],
      'technology': ['tech', 'innovation', 'startup'],
      'finance': ['finance', 'investment', 'money'],
      'business': ['business', 'networking', 'professional'],
      'music': ['music', 'concert', 'live'],
      'theatre': ['theater', 'performance', 'drama'],
      'art': ['art', 'gallery', 'visual'],
      'comedy': ['comedy', 'humor', 'entertainment'],
      'fitness': ['fitness', 'health', 'wellness'],
      'food': ['food', 'culinary', 'dining'],
      'nightlife': ['nightlife', 'party', 'social'],
      'networking': ['networking', 'professional', 'business']
    };
    
    return tagMap[topicProfile] || ['general'];
  }

  /**
   * Generate cache key from parameters
   * @param {Object} params - Search parameters
   * @returns {string} Cache key
   */
  generateCacheKey(params) {
    const keyData = [
      params.category,
      params.location, 
      params.limit,
      params.scope,
      params.topicProfile,
      params.precision,
      params.horizonDays,
      params.mode
    ].join('|');
    
    return Buffer.from(keyData).toString('base64');
  }

  /**
   * Get cached result
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached result or null
   */
  getFromCache(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cache entry
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Data to cache
   */
  setCache(cacheKey, data) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Filter search results to identify event-like content
   * @param {Array} results - Search results to filter
   * @returns {Array} Event-like results
   */
  filterEventResults(results) {
    const eventKeywords = [
      'event', 'concert', 'show', 'performance', 'exhibition', 'festival',
      'conference', 'meetup', 'workshop', 'seminar', 'lecture', 'talk',
      'opening', 'screening', 'party', 'celebration', 'launch', 'tour',
      'tickets', 'admission', 'rsvp', 'register', 'book now', 'buy tickets'
    ];
    
    const datePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // MM/DD/YYYY
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i, // Month DD
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, // Day of week
      /\b(today|tomorrow|tonight|weekend)\b/i // Time references
    ];

    return results.filter(result => {
      const title = (result.title || '').toLowerCase();
      const snippet = (result.snippet || '').toLowerCase();
      const text = `${title} ${snippet}`;

      // Check for event keywords
      const hasEventKeywords = eventKeywords.some(keyword => text.includes(keyword));
      
      // Check for date patterns
      const hasDatePattern = datePatterns.some(pattern => pattern.test(text));

      // Must have either event keywords or date patterns
      return hasEventKeywords || hasDatePattern;
    });
  }

  /**
   * Make HTTP request to Serper API
   * @param {string} endpoint - API endpoint
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} API response
   */
  async makeRequest(endpoint, payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // baseUrl already includes /search, so just append endpoint
      const url = endpoint ? `${this.baseUrl}${endpoint}` : this.baseUrl;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Get cost statistics for this client instance
   * @returns {Object} Cost statistics
   */
  getCostStats() {
    return {
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageCostPerRequest: this.requestCount > 0 ? this.totalCost / this.requestCount : 0
    };
  }

  /**
   * Get health status of Serper API
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    const startTime = Date.now();
    try {
      const response = await this.searchEvents({ 
        category: 'test', 
        location: 'test', 
        limit: 1,
        topicProfile: 'arts-culture'
      });
      const processingTime = Date.now() - startTime;

      if (response.success) {
        return { 
          status: 'healthy', 
          latency: processingTime, 
          message: 'Serper high-volume API responding.',
          cost: response.cost || 0
        };
      } else {
        return { 
          status: 'unhealthy', 
          latency: processingTime, 
          message: response.error 
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
}

export default HighVolumeSerperClient;