/**
 * =============================================================================
 * SCRIPT NAME: ApyfluxClient.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Client for Apyflux API - premium event discovery service
 * Provides comprehensive event data with venue details and ticket links
 * 
 * FEATURES:
 * - Event search with location and date filtering
 * - Rich venue information with coordinates and ratings
 * - Multiple ticket source links
 * - Detailed event metadata and descriptions
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-30
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('ApyfluxClient');

export class ApyfluxClient {
  constructor() {
    this.baseUrl = 'https://gateway.apyflux.com/v1';
    this.headers = {
      'x-app-id': '928a8cb5-a978-455b-a65e-8b23f2f1ff82',
      'x-client-id': 'S0OCG4fOhxUy6WNFwgBiVi7yV8K2',
      'x-api-key': 'Zt53NYzQr5woo9X+d2G0wLABitCxebOTOTUCBvgCWYU='
    };
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Search for events using Apyflux API
   * @param {Object} options - Search options
   * @param {string} options.query - Search query (e.g., "Concerts in San-Francisco")
   * @param {string} options.location - Location filter
   * @param {string} options.category - Event category filter
   * @param {string} options.dateRange - Date range filter
   * @param {number} options.limit - Maximum number of results
   * @returns {Promise<Object>} API response with events
   */
  async searchEvents({ 
    query, 
    location = 'San Francisco', 
    category = 'concerts', 
    dateRange = 'any',
    limit = 20 
  }) {
    const startTime = Date.now();
    
    // Build search query based on category and location
    const searchQuery = this.buildSearchQuery(category, location);
    
    // If limit > 10, we need to make multiple requests since Apyflux returns max 10 per request
    if (limit > 10) {
      return this.searchEventsWithPagination({ query, location, category, dateRange, limit });
    }

    const url = `${this.baseUrl}/search-events?` + new URLSearchParams({
      query: searchQuery,
      date: this.mapDateRange(dateRange),
      is_virtual: 'false',
      start: '0'
    });

    logger.info('Searching Apyflux events', {
      query: searchQuery,
      location,
      category,
      dateRange,
      url: url.replace(this.headers['x-api-key'], '[API_KEY]')
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        timeout: this.timeout
      });

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      logger.info('Apyflux API response received', {
        status: data.status,
        requestId: data.request_id,
        eventsFound: data.data?.length || 0,
        processingTime: `${processingTime}ms`
      });

      if (data.status !== 'OK') {
        throw new Error(`API Error: ${data.status}`);
      }

      // Limit results if requested
      if (limit && data.data && data.data.length > limit) {
        data.data = data.data.slice(0, limit);
      }

      return {
        success: true,
        events: data.data || [],
        count: data.data?.length || 0,
        requestId: data.request_id,
        processingTime,
        source: 'apyflux'
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Apyflux API error', {
        error: error.message,
        processingTime: `${processingTime}ms`,
        query: searchQuery
      });

      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        processingTime,
        source: 'apyflux'
      };
    }
  }

  /**
   * Search events with pagination to get more than 10 results
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Combined results from multiple pages
   */
  async searchEventsWithPagination({ query, location, category, dateRange, limit }) {
    const startTime = Date.now();
    const searchQuery = this.buildSearchQuery(category, location);
    const maxPages = Math.ceil(limit / 10); // Apyflux returns max 10 per page
    const allEvents = [];
    let totalProcessingTime = 0;

    logger.info('Starting paginated Apyflux search', {
      query: searchQuery,
      location,
      category,
      requestedLimit: limit,
      estimatedPages: maxPages
    });

    try {
      for (let page = 0; page < maxPages; page++) {
        const start = page * 10;
        const url = `${this.baseUrl}/search-events?` + new URLSearchParams({
          query: searchQuery,
          date: this.mapDateRange(dateRange),
          is_virtual: 'false',
          start: start.toString()
        });

        const response = await fetch(url, {
          method: 'GET',
          headers: this.headers,
          timeout: this.timeout
        });

        if (!response.ok) {
          logger.warn(`Page ${page + 1} failed`, { status: response.status, start });
          break;
        }

        const data = await response.json();
        
        if (data.status !== 'OK' || !data.data || data.data.length === 0) {
          logger.info(`No more results at page ${page + 1}`, { start });
          break;
        }

        allEvents.push(...data.data);
        
        logger.info(`Page ${page + 1} completed`, {
          eventsFound: data.data.length,
          totalSoFar: allEvents.length
        });

        // If we got fewer than 10 results, we've reached the end
        if (data.data.length < 10) {
          break;
        }

        // Don't exceed requested limit
        if (allEvents.length >= limit) {
          break;
        }

        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const processingTime = Date.now() - startTime;

      // Limit results to requested amount
      const finalEvents = allEvents.slice(0, limit);

      logger.info('Paginated search completed', {
        totalEvents: finalEvents.length,
        pagesRequested: Math.min(maxPages, Math.ceil(allEvents.length / 10) + 1),
        processingTime: `${processingTime}ms`
      });

      return {
        success: true,
        events: finalEvents,
        count: finalEvents.length,
        totalFound: allEvents.length,
        processingTime,
        source: 'apyflux'
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Paginated search failed', {
        error: error.message,
        eventsCollected: allEvents.length,
        processingTime: `${processingTime}ms`
      });

      return {
        success: false,
        error: error.message,
        events: allEvents, // Return partial results
        count: allEvents.length,
        processingTime,
        source: 'apyflux'
      };
    }
  }

  /**
   * Build search query based on category and location
   * @param {string} category - Event category
   * @param {string} location - Location
   * @returns {string} Formatted search query
   */
  buildSearchQuery(category, location) {
    const categoryQueries = {
      'theatre': `Theatre shows in ${location}`,
      'theater': `Theatre shows in ${location}`,
      'music': `Concerts in ${location}`,
      'concerts': `Concerts in ${location}`,
      'comedy': `Comedy shows in ${location}`,
      'lectures': `Lectures and talks in ${location}`,
      'talks': `Lectures and talks in ${location}`,
      'art': `Art events in ${location}`,
      'food': `Food events in ${location}`,
      'sports': `Sports events in ${location}`
    };

    return categoryQueries[category.toLowerCase()] || `Events in ${location}`;
  }

  /**
   * Map our date range format to Apyflux format
   * @param {string} dateRange - Our date range format
   * @returns {string} Apyflux date format
   */
  mapDateRange(dateRange) {
    const mappings = {
      'today': 'today',
      'tomorrow': 'tomorrow',
      'this weekend': 'this-week',
      'next week': 'next-week',
      'next month': 'next-month',
      'next 30 days': 'any',
      'default': 'any'
    };

    return mappings[dateRange.toLowerCase()] || mappings.default;
  }

  /**
   * Transform Apyflux event data to our standard format
   * @param {Object} apyfluxEvent - Raw event from Apyflux
   * @param {string} category - Event category
   * @returns {Object} Normalized event object
   */
  transformEvent(apyfluxEvent, category = 'general') {
    try {
      // Extract price information from ticket links if available
      const ticketLinks = apyfluxEvent.ticket_links || [];
      const hasTickets = ticketLinks.length > 0;
      
      // Determine if event is free (heuristic based on common free event indicators)
      const isFree = apyfluxEvent.description?.toLowerCase().includes('free') ||
                     apyfluxEvent.name?.toLowerCase().includes('free') ||
                     ticketLinks.some(link => link.source.toLowerCase().includes('free'));

      return {
        id: `apyflux_${apyfluxEvent.event_id}`,
        title: apyfluxEvent.name,
        description: apyfluxEvent.description || '',
        category: category,
        venue: apyfluxEvent.venue?.name || 'TBD',
        location: apyfluxEvent.venue?.full_address || apyfluxEvent.venue?.city || '',
        address: apyfluxEvent.venue?.full_address || '',
        city: apyfluxEvent.venue?.city || '',
        state: apyfluxEvent.venue?.state || '',
        
        // Date handling
        startDate: apyfluxEvent.start_time,
        endDate: apyfluxEvent.end_time || apyfluxEvent.start_time,
        dateHuman: apyfluxEvent.date_human_readable,
        
        // Pricing
        priceRange: {
          min: isFree ? 0 : null,
          max: isFree ? 0 : null
        },
        
        // External links
        externalUrl: apyfluxEvent.link,
        ticketLinks: ticketLinks,
        infoLinks: apyfluxEvent.info_links || [],
        
        // Venue details
        venueInfo: {
          name: apyfluxEvent.venue?.name,
          address: apyfluxEvent.venue?.full_address,
          phone: apyfluxEvent.venue?.phone_number,
          website: apyfluxEvent.venue?.website,
          rating: apyfluxEvent.venue?.rating,
          reviewCount: apyfluxEvent.venue?.review_count,
          coordinates: {
            lat: apyfluxEvent.venue?.latitude,
            lng: apyfluxEvent.venue?.longitude
          }
        },
        
        // Metadata
        source: 'apyflux_api',
        confidence: 0.95, // High confidence for structured API data
        thumbnail: apyfluxEvent.thumbnail,
        publisher: apyfluxEvent.publisher,
        language: apyfluxEvent.language || 'en',
        
        // Computed fields
        isToday: this.isToday(apyfluxEvent.start_time),
        isThisWeek: this.isThisWeek(apyfluxEvent.start_time),
        daysFromNow: this.getDaysFromNow(apyfluxEvent.start_time)
      };
    } catch (error) {
      logger.error('Error transforming Apyflux event', {
        error: error.message,
        eventId: apyfluxEvent.event_id,
        eventName: apyfluxEvent.name
      });
      
      return null;
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
   * Get health status of the Apyflux API
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Test with a simple query
      const result = await this.searchEvents({
        query: 'test',
        location: 'San Francisco',
        limit: 1
      });

      return {
        status: result.success ? 'healthy' : 'unhealthy',
        latency: result.processingTime,
        message: result.success ? 'Apyflux API responding normally' : result.error
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: null,
        message: `Apyflux API health check failed: ${error.message}`
      };
    }
  }
}

export default ApyfluxClient;