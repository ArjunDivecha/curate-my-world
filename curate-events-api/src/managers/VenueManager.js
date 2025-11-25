/**
 * =============================================================================
 * SCRIPT NAME: VenueManager.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Dynamic venue learning system that automatically builds location-specific
 * venue-to-category mappings based on observed event data patterns.
 * 
 * FEATURES:
 * - Location-aware venue categorization
 * - Automatic venue pattern learning
 * - Confidence-based venue scoring
 * - Persistent venue knowledge storage
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-08-01
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('VenueManager');

export class VenueManager {
  constructor() {
    this.venueDatabase = new Map(); // In-memory venue learning database
    this.venueDataFile = path.join(process.cwd(), 'data', 'learned-venues.json');
    this.loadVenueDatabase();
  }

  /**
   * Load venue database from persistent storage
   */
  async loadVenueDatabase() {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.venueDataFile), { recursive: true });
      
      const data = await fs.readFile(this.venueDataFile, 'utf8');
      const parsedData = JSON.parse(data);
      
      // Convert back to Map structure, including nested categories
      for (const [location, venues] of Object.entries(parsedData)) {
        const venueMap = new Map();
        for (const [venueName, venueData] of Object.entries(venues)) {
          // Convert categories object back to Map
          venueMap.set(venueName, {
            ...venueData,
            categories: new Map(Object.entries(venueData.categories || {}))
          });
        }
        this.venueDatabase.set(location, venueMap);
      }
      
      logger.info('Loaded venue database', { 
        locations: this.venueDatabase.size,
        totalVenues: Array.from(this.venueDatabase.values())
          .reduce((sum, locationMap) => sum + locationMap.size, 0)
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Error loading venue database', { error: error.message });
      } else {
        logger.info('No existing venue database found, starting fresh');
      }
    }
  }

  /**
   * Save venue database to persistent storage
   */
  async saveVenueDatabase() {
    try {
      // Convert Map structure to plain object for JSON serialization
      const dataToSave = {};
      for (const [location, venues] of this.venueDatabase.entries()) {
        dataToSave[location] = Object.fromEntries(venues);
      }
      
      await fs.writeFile(this.venueDataFile, JSON.stringify(dataToSave, null, 2));
      logger.debug('Saved venue database to disk');
    } catch (error) {
      logger.error('Error saving venue database', { error: error.message });
    }
  }

  /**
   * Learn venue-category association from event data
   * @param {string} venue - Venue name
   * @param {string} category - Event category
   * @param {string} location - Location (city, state)
   * @param {number} confidence - Confidence level (0-1)
   */
  learnVenueCategory(venue, category, location, confidence = 0.8) {
    if (!venue || !category || !location) return;

    const normalizedLocation = this.normalizeLocation(location);
    const normalizedVenue = this.normalizeVenue(venue);
    
    // Get or create location-specific venue map
    if (!this.venueDatabase.has(normalizedLocation)) {
      this.venueDatabase.set(normalizedLocation, new Map());
    }
    
    const locationVenues = this.venueDatabase.get(normalizedLocation);
    
    // Get existing venue data or create new
    const existingData = locationVenues.get(normalizedVenue) || {
      categories: new Map(),
      totalObservations: 0,
      confidence: 0
    };
    
    // Update category counts
    if (!existingData.categories.has(category)) {
      existingData.categories.set(category, 0);
    }
    existingData.categories.set(category, existingData.categories.get(category) + 1);
    existingData.totalObservations += 1;
    
    // Calculate new confidence based on consistency
    const primaryCategory = this.getPrimaryCategory(existingData.categories);
    const primaryCount = existingData.categories.get(primaryCategory);
    existingData.confidence = primaryCount / existingData.totalObservations;
    
    // Store updated data
    locationVenues.set(normalizedVenue, existingData);
    
    logger.debug('Learned venue association', {
      venue: normalizedVenue,
      category,
      location: normalizedLocation,
      confidence: existingData.confidence.toFixed(3),
      observations: existingData.totalObservations
    });
    
    // Periodically save to disk (every 10 observations)
    if (existingData.totalObservations % 10 === 0) {
      this.saveVenueDatabase();
    }
  }

  /**
   * Get venue category for a specific location
   * @param {string} venue - Venue name
   * @param {string} location - Location (city, state)
   * @returns {Object} Category prediction with confidence
   */
  getVenueCategory(venue, location) {
    const normalizedLocation = this.normalizeLocation(location);
    const normalizedVenue = this.normalizeVenue(venue);
    
    const locationVenues = this.venueDatabase.get(normalizedLocation);
    if (!locationVenues) {
      return { category: null, confidence: 0, source: 'unknown' };
    }
    
    // Direct venue match
    const venueData = locationVenues.get(normalizedVenue);
    if (venueData && venueData.confidence > 0.5) {
      const primaryCategory = this.getPrimaryCategory(venueData.categories);
      return {
        category: primaryCategory,
        confidence: venueData.confidence,
        source: 'learned',
        observations: venueData.totalObservations
      };
    }
    
    // Partial venue name matching
    for (const [knownVenue, knownData] of locationVenues.entries()) {
      if (normalizedVenue.includes(knownVenue) || knownVenue.includes(normalizedVenue)) {
        if (knownData.confidence > 0.6) {
          const primaryCategory = this.getPrimaryCategory(knownData.categories);
          return {
            category: primaryCategory,
            confidence: knownData.confidence * 0.8, // Reduced confidence for partial match
            source: 'partial_match',
            matchedVenue: knownVenue,
            observations: knownData.totalObservations
          };
        }
      }
    }
    
    return { category: null, confidence: 0, source: 'unknown' };
  }

  /**
   * Get location-specific venue mappings for categorization
   * @param {string} location - Location (city, state)
   * @returns {Object} Location-specific venue category mappings
   */
  getLocationVenueMappings(location) {
    const normalizedLocation = this.normalizeLocation(location);
    const locationVenues = this.venueDatabase.get(normalizedLocation);
    
    if (!locationVenues) {
      return {};
    }
    
    const mappings = {};
    
    for (const [venue, venueData] of locationVenues.entries()) {
      if (venueData.confidence > 0.6) {
        const primaryCategory = this.getPrimaryCategory(venueData.categories);
        
        if (!mappings[primaryCategory]) {
          mappings[primaryCategory] = [];
        }
        
        mappings[primaryCategory].push({
          venue,
          confidence: venueData.confidence,
          observations: venueData.totalObservations
        });
      }
    }
    
    return mappings;
  }

  /**
   * Get primary category from category map or object
   * @param {Map|Object} categories - Category count map or plain object
   * @returns {string} Primary category
   */
  getPrimaryCategory(categories) {
    let maxCount = 0;
    let primaryCategory = null;
    
    // Handle both Map and plain object (from JSON deserialization)
    const entries = categories instanceof Map 
      ? categories.entries() 
      : Object.entries(categories);
    
    for (const [category, count] of entries) {
      if (count > maxCount) {
        maxCount = count;
        primaryCategory = category;
      }
    }
    
    return primaryCategory;
  }

  /**
   * Normalize location string for consistent storage
   * @param {string} location - Raw location string
   * @returns {string} Normalized location
   */
  normalizeLocation(location) {
    return location.toLowerCase().trim()
      .replace(/,\s*/g, ', ')
      .replace(/\s+/g, ' ');
  }

  /**
   * Normalize venue name for consistent storage
   * @param {string} venue - Raw venue name
   * @returns {string} Normalized venue name
   */
  normalizeVenue(venue) {
    return venue.toLowerCase().trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, ''); // Remove special characters except hyphens
  }

  /**
   * Get venue learning statistics
   * @returns {Object} Statistics about learned venues
   */
  getStatistics() {
    const stats = {
      totalLocations: this.venueDatabase.size,
      locationStats: {}
    };
    
    let totalVenues = 0;
    let totalObservations = 0;
    
    for (const [location, venues] of this.venueDatabase.entries()) {
      const locationVenueCount = venues.size;
      const locationObservations = Array.from(venues.values())
        .reduce((sum, venue) => sum + venue.totalObservations, 0);
      
      stats.locationStats[location] = {
        venues: locationVenueCount,
        observations: locationObservations,
        avgConfidence: Array.from(venues.values())
          .reduce((sum, venue) => sum + venue.confidence, 0) / locationVenueCount
      };
      
      totalVenues += locationVenueCount;
      totalObservations += locationObservations;
    }
    
    stats.totalVenues = totalVenues;
    stats.totalObservations = totalObservations;
    
    return stats;
  }

  /**
   * Force save venue database to disk
   */
  async forceSave() {
    await this.saveVenueDatabase();
  }
}

export default VenueManager;