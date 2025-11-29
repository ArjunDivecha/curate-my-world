/**
 * =============================================================================
 * SCRIPT NAME: geocodingFilter.js
 * =============================================================================
 * 
 * INPUT FILES: None (uses Google Maps Geocoding API)
 * OUTPUT FILES: None (in-memory cache)
 * 
 * DESCRIPTION:
 * Simple, reliable location filtering using Google Maps Geocoding API.
 * Geocodes event venues/addresses and filters by distance from target city.
 * 
 * FEATURES:
 * - Google Maps Geocoding API integration
 * - Distance-based filtering (Haversine formula)
 * - In-memory caching to minimize API calls
 * - Batch processing with rate limiting
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-11-29
 * =============================================================================
 */

import config from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('GeocodingFilter');

// In-memory cache for geocoded addresses
const geocodeCache = new Map();

// Known city coordinates (fallback + optimization)
const KNOWN_CITIES = {
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'san francisco, ca': { lat: 37.7749, lng: -122.4194 },
  'oakland': { lat: 37.8044, lng: -122.2712 },
  'oakland, ca': { lat: 37.8044, lng: -122.2712 },
  'berkeley': { lat: 37.8716, lng: -122.2727 },
  'san jose': { lat: 37.3382, lng: -121.8863 },
  'palo alto': { lat: 37.4419, lng: -122.1430 },
  'mountain view': { lat: 37.3861, lng: -122.0839 },
  'sunnyvale': { lat: 37.3688, lng: -122.0363 },
  'santa clara': { lat: 37.3541, lng: -121.9552 },
  'fremont': { lat: 37.5485, lng: -121.9886 },
  'hayward': { lat: 37.6688, lng: -122.0808 },
  'redwood city': { lat: 37.4852, lng: -122.2364 },
  'san mateo': { lat: 37.5630, lng: -122.3255 },
  'daly city': { lat: 37.6879, lng: -122.4702 },
  'walnut creek': { lat: 37.9101, lng: -122.0652 },
  'concord': { lat: 37.9780, lng: -122.0311 },
  'richmond': { lat: 37.9358, lng: -122.3477 },
  'vallejo': { lat: 38.1041, lng: -122.2566 },
  'napa': { lat: 38.2975, lng: -122.2869 },
  'santa rosa': { lat: 38.4404, lng: -122.7141 },
  'petaluma': { lat: 38.2324, lng: -122.6367 },
};

export class GeocodingFilter {
  constructor() {
    this.apiKey = config.googleMapsApiKey || process.env.GOOGLE_MAPS_PLATFORM_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    this.defaultRadiusKm = 80; // 80km covers entire Bay Area
    this.requestDelay = 50; // 50ms between requests (20 req/sec, well under 50/sec limit)
  }

  /**
   * Filter events by distance from target location
   * @param {Array} events - Events to filter
   * @param {string} targetLocation - Target city (e.g., "San Francisco, CA")
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Filtered events
   */
  async filterEventsByLocation(events, targetLocation, options = {}) {
    const { radiusKm = this.defaultRadiusKm } = options;
    
    if (!events || events.length === 0) {
      return events;
    }

    if (!this.apiKey) {
      logger.warn('No Google Maps API key configured - skipping geocoding filter');
      return events;
    }

    const startTime = Date.now();
    
    // Get target coordinates
    const targetCoords = await this.geocode(targetLocation);
    if (!targetCoords) {
      logger.error('Could not geocode target location', { targetLocation });
      return events;
    }

    logger.info('Starting geocoding filter', {
      totalEvents: events.length,
      targetLocation,
      targetCoords,
      radiusKm
    });

    // Process events and filter by distance
    const filteredEvents = [];
    const removedEvents = [];
    let geocodeHits = 0;
    let geocodeMisses = 0;
    let apiCalls = 0;
    let keptUnknown = 0;

    for (const event of events) {
      const eventLocation = this.extractLocationString(event);
      
      if (!eventLocation) {
        // No location info - KEEP event (benefit of the doubt)
        filteredEvents.push(event);
        keptUnknown++;
        continue;
      }

      // Try to geocode the event location
      const eventCoords = await this.geocode(eventLocation);
      
      if (!eventCoords) {
        // Could not geocode - KEEP event (benefit of the doubt)
        filteredEvents.push(event);
        geocodeMisses++;
        keptUnknown++;
        continue;
      }

      if (eventCoords.fromCache) {
        geocodeHits++;
      } else {
        apiCalls++;
      }

      // Calculate distance
      const distance = this.calculateDistance(targetCoords, eventCoords);
      
      if (distance <= radiusKm) {
        // Event is within radius - keep it
        event._geocodeDistance = Math.round(distance);
        filteredEvents.push(event);
      } else {
        // Event is too far - remove it (we KNOW it's far via geocoding)
        removedEvents.push({ 
          event, 
          reason: 'too_far', 
          distance: Math.round(distance),
          location: eventLocation 
        });
      }
    }

    const processingTime = Date.now() - startTime;

    logger.info('Geocoding filter completed', {
      originalCount: events.length,
      filteredCount: filteredEvents.length,
      removedCount: removedEvents.length,
      removalRate: `${((removedEvents.length / events.length) * 100).toFixed(1)}%`,
      cacheHits: geocodeHits,
      cacheMisses: geocodeMisses,
      apiCalls,
      processingTime: `${processingTime}ms`
    });

    // Log sample of removed events for debugging
    if (removedEvents.length > 0) {
      const samples = removedEvents.slice(0, 5).map(r => ({
        title: r.event.title?.substring(0, 40),
        reason: r.reason,
        distance: r.distance,
        location: r.location?.substring(0, 30)
      }));
      logger.debug('Sample removed events', { samples });
    }

    return filteredEvents;
  }

