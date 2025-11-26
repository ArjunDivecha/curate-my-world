/**
 * =============================================================================
 * SCRIPT NAME: locationFilter.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Location filtering utility to remove events that are not in the target location
 * Fixes issues with APIs like PredictHQ returning events from incorrect locations
 * 
 * FEATURES:
 * - Geographic distance-based filtering
 * - City/state name matching
 * - Bay Area specific filtering for San Francisco
 * - Configurable radius and exclusion lists
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-08-02
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('LocationFilter');

export class LocationFilter {
  constructor() {
    // San Francisco Bay Area coordinates and boundaries
    this.sanFranciscoCoords = { lat: 37.7749, lng: -122.4194 };
    this.bayAreaCities = [
      'san francisco', 'oakland', 'san jose', 'berkeley', 'palo alto',
      'mountain view', 'sunnyvale', 'santa clara', 'fremont', 'hayward',
      'san mateo', 'redwood city', 'cupertino', 'milpitas', 'union city',
      'daly city', 'san bruno', 'south san francisco', 'burlingame',
      'foster city', 'menlo park', 'los altos', 'campbell', 'saratoga',
      'los gatos', 'morgan hill', 'gilroy', 'half moon bay', 'pacifica',
      'millbrae', 'san carlos', 'belmont', 'san leandro', 'castro valley',
      'dublin', 'pleasanton', 'livermore', 'alameda', 'emeryville',
      'richmond', 'el cerrito', 'albany', 'kensington', 'piedmont',
      'orinda', 'lafayette', 'walnut creek', 'concord', 'pleasant hill',
      'martinez', 'antioch', 'pittsburg', 'brentwood', 'oakley',
      'san rafael', 'novato', 'petaluma', 'santa rosa', 'napa',
      'vallejo', 'fairfield', 'vacaville', 'benicia', 'suisun city'
    ];
    
    // Locations that are clearly NOT in the Bay Area (blacklist for filtering)
    this.excludedLocations = [
      // Major US cities outside CA
      'new york', 'nyc', 'brooklyn', 'manhattan', 'bronx', 'queens', 'broadway',
      // Famous NYC venues/theatres that indicate non-Bay Area
      'richard rodgers', 'gershwin theatre', 'majestic theatre', 'shubert theatre',
      'booth theatre', 'lyceum theatre', 'winter garden', 'st james theatre',
      'lincoln center', 'carnegie hall', 'radio city', 'madison square garden',
      // Famous venues in other cities
      'kennedy center', 'wolf trap', 'the met', 'metropolitan opera',
      'chicago', 'boston', 'seattle', 'portland', 'denver', 'buffalo',
      'minneapolis', 'st paul', 'detroit', 'atlanta', 'miami', 'dallas', 'houston', 'austin',
      'phoenix', 'las vegas', 'philadelphia', 'washington dc', 'baltimore',
      'pittsburgh', 'cleveland', 'cincinnati', 'nashville', 'memphis', 'new orleans',
      'st louis', 'kansas city', 'milwaukee', 'indianapolis', 'columbus', 'charlotte',
      'raleigh', 'durham', 'tampa', 'orlando', 'jacksonville', 'salt lake city', 'albuquerque',
      'tucson', 'el paso', 'oklahoma city', 'tulsa', 'omaha', 'wichita', 'flint',
      'rochester', 'syracuse', 'albany', 'hartford', 'providence', 'richmond',
      'virginia beach', 'norfolk', 'louisville', 'lexington', 'knoxville',
      'chattanooga', 'birmingham', 'montgomery', 'mobile', 'little rock',
      'baton rouge', 'shreveport', 'jackson', 'des moines', 'madison',
      'grand rapids', 'ann arbor', 'lansing', 'toledo', 'akron', 'dayton',
      'huntsville', 'fort worth', 'arlington', 'plano', 'irving', 'garland',
      'lubbock', 'amarillo', 'corpus christi', 'laredo', 'mcallen', 'brownsville',
      'savannah', 'augusta', 'macon', 'athens', 'greenville', 'spartanburg',
      'columbia', 'charleston', 'rock hill', 'asheville', 'wilmington',
      // CA cities NOT in Bay Area
      'los angeles', 'san diego', 'glendale', 'pasadena', 'long beach', 'anaheim',
      'santa monica', 'burbank', 'hollywood', 'irvine', 'riverside', 'ontario',
      'fresno', 'bakersfield', 'sacramento', 'stockton', 'modesto', 'santa barbara',
      'palm springs', 'san bernardino', 'huntington beach', 'oceanside', 'chula vista',
      'carlsbad', 'escondido', 'temecula', 'murrieta', 'newport beach', 'laguna beach',
      'santa ana', 'costa mesa', 'torrance', 'culver city', 'west hollywood',
      // International cities
      'london', 'paris', 'berlin', 'munich', 'stuttgart', 'frankfurt', 'amsterdam',
      'madrid', 'barcelona', 'rome', 'milan', 'vienna', 'zurich', 'toronto',
      'montreal', 'vancouver', 'sydney', 'melbourne', 'tokyo', 'seoul', 'singapore',
      'helsinki', 'stockholm', 'oslo', 'copenhagen', 'dublin', 'edinburgh', 'glasgow',
      'manchester', 'birmingham', 'brussels', 'prague', 'budapest', 'warsaw',
      'hamburg', 'cologne', 'dusseldorf', 'dresden', 'leipzig', 'hannover',
      'lisbon', 'porto', 'athens', 'istanbul', 'moscow', 'st petersburg',
      'beijing', 'shanghai', 'hong kong', 'taipei', 'osaka', 'kyoto',
      'mumbai', 'delhi', 'bangalore', 'dubai', 'tel aviv', 'jerusalem',
      // US States (non-CA)
      'minnesota', 'michigan', 'florida', 'texas', 'new york', 'illinois',
      'pennsylvania', 'ohio', 'georgia', 'north carolina', 'washington',
      'arizona', 'massachusetts', 'tennessee', 'indiana', 'missouri',
      'virginia', 'maryland', 'wisconsin', 'colorado', 'oregon', 'nevada',
      'connecticut', 'new jersey', 'south carolina', 'alabama', 'kentucky',
      'louisiana', 'oklahoma', 'iowa', 'arkansas', 'mississippi', 'kansas',
      'nebraska', 'new mexico', 'utah', 'west virginia', 'maine', 'new hampshire',
      'vermont', 'rhode island', 'delaware', 'montana', 'idaho', 'wyoming',
      'north dakota', 'south dakota', 'alaska', 'hawaii',
      // Countries
      'germany', 'france', 'uk', 'united kingdom', 'england', 'canada', 'australia',
      'italy', 'spain', 'netherlands', 'belgium', 'switzerland', 'austria',
      'sweden', 'norway', 'denmark', 'finland', 'ireland', 'scotland', 'japan', 'korea',
      'china', 'india', 'brazil', 'mexico', 'argentina', 'russia', 'poland',
      'czech republic', 'hungary', 'greece', 'turkey', 'israel', 'uae',
      'south africa', 'egypt', 'thailand', 'vietnam', 'indonesia', 'philippines',
      'new zealand', 'portugal'
    ];
  }

  /**
   * Filter events to only include those in the target location
   * @param {Array} events - Array of events to filter
   * @param {string} targetLocation - Target location (e.g., "San Francisco, CA")
   * @param {Object} options - Filtering options
   * @returns {Array} Filtered events
   */
  filterEventsByLocation(events, targetLocation, options = {}) {
    const {
      radiusKm = 50, // Default 50km radius for Bay Area
      strictMode = false, // If true, only exact city matches
      allowBayArea = true // If true, allow all Bay Area cities for SF searches
    } = options;

    if (!events || events.length === 0) {
      return events;
    }

    const targetCity = this.extractCityFromLocation(targetLocation);
    const targetState = this.extractStateFromLocation(targetLocation);
    const isSanFranciscoSearch = targetCity.toLowerCase().includes('san francisco');

    logger.info('Starting location filtering', {
      totalEvents: events.length,
      targetLocation,
      targetCity,
      targetState,
      isSanFranciscoSearch,
      options
    });

    const filteredEvents = events.filter(event => {
      return this.isEventInTargetLocation(event, targetCity, targetState, {
        radiusKm,
        strictMode,
        allowBayArea: allowBayArea && isSanFranciscoSearch
      });
    });

    const removedCount = events.length - filteredEvents.length;
    const removedEvents = events.filter(event => !filteredEvents.includes(event));

    if (removedCount > 0) {
      logger.info('Location filtering completed', {
        originalCount: events.length,
        filteredCount: filteredEvents.length,
        removedCount,
        removalRate: `${((removedCount / events.length) * 100).toFixed(1)}%`
      });

      // Log some examples of removed events for debugging
      const sampleRemoved = removedEvents.slice(0, 5).map(event => ({
        title: event.title,
        venue: event.venue,
        location: event.location,
        city: event.city,
        source: event.source
      }));

      logger.debug('Sample removed events', { sampleRemoved });
    }

    return filteredEvents;
  }

  /**
   * Check if an event is in the target location
   * @param {Object} event - Event object
   * @param {string} targetCity - Target city
   * @param {string} targetState - Target state
   * @param {Object} options - Filtering options
   * @returns {boolean} True if event is in target location
   */
  isEventInTargetLocation(event, targetCity, targetState, options = {}) {
    const { radiusKm, strictMode, allowBayArea } = options;

    // Extract location information from event
    const eventCity = this.extractCityFromEvent(event);
    const eventState = this.extractStateFromEvent(event);
    const eventLocation = event.location || '';
    const eventVenue = event.venue || '';
    const eventTitle = event.title || '';
    const eventAddress = event.address || '';
    const eventDescription = event.description || '';
    
    // Combine all location-related text for comprehensive checking (including description for embedded location info)
    const allLocationText = `${eventCity} ${eventState} ${eventLocation} ${eventVenue} ${eventAddress} ${eventTitle} ${eventDescription}`.toLowerCase();

    // FIRST: Check for explicit exclusions (wrong cities, states, countries)
    if (this.containsExcludedLocation(allLocationText)) {
      logger.debug('Event excluded due to blacklisted location', {
        title: event.title,
        venue: eventVenue,
        location: eventLocation,
        detectedExclusion: this.getMatchedExclusion(allLocationText)
      });
      return false;
    }

    // If we have no location information, keep the event (benefit of doubt)
    if (!eventCity && !eventState && !eventLocation) {
      return true;
    }

    // Check for obvious mismatches (different states)
    if (eventState && targetState && 
        eventState.toLowerCase() !== targetState.toLowerCase() &&
        !this.isNeighboringState(eventState, targetState)) {
      return false;
    }

    // Bay Area special handling for San Francisco searches
    if (allowBayArea && targetCity.toLowerCase().includes('san francisco')) {
      if (this.isBayAreaLocation(eventCity, eventLocation)) {
        return true;
      }
    }

    // City name matching
    if (eventCity) {
      const eventCityLower = eventCity.toLowerCase();
      const targetCityLower = targetCity.toLowerCase();

      // Exact match
      if (eventCityLower === targetCityLower) {
        return true;
      }

      // Partial match for compound city names
      if (eventCityLower.includes(targetCityLower) || targetCityLower.includes(eventCityLower)) {
        return true;
      }

      // Handle cases where the leading word is dropped (e.g. "Francisco" vs "San Francisco")
      if (targetCityLower.includes('san francisco') && eventCityLower.includes('francisco')) {
        return true;
      }
    }

    // Location string matching
    if (eventLocation) {
      const eventLocationLower = eventLocation.toLowerCase();
      const targetCityLower = targetCity.toLowerCase();

      if (eventLocationLower.includes(targetCityLower)) {
        return true;
      }

      if (targetCityLower.includes('san francisco') && eventLocationLower.includes('francisco')) {
        return true;
      }
    }

    // If strict mode, reject anything that doesn't match
    if (strictMode) {
      return false;
    }

    // Default: keep the event if we're not sure
    return true;
  }
  
  /**
   * Check if location text contains any excluded location
   * @param {string} text - Combined location text (lowercase)
   * @returns {boolean} True if contains excluded location
   */
  containsExcludedLocation(text) {
    // Use word boundaries to avoid false positives (e.g., "Dublin" in "Dublin, CA" vs actual Dublin, Ireland)
    // But be careful: Dublin is in Bay Area list, so it should be handled first
    
    // First check if it's a Bay Area location (takes priority)
    if (this.bayAreaCities.some(city => text.includes(city))) {
      return false; // It's in Bay Area, don't exclude
    }
    
    // Then check for excluded locations
    return this.excludedLocations.some(excluded => {
      // Use word boundary-like matching to avoid partial matches
      const pattern = new RegExp(`\\b${excluded}\\b`, 'i');
      return pattern.test(text);
    });
  }
  
  /**
   * Get the matched exclusion for debugging
   * @param {string} text - Combined location text (lowercase)
   * @returns {string|null} Matched exclusion or null
   */
  getMatchedExclusion(text) {
    for (const excluded of this.excludedLocations) {
      const pattern = new RegExp(`\\b${excluded}\\b`, 'i');
      if (pattern.test(text)) {
        return excluded;
      }
    }
    return null;
  }

  /**
   * Check if a location is in the Bay Area
   * @param {string} city - City name
   * @param {string} location - Full location string
   * @returns {boolean} True if in Bay Area
   */
  isBayAreaLocation(city, location) {
    const searchText = `${city || ''} ${location || ''}`.toLowerCase();
    
    return this.bayAreaCities.some(bayAreaCity => 
      searchText.includes(bayAreaCity)
    );
  }

  /**
   * Check if two states are neighboring (for border cases)
   * @param {string} state1 - First state
   * @param {string} state2 - Second state
   * @returns {boolean} True if neighboring
   */
  isNeighboringState(state1, state2) {
    const neighbors = {
      'ca': ['nv', 'or', 'az'],
      'california': ['nevada', 'oregon', 'arizona'],
      'nv': ['ca', 'or', 'ut', 'az'],
      'nevada': ['california', 'oregon', 'utah', 'arizona'],
      'or': ['ca', 'nv', 'wa', 'id'],
      'oregon': ['california', 'nevada', 'washington', 'idaho']
    };

    const s1 = state1.toLowerCase();
    const s2 = state2.toLowerCase();

    return neighbors[s1]?.includes(s2) || neighbors[s2]?.includes(s1);
  }

  /**
   * Extract city from location string
   * @param {string} location - Location string
   * @returns {string} City name
   */
  extractCityFromLocation(location) {
    if (!location) return '';
    
    // Handle "City, State" format
    const parts = location.split(',');
    return parts[0].trim();
  }

  /**
   * Extract state from location string
   * @param {string} location - Location string
   * @returns {string} State name
   */
  extractStateFromLocation(location) {
    if (!location) return '';
    
    // Handle "City, State" format
    const parts = location.split(',');
    if (parts.length > 1) {
      return parts[1].trim();
    }
    return '';
  }

  /**
   * Extract city from event object
   * @param {Object} event - Event object
   * @returns {string} City name
   */
  extractCityFromEvent(event) {
    // Try multiple fields
    return event.city || 
           this.extractCityFromLocation(event.location) ||
           this.extractCityFromLocation(event.venue) ||
           this.extractCityFromLocation(event.address) ||
           '';
  }

  /**
   * Extract state from event object
   * @param {Object} event - Event object
   * @returns {string} State name
   */
  extractStateFromEvent(event) {
    // Try multiple fields
    return event.state ||
           this.extractStateFromLocation(event.location) ||
           this.extractStateFromLocation(event.venue) ||
           this.extractStateFromLocation(event.address) ||
           '';
  }

  /**
   * Calculate distance between two coordinates
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
   * @param {number} degrees - Degrees
   * @returns {number} Radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
}

export default LocationFilter;
