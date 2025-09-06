/**
 * =============================================================================
 * SCRIPT NAME: PredictHQClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Client for PredictHQ API - premium event intelligence platform
 * Provides structured event data with attendance predictions and local rankings
 * 
 * FEATURES:
 * - Event search with location and category filtering
 * - Attendance predictions and event rankings
 * - Structured event metadata with confidence scores
 * - Location-based search using coordinates or place queries
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-07-31
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('PredictHQClient');

export class PredictHQClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('PredictHQ API key is required');
    }
    
    this.baseUrl = 'https://api.predicthq.com/v1';
    this.apiKey = apiKey;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    };
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Search for events using PredictHQ API
   * @param {Object} options - Search options
   * @param {string} options.category - Event category
   * @param {string} options.location - Location string
   * @param {string} options.dateRange - Date range filter
   * @param {number} options.limit - Maximum number of results
   * @returns {Promise<Object>} API response with events
   */
  async searchEvents({ 
    category = 'performing-arts', 
    location = 'San Francisco, CA', 
    dateRange = 'next 30 days',
    limit = 20 
  }) {
    const startTime = Date.now();
    
    // Map category to PredictHQ format
    const phqCategory = this.mapCategoryToPredictHQ(category);
    
    // Build location parameters
    const locationParams = this.buildLocationParams(location);
    
    // Build date parameters
    const dateParams = this.buildDateParams(dateRange);
    
    const url = `${this.baseUrl}/events`;
    const params = {
      category: phqCategory,
      ...locationParams,
      ...dateParams,
      limit: Math.min(limit, 100), // PredictHQ max limit is 100
      sort: 'start'
    };

    logger.info('Searching PredictHQ events', {
      category: phqCategory,
      location,
      dateRange,
      limit,
      params
    });

    try {
      const response = await fetch(url + '?' + new URLSearchParams(params), {
        method: 'GET',
        headers: this.headers,
        timeout: this.timeout
      });

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      logger.info('PredictHQ API response received', {
        eventsFound: data.results?.length || 0,
        totalAvailable: data.count || 0,
        processingTime: `${processingTime}ms`
      });

      return {
        success: true,
        events: data.results || [],
        count: data.results?.length || 0,
        totalAvailable: data.count || 0,
        processingTime,
        source: 'predicthq'
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('PredictHQ API error', {
        error: error.message,
        processingTime: `${processingTime}ms`,
        category: phqCategory,
        location
      });

      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        totalAvailable: 0,
        processingTime,
        source: 'predicthq'
      };
    }
  }

  /**
   * Map our category format to PredictHQ categories
   * @param {string} category - Our category format
   * @returns {string} PredictHQ category
   */
  mapCategoryToPredictHQ(category) {
    const categoryMapping = {
      'theatre': 'performing-arts',
      'theater': 'performing-arts',
      'music': 'concerts',
      'concerts': 'concerts',
      'comedy': 'performing-arts',
      'sports': 'sports',
      'food': 'festivals',
      'art': 'expos',
      'museums': 'expos',
      'lectures': 'conferences',
      'conferences': 'conferences',
      'festivals': 'festivals',
      // New categories
      'psychology': 'conferences',
      'artificial-intelligence': 'conferences'
    };
    
    return categoryMapping[category.toLowerCase()] || 'performing-arts';
  }

  /**
   * Build location parameters for PredictHQ API
   * @param {string} location - Location string
   * @returns {Object} Location parameters
   */
  buildLocationParams(location) {
    // Use coordinates for San Francisco (fixes the "invalid airport code" issue)
    if (location.toLowerCase().includes('san francisco')) {
      return {
        'location.within': '10km@37.7749,-122.4194' // SF coordinates with 10km radius
      };
    }
    
    // For other locations, try different approaches
    const locationQuery = location.includes(',') ? location.split(',')[0].trim() : location;
    
    // Try place.scope for well-known locations, fallback to general query
    if (this.isWellKnownLocation(locationQuery)) {
      return {
        'place.scope': locationQuery
      };
    } else {
      return {
        'q': locationQuery
      };
    }
  }

  /**
   * Check if location is well-known to PredictHQ
   * @param {string} location - Location string
   * @returns {boolean} Is well-known location
   */
  isWellKnownLocation(location) {
    const wellKnownLocations = [
      'new york', 'los angeles', 'chicago', 'houston', 'phoenix',
      'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
      'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte',
      'seattle', 'denver', 'boston', 'detroit', 'nashville',
      'london', 'paris', 'tokyo', 'sydney', 'toronto'
    ];
    
    return wellKnownLocations.some(known => 
      location.toLowerCase().includes(known.toLowerCase())
    );
  }

  /**
   * Build date parameters for PredictHQ API
   * @param {string} dateRange - Date range string
   * @returns {Object} Date parameters
   */
  buildDateParams(dateRange) {
    const now = new Date();
    
    if (dateRange.includes('today')) {
      const today = now.toISOString().split('T')[0];
      return {
        'start.gte': today,
        'start.lt': new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
    }
    
    if (dateRange.includes('this week')) {
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        'start.gte': now.toISOString().split('T')[0],
        'start.lt': weekEnd.toISOString().split('T')[0]
      };
    }
    
    if (dateRange.includes('next 7 days')) {
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        'start.gte': now.toISOString().split('T')[0],
        'start.lt': weekEnd.toISOString().split('T')[0]
      };
    }
    
    if (dateRange.includes('next 30 days')) {
      const monthEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return {
        'start.gte': now.toISOString().split('T')[0],
        'start.lt': monthEnd.toISOString().split('T')[0]
      };
    }
    
    // Default: next 30 days
    const monthEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      'start.gte': now.toISOString().split('T')[0],
      'start.lt': monthEnd.toISOString().split('T')[0]
    };
  }

  /**
   * Transform PredictHQ event data to our standard format
   * @param {Object} phqEvent - Raw event from PredictHQ
   * @param {string} category - Event category
   * @returns {Object} Normalized event object
   */
  transformEvent(phqEvent, category = 'general') {
    try {
      const venue = phqEvent.geo?.address || {};
      const location = [
        venue.locality,
        venue.region,
        venue.country
      ].filter(Boolean).join(', ');

      return {
        id: `predicthq_${phqEvent.id}`,
        title: phqEvent.title || 'Untitled Event',
        description: phqEvent.description || '',
        category: category,
        venue: venue.venue_name || venue.locality || 'TBD',
        location: location || 'Location TBD',
        address: venue.formatted_address || '',
        city: venue.locality || '',
        state: venue.region || '',
        country: venue.country || '',
        
        // Date handling
        startDate: phqEvent.start,
        endDate: phqEvent.end || phqEvent.start,
        dateHuman: this.formatDateHuman(phqEvent.start),
        
        // PredictHQ specific data
        attendance: phqEvent.phq_attendance || null,
        rank: phqEvent.rank || null,
        localRank: phqEvent.local_rank || null,
        
        // Pricing (PredictHQ doesn't provide pricing)
        priceRange: {
          min: null,
          max: null
        },
        
        // External links
        externalUrl: phqEvent.entities?.find(e => e.type === 'venue')?.formatted_address || null,
        ticketLinks: [],
        infoLinks: [],
        
        // Venue details
        venueInfo: {
          name: venue.venue_name,
          address: venue.formatted_address,
          coordinates: {
            lat: phqEvent.geo?.geometry?.coordinates?.[1],
            lng: phqEvent.geo?.geometry?.coordinates?.[0]
          }
        },
        
        // Metadata
        source: 'predicthq_api',
        confidence: this.calculateConfidence(phqEvent),
        
        // Computed fields
        isToday: this.isToday(phqEvent.start),
        isThisWeek: this.isThisWeek(phqEvent.start),
        daysFromNow: this.getDaysFromNow(phqEvent.start)
      };
    } catch (error) {
      logger.error('Error transforming PredictHQ event', {
        error: error.message,
        eventId: phqEvent.id,
        eventTitle: phqEvent.title
      });
      
      return null;
    }
  }

  /**
   * Calculate confidence score based on PredictHQ data quality
   * @param {Object} phqEvent - PredictHQ event
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(phqEvent) {
    let confidence = 0.8; // Base confidence for structured API data
    
    // Boost confidence for events with attendance predictions
    if (phqEvent.phq_attendance && phqEvent.phq_attendance > 0) {
      confidence += 0.1;
    }
    
    // Boost confidence for events with high local rank
    if (phqEvent.local_rank && phqEvent.local_rank >= 50) {
      confidence += 0.05;
    }
    
    // Boost confidence for events with venue information
    if (phqEvent.geo?.address?.venue_name) {
      confidence += 0.05;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Format date in human-readable format
   * @param {string} dateString - ISO date string
   * @returns {string} Human-readable date
   */
  formatDateHuman(dateString) {
    if (!dateString) return 'Date TBD';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } catch (error) {
      return dateString;
    }
  }

  /**
   * Check if date is today
   * @param {string} dateString - ISO date string
   * @returns {boolean}
   */
  isToday(dateString) {
    if (!dateString) return false;
    const eventDate = new Date(dateString);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  }

  /**
   * Check if date is this week
   * @param {string} dateString - ISO date string
   * @returns {boolean}
   */
  isThisWeek(dateString) {
    if (!dateString) return false;
    const eventDate = new Date(dateString);
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return eventDate >= today && eventDate <= weekFromNow;
  }

  /**
   * Get days from now
   * @param {string} dateString - ISO date string
   * @returns {number}
   */
  getDaysFromNow(dateString) {
    if (!dateString) return -1;
    const eventDate = new Date(dateString);
    const today = new Date();
    const diffTime = eventDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get health status of the PredictHQ API
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Test with a simple query
      const result = await this.searchEvents({
        category: 'performing-arts',
        location: 'San Francisco, CA',
        limit: 1
      });

      return {
        status: result.success ? 'healthy' : 'unhealthy',
        latency: result.processingTime,
        message: result.success ? 'PredictHQ API responding normally' : result.error,
        totalAvailable: result.totalAvailable
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: null,
        message: `PredictHQ API health check failed: ${error.message}`
      };
    }
  }
}

export default PredictHQClient;
