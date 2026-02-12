/**
 * =============================================================================
 * SCRIPT NAME: TicketmasterClient.js
 * =============================================================================
 * 
 * INPUT FILES:
 * - None (fetches from Ticketmaster Discovery API)
 * 
 * OUTPUT FILES:
 * - Returns structured event data in standardized format
 * 
 * DESCRIPTION:
 * Client for the Ticketmaster Discovery API, providing access to live events,
 * concerts, sports, and entertainment across major venues.
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-08-24
 * AUTHOR: Cascade
 * =============================================================================
 */

import config from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { getTicketmasterClassification, isTicketmasterSupported } from '../utils/categoryMapping.js';

const logger = createLogger('TicketmasterClient');
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseTicketmasterLocalDateTime(localDate, localTime) {
  if (!localDate || typeof localDate !== 'string') return null;

  const dateMatch = localDate.match(DATE_ONLY_RE);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  // Build the date in local time to avoid UTC date-only parsing shifts.
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (localTime && typeof localTime === 'string') {
    const [hoursRaw, minutesRaw = '0', secondsRaw = '0'] = localTime.split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    const seconds = Number(secondsRaw);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
      date.setHours(hours, minutes, seconds, 0);
    }
  } else {
    // No time provided: keep as all-day-ish event on the intended day.
    date.setHours(12, 0, 0, 0);
  }

  return isNaN(date.getTime()) ? null : date;
}

export class TicketmasterClient {
  constructor() {
    this.consumerKey = config.ticketmasterConsumerKey;
    this.consumerSecret = config.ticketmasterConsumerSecret;
    this.baseUrl = 'https://app.ticketmaster.com/discovery/v2';
    this.timeout = 15000; // 15 seconds
  }

