/**
 * =============================================================================
 * SCRIPT NAME: EnhancedExaClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Enhanced Exa client with comprehensive domain filtering, cost tracking,
 * and Bay Area event discovery. Ported from Python implementation with
 * performance optimizations for Node.js.
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
import { CostTracker, ExaCostCalculator } from '../utils/costTracking.js';

const logger = createLogger('EnhancedExaClient');

export class EnhancedExaClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.exaApiKey;
    this.baseUrl = 'https://api.exa.ai';
    this.headers = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'CurateMyWorld-Enhanced/2.0'
    };
    this.timeout = 15000; // Faster timeout for speed
    
    // Initialize managers
    this.whitelistManager = new WhitelistManager();
    this.blacklistManager = new BlacklistManager();
    this.costTracker = new CostTracker();
    
    // TTL Cache (3 hours)
    this.cache = new Map();
    this.cacheTimeout = 3 * 60 * 60 * 1000;

    // Cost tracking for statistics
    this.totalCost = 0;
    this.requestCount = 0;

    logger.info('Enhanced Exa client initialized with domain filtering and cost tracking');
  }

  /**
   * Search for events using enhanced Exa API with domain filtering
   * @param {Object} options - Search options
   * @returns {Promise<Object>} API response with events
   */
  async searchEvents({ 
    category, 
    location, 
    limit = 40,
    scope = 'bayarea',           // berkeley, eastbay, bayarea
    topicProfile = 'arts-culture', // Category-specific domain filtering
    precision = 'official',      // official, broad
    horizonDays = 14,           // For date filtering (UI side)
    publishedWindowDays = 45,   // Content freshness window
    mode = 'auto',              // fast, auto, keyword
    subpages = 1                // 0-2 subpages crawling
  }) {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = this.generateCacheKey({
      category, location, limit, scope, topicProfile, precision, 
      horizonDays, publishedWindowDays, mode, subpages
    });

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.info('Returning cached Exa results', { processingTime: '0ms (cached)' });
      return cached;
    }

    try {
      // Get domain whitelist patterns
      const includeDomains = await this.whitelistManager.getPatterns(
        topicProfile, scope, precision
      );

      if (!includeDomains.length) {
        logger.warn('No whitelist patterns found, using broad search');
      }

      // Build enhanced query with Bay Area focus
      const enhancedQuery = this.buildEnhancedQuery(category, location, topicProfile);

      // Calculate published date window
      const publishedSince = new Date();
      publishedSince.setDate(publishedSince.getDate() - publishedWindowDays);
      const startPublishedDate = publishedSince.toISOString().split('T')[0];

      // Search phase
      const searchPayload = {
        query: enhancedQuery,
        num_results: limit,
        type: mode === 'fast' ? 'keyword' : mode, // Map fast to keyword
        include_domains: includeDomains.slice(0, 100), // Exa limit
        user_location: 'us',
        start_published_date: startPublishedDate
      };

      logger.info('Executing Exa search', { 
        query: enhancedQuery, 
        mode, 
        domains: includeDomains.length,
        publishedSince: startPublishedDate
      });

      const searchResponse = await this.makeRequest('/search', searchPayload);
      const results = searchResponse.results || [];

      if (!results.length) {
        const cost = await this.costTracker.logExaCost({
          query: enhancedQuery,
          searchType: mode,
          numResults: 0
        });

        // Update local cost tracking
        this.totalCost += cost;
        this.requestCount++;

        const response = {
          success: true,
          events: [],
          count: 0,
          processingTime: Date.now() - startTime,
          source: 'exa_enhanced',
          cost,
          metadata: { domains: includeDomains.length, mode }
        };

        this.setCache(cacheKey, response);
        return response;
      }

      // Content retrieval phase with highlights
      const resultIds = results.map(r => r.id);
      const highlightsQuery = topicProfile.startsWith('talks') 
        ? 'date time venue speaker registration price host department'
        : 'date time venue price registration tickets';

      const contentPayload = {
        ids: resultIds,
        contents: {
          text: {
            max_characters: 6000,
            include_html_tags: true
          },
          highlights: {
            query: highlightsQuery,
            num_sentences: 5
          }
        },
        livecrawl: 'preferred',
        subpages
      };

      const contentResponse = await this.makeRequest('/contents', contentPayload);
      const contentResults = contentResponse.results || [];

      // Process and transform events
      const events = await this.processEvents(contentResults, {
        category,
        topicProfile,
        location
      });

      // Calculate and log costs
      const cost = await this.costTracker.logExaCost({
        query: enhancedQuery,
        searchType: mode,
        numResults: results.length,
        numPages: contentResults.length,
        hasLivecrawl: true
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
        source: 'exa_enhanced',
        cost,
        metadata: {
          domains: includeDomains.length,
          mode,
          rawResults: results.length,
          processedEvents: events.length
        }
      };

      this.setCache(cacheKey, response);
      
      logger.info(`Enhanced Exa search completed`, {
        query: enhancedQuery,
        rawResults: results.length,
        processedEvents: events.length,
        cost: `$${cost.toFixed(6)}`,
        processingTime: `${processingTime}ms`
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Enhanced Exa API error', { 
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
        source: 'exa_enhanced'
      };
    }
  }

  /**
   * Build enhanced query with Bay Area specificity
   * @param {string} category - Event category
   * @param {string} location - Location
   * @param {string} topicProfile - Topic profile for domain targeting
   * @returns {string} Enhanced query
   */
  buildEnhancedQuery(category, location, topicProfile) {
    const baseQuery = `${category} events ${location} 2025`;
    
    // Add topic-specific terms
    const topicEnhancements = {
      'arts-culture': 'tickets calendar performances exhibitions',
      'talks-ai': 'AI machine learning talks seminars conferences',
      'talks-childdev': 'child development early childhood education workshops',
      'talks-general': 'academic lectures university seminars',
      'technology': 'tech conferences meetups innovation startups',
      'finance': 'financial seminars investment workshops',
      'business': 'business networking entrepreneurship',
      'music': 'concerts live music performances',
      'theatre': 'theater plays musicals performances',
      'art': 'art exhibitions gallery openings',
      'food': 'food festivals culinary events tastings',
      'movies': 'film screenings movie festivals cinema'
    };

    const enhancement = topicEnhancements[topicProfile] || 'events';
    return `${baseQuery} ${enhancement}`;
  }

  /**
   * Process and transform raw Exa results into events
   * @param {Array} results - Raw Exa content results
   * @param {Object} context - Processing context
   * @returns {Array} Processed events
   */
  async processEvents(results, context) {
    const events = [];
    const seenKeys = new Set();

    for (const result of results) {
      try {
        // Skip blacklisted URLs
        if (await this.blacklistManager.isBlacklisted(result.url)) {
          continue;
        }

        // Extract event fields
        const eventFields = this.extractEventFields(result, context);
        
        // Skip if no meaningful data extracted
        if (!eventFields.title || eventFields.title === 'Untitled Event') {
          continue;
        }

        // Generate deduplication key
        const dedupeKey = this.generateDedupeKey(
          eventFields.title,
          eventFields.startDate,
          eventFields.venue
        );

        if (seenKeys.has(dedupeKey)) {
          continue;
        }
        seenKeys.add(dedupeKey);

        // Create event object
        const event = {
          id: `exa_${result.id || Math.random().toString(36).substr(2, 9)}`,
          title: eventFields.title,
          description: eventFields.description,
          category: this.mapCategoryName(context.topicProfile),
          tags: this.generateTags(context.topicProfile),
          venue: eventFields.venue,
          location: eventFields.location || context.location,
          startDate: eventFields.startDate,
          endDate: eventFields.endDate,
          eventUrl: result.url,
          ticketUrl: eventFields.ticketUrl || result.url,
          externalUrl: result.url,
          source: 'exa_enhanced',
          confidence: this.calculateConfidence(eventFields, result),
          price: eventFields.price,
          speaker: eventFields.speaker,
          hostOrg: eventFields.hostOrg,
          thumbnail: result.image || null,
          extractedOn: new Date().toISOString()
        };

        // Apply date filtering (skip obviously stale events)
        if (event.startDate) {
          const eventDate = new Date(event.startDate);
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(3, 0, 0, 0); // 3am cutoff
          
          if (eventDate < yesterday) {
            continue; // Skip stale events
          }
        }

        events.push(event);

      } catch (error) {
        logger.warn('Error processing Exa result', { 
          error: error.message,
          url: result.url
        });
      }
    }

    return events;
  }

  /**
   * Extract event fields from Exa result
   * @param {Object} result - Exa content result
   * @param {Object} context - Processing context
   * @returns {Object} Extracted fields
   */
  extractEventFields(result, context) {
    const title = result.title || 'Untitled Event';
    const text = result.text || '';
    const highlights = result.highlights || [];
    
    // Use highlights preferentially for dense information
    const content = highlights.length > 0 ? highlights.join(' ') : text;

    return {
      title: this.cleanTitle(title),
      description: this.extractDescription(text, highlights),
      venue: this.extractVenue(content),
      location: this.extractLocation(content),
      startDate: this.extractDate(content),
      endDate: this.extractDate(content), // Could be enhanced for end dates
      price: this.extractPrice(content),
      ticketUrl: this.extractTicketUrl(content),
      speaker: context.topicProfile.startsWith('talks') ? this.extractSpeaker(content) : null,
      hostOrg: context.topicProfile.startsWith('talks') ? this.extractHost(content) : null
    };
  }

  /**
   * Extract venue information from content
   * @param {string} content - Content to search
   * @returns {string|null} Extracted venue
   */
  extractVenue(content) {
    const venuePatterns = [
      /venue[:\s]+([^\n,.]+)/i,
      /location[:\s]+([^\n,.]+)/i,
      /at\s+([^\n,.]+(?:center|hall|hotel|building|room|auditorium|theater|conference|campus))/i,
      /held at\s+([^\n,.]+)/i,
      /\b([A-Z][a-zA-Z\s&'-]+(?:Center|Centre|Hall|Theatre|Theater|Auditorium|Stadium|Arena))\b/i
    ];

    for (const pattern of venuePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 100); // Limit length
      }
    }
    return null;
  }

  /**
   * Extract location information from content
   * @param {string} content - Content to search
   * @returns {string|null} Extracted location
   */
  extractLocation(content) {
    const locationPatterns = [
      /([A-Z][a-z]+,\s*[A-Z]{2})/,  // City, State
      /([A-Z][a-z]+\s+[A-Z][a-z]+,\s*[A-Z]{2})/,  // City Name, State
      /(San Francisco|Berkeley|Oakland|San Jose|Palo Alto|Mountain View)/i,
      /(\d+\s+[^\n,]+(?:street|st|avenue|ave|road|rd|blvd|boulevard)[^\n,]*)/i
    ];

    for (const pattern of locationPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 100);
      }
    }
    return null;
  }

  /**
   * Extract date information from content
   * @param {string} content - Content to search
   * @returns {string|null} Extracted date in ISO format
   */
  extractDate(content) {
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,        // YYYY-MM-DD
      /(\d{1,2}\/\d{1,2}\/\d{4})/,  // MM/DD/YYYY
      /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,  // Month DD, YYYY
      /(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/i     // DD Month YYYY
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        try {
          const date = new Date(match[1]);
          if (!isNaN(date.getTime()) && date.getFullYear() >= 2025) {
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
   * Extract price information from content
   * @param {string} content - Content to search
   * @returns {string|null} Extracted price
   */
  extractPrice(content) {
    const pricePatterns = [
      /\$\d+(?:\.\d{2})?(?:\s*-\s*\$\d+(?:\.\d{2})?)?/,
      /\bfree\b/i,
      /\bno charge\b/i,
      /ticket[s]?\s*:\s*\$?\d+/i
    ];

    for (const pattern of pricePatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
    return null;
  }

  /**
   * Extract ticket URL from content
   * @param {string} content - Content to search
   * @returns {string|null} Extracted ticket URL
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
   * Extract speaker information (for talks)
   * @param {string} content - Content to search
   * @returns {string|null} Extracted speaker
   */
  extractSpeaker(content) {
    const speakerPatterns = [
      /(?:speaker[s]?:|with|by)\s+([A-Z][\w\-\.\s,'&]+)/i,
      /presented by\s+([A-Z][\w\-\.\s,'&]+)/i
    ];

    for (const pattern of speakerPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 100);
      }
    }
    return null;
  }

  /**
   * Extract host organization (for talks)
   * @param {string} content - Content to search
   * @returns {string|null} Extracted host
   */
  extractHost(content) {
    const hostPatterns = [
      /(?:host(?:ed)?\s+by|department\s+of|center\s+for)\s+([A-Z][\w\-\.\s,'&]+)/i,
      /sponsored by\s+([A-Z][\w\-\.\s,'&]+)/i
    ];

    for (const pattern of hostPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 100);
      }
    }
    return null;
  }

  /**
   * Clean and normalize event title
   * @param {string} title - Raw title
   * @returns {string} Cleaned title
   */
  cleanTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200); // Reasonable length limit
  }

  /**
   * Extract description preferring highlights
   * @param {string} text - Full text
   * @param {Array} highlights - Highlights array
   * @returns {string} Description
   */
  extractDescription(text, highlights) {
    if (highlights && highlights.length > 0) {
      return highlights.join(' ').substring(0, 500);
    }
    return text.substring(0, 500);
  }

  /**
   * Map topic profile to category name
   * @param {string} topicProfile - Topic profile
   * @returns {string} Category name
   */
  mapCategoryName(topicProfile) {
    const mapping = {
      'arts-culture': 'arts-culture',
      'talks-general': 'talk',
      'talks-childdev': 'talk',
      'talks-ai': 'talk',
      'technology': 'technology',
      'finance': 'finance',
      'automotive': 'automotive',
      'data-analysis': 'data-analysis',
      'education': 'education',
      'business': 'business',
      'science': 'science',
      'music': 'music',
      'theatre': 'theatre',
      'art': 'art',
      'food': 'food',
      'movies': 'movies'
    };
    return mapping[topicProfile] || topicProfile;
  }

  /**
   * Generate tags for topic profile
   * @param {string} topicProfile - Topic profile
   * @returns {Array|null} Tags array
   */
  generateTags(topicProfile) {
    const tagMapping = {
      'talks-childdev': ['child-development'],
      'talks-ai': ['ai-ml'],
      'data-analysis': ['data-science', 'analytics'],
      'technology': ['tech', 'innovation']
    };
    return tagMapping[topicProfile] || null;
  }

  /**
   * Calculate confidence score for event
   * @param {Object} fields - Extracted fields
   * @param {Object} result - Raw result
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(fields, result) {
    let confidence = 0.7; // Base confidence for Enhanced Exa

    // Boost for complete data
    if (fields.venue) confidence += 0.1;
    if (fields.startDate) confidence += 0.1;
    if (fields.price) confidence += 0.05;
    if (fields.ticketUrl) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate deduplication key
   * @param {string} title - Event title
   * @param {string} startDate - Start date
   * @param {string} venue - Venue
   * @returns {string} Deduplication key
   */
  generateDedupeKey(title, startDate, venue) {
    const normalized = `${(title || '').toLowerCase()}|${startDate || ''}|${(venue || '').toLowerCase()}`;
    return Buffer.from(normalized).toString('base64').substring(0, 16);
  }

  /**
   * Generate cache key for request
   * @param {Object} params - Request parameters
   * @returns {string} Cache key
   */
  generateCacheKey(params) {
    return Buffer.from(JSON.stringify(params, Object.keys(params).sort())).toString('base64');
  }

  /**
   * Get item from cache
   * @param {string} key - Cache key
   * @returns {Object|null} Cached item or null
   */
  getFromCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  /**
   * Set item in cache
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Simple cache cleanup (remove old entries)
    if (this.cache.size > 100) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 20);
      oldestKeys.forEach(k => this.cache.delete(k));
    }
  }

  /**
   * Make HTTP request to Exa API
   * @param {string} endpoint - API endpoint
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
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
   * Get health status of Enhanced Exa API
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
          message: 'Enhanced Exa API responding.',
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

export default EnhancedExaClient;