  /**
   * Extract best location string from event
   * @param {Object} event - Event object
   * @returns {string|null} Location string for geocoding
   */
  extractLocationString(event) {
    // Priority order: address > venue + city > location > venue
    if (event.address && event.address !== 'See Event Page') {
      return event.address;
    }
    
    if (event.venue && event.city) {
      return `${event.venue}, ${event.city}`;
    }
    
    if (event.location && event.location !== 'See Event Page') {
      return event.location;
    }
    
    if (event.venue && event.venue !== 'See Event Page') {
      return event.venue;
    }

    // Check if title contains a recognizable venue
    if (event.title) {
      const venueMatch = event.title.match(/at\s+(.+?)(?:\s*[-–|]|$)/i);
      if (venueMatch) {
        return venueMatch[1];
      }
    }

    return null;
  }

  /**
   * Geocode an address using Google Maps API (with caching)
   * @param {string} address - Address to geocode
   * @returns {Promise<Object|null>} Coordinates {lat, lng} or null
   */
  async geocode(address) {
    if (!address) return null;

    const normalizedAddress = address.toLowerCase().trim();
    
    // Check known cities first (instant, no API call)
    if (KNOWN_CITIES[normalizedAddress]) {
      return { ...KNOWN_CITIES[normalizedAddress], fromCache: true };
    }

    // Check cache
    if (geocodeCache.has(normalizedAddress)) {
      const cached = geocodeCache.get(normalizedAddress);
      return cached ? { ...cached, fromCache: true } : null;
    }

    // Call Google Maps API
    try {
      // Rate limiting delay
      await this.delay(this.requestDelay);

      const url = `${this.baseUrl}?address=${encodeURIComponent(address)}&key=${this.apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        logger.warn('Geocoding API error', { status: response.status, address: address.substring(0, 30) });
        geocodeCache.set(normalizedAddress, null);
        return null;
      }

      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = { lat: location.lat, lng: location.lng };
        geocodeCache.set(normalizedAddress, coords);
        return coords;
      } else {
        // No results or error
        logger.debug('Geocoding returned no results', { address: address.substring(0, 30), status: data.status });
        geocodeCache.set(normalizedAddress, null);
        return null;
      }
    } catch (error) {
      logger.warn('Geocoding request failed', { error: error.message, address: address.substring(0, 30) });
      geocodeCache.set(normalizedAddress, null);
      return null;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {Object} coord1 - {lat, lng}
   * @param {Object} coord2 - {lat, lng}
   * @returns {number} Distance in kilometers
   */
  calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(coord2.lat - coord1.lat);
    const dLng = this.toRadians(coord2.lng - coord1.lng);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(coord1.lat)) * Math.cos(this.toRadians(coord2.lat)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Delay helper for rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: geocodeCache.size,
      knownCities: Object.keys(KNOWN_CITIES).length
    };
  }

  /**
   * Clear the geocode cache
   */
  clearCache() {
    geocodeCache.clear();
    logger.info('Geocode cache cleared');
  }
}

export default GeocodingFilter;