  /**
   * Search for events using the Ticketmaster Discovery API.
   * @param {Object} options - Search options.
   * @returns {Promise<Object>} API response with events.
   */
  async searchEvents({ category, location, limit = 10 }) {
    const startTime = Date.now();
    
    if (!this.consumerKey) {
      const processingTime = Date.now() - startTime;
      logger.error('Ticketmaster consumer key not configured');
      return {
        success: false,
        error: 'Ticketmaster consumer key not configured',
        events: [],
        count: 0,
        processingTime,
        source: 'ticketmaster'
      };
    }

    // Convert location to coordinates (simplified - in production would use geocoding)
    const coordinates = this.getCoordinatesForLocation(location);
    
    logger.info('Searching Ticketmaster for events', { category, location, limit });

    try {
      const url = new URL(`${this.baseUrl}/events.json`);
      const params = new URLSearchParams({
        'apikey': this.consumerKey,
        'latlong': `${coordinates.lat},${coordinates.lng}`,
        'radius': '50',
        'unit': 'miles',
        'size': Math.min(200, limit).toString(),
        'sort': 'date,asc'
      });

      // Add category filters if specified
      if (category && category !== 'all') {
        // Use unified category mapping
        const classification = getTicketmasterClassification(category);
        if (classification) {
          if (classification.segmentId) {
            params.set('segmentId', classification.segmentId);
          }
          if (classification.genreId) {
            params.set('genreId', classification.genreId);
          }
        } else {
          // Ticketmaster doesn't support this category - return empty to avoid showing same events for all unmapped categories
          const processingTime = Date.now() - startTime;
          logger.info(`Ticketmaster has no classification for category: ${category}, returning empty`, { category, processingTime });
          return {
            success: true,
            events: [],
            count: 0,
            processingTime,
            source: 'ticketmaster',
            unsupportedCategory: true
          };
        }
      }

      url.search = params.toString();

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CurateMyWorld/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const events = data._embedded?.events || [];
      const transformedEvents = events.map(event => this.transformEvent(event, category)).filter(Boolean);

      logger.info(`Ticketmaster search successful, found ${transformedEvents.length} events.`, { processingTime: `${processingTime}ms` });

      return {
        success: true,
        events: transformedEvents,
        count: transformedEvents.length,
        processingTime,
        source: 'ticketmaster'
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Ticketmaster API error', { error: error.message, category, location, processingTime: `${processingTime}ms` });
      return {
        success: false,
        error: error.message,
        events: [],
        count: 0,
        processingTime,
        source: 'ticketmaster'
      };
    }
  }

  /**
   * Transform a Ticketmaster event into our standard event format.
   * @param {Object} ticketmasterEvent - A single event from the Ticketmaster API.
   * @param {string} category - The event category.
   * @returns {Object|null} A normalized event object or null if invalid.
   */
  transformEvent(ticketmasterEvent, category) {
    try {
      if (!ticketmasterEvent.name) return null;

      // Parse event date and time
      const localDate = ticketmasterEvent.dates?.start?.localDate;
      let eventDate;
      let hasValidDate = false;
      
      if (localDate) {
        const parsedLocalDate = parseTicketmasterLocalDateTime(localDate, ticketmasterEvent.dates?.start?.localTime);
        if (parsedLocalDate) {
          eventDate = parsedLocalDate;
          hasValidDate = true;
        }
        
        // Filter out past events (only if we have a valid date)
        if (hasValidDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (eventDate < today) {
            logger.debug('Skipping past Ticketmaster event', {
              title: ticketmasterEvent.name?.substring(0, 50),
              date: localDate
            });
            return null;
          }
        }
      } else {
        // No date - default to today (user preference)
        eventDate = new Date();
      }

      // Extract venue information
      const venue = ticketmasterEvent._embedded?.venues?.[0];
      const venueName = venue?.name || 'TBD';
      const venueAddress = venue?.address?.line1 || '';
      const city = venue?.city?.name || 'San Francisco';
      const state = venue?.state?.stateCode || 'CA';
      const location = venueAddress ? `${venueAddress}, ${city}, ${state}` : `${city}, ${state}`;

      // Extract price information
      const priceRange = ticketmasterEvent.priceRanges?.[0];
      const priceMin = priceRange?.min || 0;
      const priceMax = priceRange?.max || 100;
      const priceDisplay = priceMin > 0 ? `$${priceMin}${priceMax > priceMin ? ` - $${priceMax}` : ''}` : 'See Event Page';

      return {
        id: `ticketmaster_${ticketmasterEvent.id}`,
        title: ticketmasterEvent.name,
        description: ticketmasterEvent.info || ticketmasterEvent.pleaseNote || ticketmasterEvent.name,
        category: this.getCategoryFromClassification(ticketmasterEvent.classifications?.[0]) || category,
        venue: venueName,
        location: location,
        startDate: eventDate.toISOString(),
        endDate: new Date(eventDate.getTime() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours later
        eventUrl: ticketmasterEvent.url,
        ticketUrl: ticketmasterEvent.url,
        externalUrl: ticketmasterEvent.url, // Add externalUrl field for frontend compatibility
        source: 'ticketmaster',
        confidence: this.calculateQualityScore(ticketmasterEvent) / 10,
        dateConfidence: hasValidDate ? 'high' : 'none', // Ticketmaster dates are authoritative when present
        aiReasoning: `Ticketmaster official event: ${ticketmasterEvent.name}`,
        priceRange: priceDisplay,
        imageUrl: ticketmasterEvent.images?.[0]?.url || null,
        tags: [
          ticketmasterEvent.classifications?.[0]?.genre?.name,
          ticketmasterEvent.classifications?.[0]?.subGenre?.name
        ].filter(Boolean)
      };
    } catch (error) {
      logger.error('Error transforming Ticketmaster event', { error: error.message, eventId: ticketmasterEvent.id });
      return null;
    }
  }

  /**
   * Get coordinates for a location (simplified mapping).
   * @param {string} location - Location string.
   * @returns {Object} Coordinates object with lat/lng.
   */
  getCoordinatesForLocation(location) {
    const locationMap = {
      'san francisco': { lat: 37.7749, lng: -122.4194 },
      'san francisco, ca': { lat: 37.7749, lng: -122.4194 },
      'oakland': { lat: 37.8044, lng: -122.2712 },
      'oakland, ca': { lat: 37.8044, lng: -122.2712 },
      'berkeley': { lat: 37.8715, lng: -122.2730 },
      'berkeley, ca': { lat: 37.8715, lng: -122.2730 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'new york, ny': { lat: 40.7128, lng: -74.0060 },
      'los angeles': { lat: 34.0522, lng: -118.2437 },
      'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
      'chicago': { lat: 41.8781, lng: -87.6298 },
      'chicago, il': { lat: 41.8781, lng: -87.6298 }
    };

    const key = location.toLowerCase();
    return locationMap[key] || { lat: 37.7749, lng: -122.4194 }; // Default to SF
  }

  /**
   * Get Ticketmaster segment ID for a category.
   * @param {string} category - Event category.
   * @returns {string|null} Segment ID or null.
   */
  /**
   * Get Ticketmaster classification (segment + optional genre) for a category.
   * Some categories map to segments (Music, Film), others need genre filtering (Comedy).
   * @param {string} category - Our category name
   * @returns {Object|null} { segmentId, genreId } or null if unsupported
   */
  getCategoryClassification(category) {
    // Ticketmaster Segments:
    // - Music: KZFzniwnSyZfZ7v7nJ
    // - Arts & Theatre: KZFzniwnSyZfZ7v7na (includes Comedy, Theatre genres)
    // - Sports: KZFzniwnSyZfZ7v7nE
    // - Film: KZFzniwnSyZfZ7v7nn
    // - Miscellaneous: KZFzniwnSyZfZ7v7n1 (includes Family, Food & Drink)
    
    // Genre IDs (under Arts & Theatre segment):
    // - Comedy: KnvZfZ7vAe1
    // - Theatre: KnvZfZ7v7l1
    
    // Genre IDs (under Miscellaneous segment):
    // - Family: KnvZfZ7vA1E
    // - Lecture/Seminar: KnvZfZ7vAeA
    
    const categoryMapping = {
      // Segment-level categories
      'music': { segmentId: 'KZFzniwnSyZfZ7v7nJ' },
      'sports': { segmentId: 'KZFzniwnSyZfZ7v7nE' },
      'film': { segmentId: 'KZFzniwnSyZfZ7v7nn' },
      'movies': { segmentId: 'KZFzniwnSyZfZ7v7nn' },
      
      // Arts & Theatre segment with optional genre filtering
      'arts': { segmentId: 'KZFzniwnSyZfZ7v7na' },
      'art': { segmentId: 'KZFzniwnSyZfZ7v7na' },
      'theatre': { segmentId: 'KZFzniwnSyZfZ7v7na', genreId: 'KnvZfZ7v7l1' },
      'theater': { segmentId: 'KZFzniwnSyZfZ7v7na', genreId: 'KnvZfZ7v7l1' },
      
      // Comedy is a genre under Arts & Theatre
      'comedy': { segmentId: 'KZFzniwnSyZfZ7v7na', genreId: 'KnvZfZ7vAe1' },
      'standup': { segmentId: 'KZFzniwnSyZfZ7v7na', genreId: 'KnvZfZ7vAe1' },
      
      // Family/Kids is under Miscellaneous segment
      'family': { segmentId: 'KZFzniwnSyZfZ7v7n1', genreId: 'KnvZfZ7vA1E' },
      'kids': { segmentId: 'KZFzniwnSyZfZ7v7n1', genreId: 'KnvZfZ7vA1E' },
      
      // Lectures are under Miscellaneous segment
      'lectures': { segmentId: 'KZFzniwnSyZfZ7v7n1', genreId: 'KnvZfZ7vAeA' }
    };

    return categoryMapping[category.toLowerCase()] || null;
  }

  // Legacy method for backward compatibility
  getCategorySegmentId(category) {
    const classification = this.getCategoryClassification(category);
    return classification?.segmentId || null;
  }

  /**
   * Convert Ticketmaster segment name to our category format.
   * @param {string} segmentName - Ticketmaster segment name.
   * @returns {string} Our category name.
   */
  getCategoryFromSegment(segmentName) {
    const mapping = {
      'Music': 'music',
      'Arts & Theatre': 'arts',
      'Sports': 'sports',
      'Film': 'film',
      'Miscellaneous': 'general'
    };

    return mapping[segmentName] || 'general';
  }

  /**
   * Convert Ticketmaster classification (segment + genre) to our category.
   * Uses genre to distinguish comedy from theatre within "Arts & Theatre".
   * @param {Object} classification - Ticketmaster classification object.
   * @returns {string} Our category name.
   */
  getCategoryFromClassification(classification) {
    if (!classification) return 'general';

    const segment = classification.segment?.name || '';
    const genre = (classification.genre?.name || '').toLowerCase();
    const subGenre = (classification.subGenre?.name || '').toLowerCase();

    // Music segment
    if (segment === 'Music') return 'music';

    // Film segment
    if (segment === 'Film') return 'movies';

    // Sports segment
    if (segment === 'Sports') return 'sports';

    // Arts & Theatre — use genre to distinguish
    if (segment === 'Arts & Theatre') {
      if (genre === 'comedy' || subGenre === 'comedy' || subGenre === 'stand-up') return 'comedy';
      if (genre === 'theatre' || genre === 'theater' || subGenre.includes('musical') || subGenre.includes('play')) return 'theatre';
      if (genre === 'dance' || genre === 'opera') return 'theatre';
      if (genre === 'fine art' || genre === 'visual arts') return 'art';
      if (genre === 'lecture' || genre === 'seminar') return 'lectures';
      if (genre === 'children' || genre === 'family') return 'kids';
      return 'theatre'; // default: most Arts & Theatre events are theatre
    }

    // Miscellaneous — use genre
    if (segment === 'Miscellaneous') {
      if (genre === 'family' || genre === 'children') return 'kids';
      if (genre === 'lecture' || genre === 'seminar') return 'lectures';
      if (genre === 'comedy') return 'comedy';
      return 'general';
    }

    return 'general';
  }

  /**
   * Calculate quality score for an event.
   * @param {Object} event - Ticketmaster event object.
   * @returns {number} Quality score from 1-10.
   */
  calculateQualityScore(event) {
    let score = 5; // Base score

    // Add points for complete information
    if (event.info || event.pleaseNote) score += 1;
    if (event._embedded?.venues?.[0]) score += 1;
    if (event.dates?.start?.localTime) score += 1;
    if (event.priceRanges?.length > 0) score += 1;
    if (event.images?.length > 0) score += 1;

    return Math.min(10, score);
  }

  /**
   * Get the health status of the Ticketmaster API.
   * @returns {Promise<Object>} Health status.
   */
  async getHealthStatus() {
    const startTime = Date.now();
    try {
      const response = await this.searchEvents({ category: 'music', location: 'San Francisco, CA', limit: 1 });
      const processingTime = Date.now() - startTime;

      if (response.success) {
        return { status: 'healthy', latency: processingTime, message: 'Ticketmaster API responding.' };
      } else {
        return { status: 'unhealthy', latency: processingTime, message: response.error };
      }
    } catch (error) {
      return { status: 'unhealthy', latency: null, message: error.message };
    }
  }

}

export default TicketmasterClient;
