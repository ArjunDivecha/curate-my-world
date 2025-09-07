/**
 * =============================================================================
 * SCRIPT NAME: eventDeduplicator.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Event deduplication utility for combining events from multiple sources
 * (Perplexity AI, Apyflux, etc.) while removing duplicates.
 * 
 * FEATURES:
 * - Fuzzy matching for venue names and event titles
 * - Date/time similarity detection
 * - Confidence scoring for duplicate detection
 * - Source priority handling
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-30
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('EventDeduplicator');

export class EventDeduplicator {
  constructor() {
    // Source priority (higher number = higher priority)
    this.sourcePriority = {
      'apyflux_api': 10,       // Structured API data has highest priority
      'predicthq_api': 9,      // PredictHQ structured data
      'perplexity_api': 8,     // AI-parsed data from web search
      'manual': 5              // Manual entry
    };
    
    // Similarity thresholds
    this.thresholds = {
      title: 0.8,      // 80% similarity for titles
      venue: 0.85,     // 85% similarity for venues  
      date: 24,        // Within 24 hours
      overall: 0.75    // 75% overall similarity to consider duplicate
    };
  }

  /**
   * Deduplicate a list of events from multiple sources
   * @param {Array} eventLists - Array of event arrays from different sources
   * @returns {Object} Deduplication result with unique events and metadata
   */
  deduplicateEvents(eventLists) {
    const startTime = Date.now();
    
    // Flatten all events with source tracking
    const allEvents = [];
    let totalEvents = 0;
    
    eventLists.forEach((eventList, sourceIndex) => {
      if (eventList && eventList.events && Array.isArray(eventList.events)) {
        eventList.events.forEach(event => {
          allEvents.push({
            ...event,
            _originalSource: event.source || `source_${sourceIndex}`,
            _sourceIndex: sourceIndex
          });
        });
        totalEvents += eventList.events.length;
      }
    });

    if (allEvents.length === 0) {
      return {
        uniqueEvents: [],
        duplicatesRemoved: 0,
        totalProcessed: 0,
        processingTime: Date.now() - startTime,
        sources: eventLists.length
      };
    }

    logger.info('Starting deduplication', {
      totalEvents,
      sources: eventLists.length,
      eventsPerSource: eventLists.map(list => list?.events?.length || 0)
    });

    // Find duplicates using similarity matching
    const duplicateGroups = this.findDuplicateGroups(allEvents);
    
    // Select best event from each duplicate group
    const uniqueEvents = duplicateGroups.map(group => this.selectBestEvent(group));
    
    const processingTime = Date.now() - startTime;
    const duplicatesRemoved = totalEvents - uniqueEvents.length;

    logger.info('Deduplication completed', {
      totalEvents,
      uniqueEvents: uniqueEvents.length,
      duplicatesRemoved,
      processingTime: `${processingTime}ms`,
      duplicateGroups: duplicateGroups.length
    });

    return {
      uniqueEvents,
      duplicatesRemoved,
      totalProcessed: totalEvents,
      processingTime,
      sources: eventLists.length,
      duplicateGroups: duplicateGroups.length
    };
  }

  /**
   * Find groups of duplicate events
   * @param {Array} events - Array of events to analyze
   * @returns {Array} Array of duplicate groups
   */
  findDuplicateGroups(events) {
    const groups = [];
    const processed = new Set();

    events.forEach((event, index) => {
      if (processed.has(index)) return;

      const group = [event];
      processed.add(index);

      // Find similar events
      events.forEach((otherEvent, otherIndex) => {
        if (otherIndex <= index || processed.has(otherIndex)) return;

        const similarity = this.calculateSimilarity(event, otherEvent);
        
        if (similarity >= this.thresholds.overall) {
          group.push(otherEvent);
          processed.add(otherIndex);
        }
      });

      groups.push(group);
    });

    return groups;
  }

  /**
   * Calculate similarity between two events
   * @param {Object} event1 - First event
   * @param {Object} event2 - Second event
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(event1, event2) {
    let totalScore = 0;
    let weights = 0;

    // Title similarity (weight: 3)
    const titleSim = this.calculateStringSimilarity(
      this.normalizeString(event1.title || ''),
      this.normalizeString(event2.title || '')
    );
    totalScore += titleSim * 3;
    weights += 3;

    // Venue similarity (weight: 2)
    const venueSim = this.calculateStringSimilarity(
      this.normalizeString(event1.venue || ''),
      this.normalizeString(event2.venue || '')
    );
    totalScore += venueSim * 2;
    weights += 2;

    // Date similarity (weight: 2)
    const dateSim = this.calculateDateSimilarity(event1.startDate, event2.startDate);
    totalScore += dateSim * 2;
    weights += 2;

    // Location similarity (weight: 1)
    const locationSim = this.calculateStringSimilarity(
      this.normalizeString(event1.location || ''),
      this.normalizeString(event2.location || '')
    );
    totalScore += locationSim * 1;
    weights += 1;

    return weights > 0 ? totalScore / weights : 0;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate date similarity
   * @param {string} date1 - First date
   * @param {string} date2 - Second date
   * @returns {number} Similarity score (0-1)
   */
  calculateDateSimilarity(date1, date2) {
    if (!date1 || !date2) return 0;

    try {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;

      const diffHours = Math.abs(d1 - d2) / (1000 * 60 * 60);
      
      if (diffHours === 0) return 1;
      if (diffHours > this.thresholds.date) return 0;
      
      // Linear decay within threshold
      return 1 - (diffHours / this.thresholds.date);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Normalize string for comparison
   * @param {string} str - Input string
   * @returns {string} Normalized string
   */
  normalizeString(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .replace(/\b(the|a|an|at|in|on|and|&)\b/g, '') // Remove common words
      .trim();
  }

  /**
   * Select the best event from a duplicate group
   * @param {Array} eventGroup - Group of duplicate events
   * @returns {Object} Best event from the group
   */
  selectBestEvent(eventGroup) {
    if (eventGroup.length === 1) {
      return eventGroup[0];
    }

    // Sort by source priority, then by data completeness
    const sortedEvents = eventGroup.sort((a, b) => {
      // Priority by source
      const priorityA = this.sourcePriority[a._originalSource] || 0;
      const priorityB = this.sourcePriority[b._originalSource] || 0;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }

      // Secondary sort by data completeness
      const completenessA = this.calculateDataCompleteness(a);
      const completenessB = this.calculateDataCompleteness(b);
      
      return completenessB - completenessA;
    });

    const bestEvent = sortedEvents[0];
    
    // Add metadata about merged sources
    bestEvent._mergedFromSources = eventGroup.map(e => e._originalSource);
    bestEvent._duplicateCount = eventGroup.length;

    return bestEvent;
  }

  /**
   * Calculate data completeness score for an event
   * @param {Object} event - Event object
   * @returns {number} Completeness score
   */
  calculateDataCompleteness(event) {
    let score = 0;
    const fields = [
      'title', 'venue', 'location', 'startDate', 'description',
      'externalUrl', 'ticketLinks', 'priceRange', 'venueInfo'
    ];

    fields.forEach(field => {
      if (event[field]) {
        if (Array.isArray(event[field])) {
          score += event[field].length > 0 ? 1 : 0;
        } else if (typeof event[field] === 'object') {
          score += Object.keys(event[field]).length > 0 ? 1 : 0;
        } else {
          score += 1;
        }
      }
    });

    return score;
  }

  /**
   * Get deduplication statistics
   * @param {Array} eventLists - Original event lists
   * @param {Object} result - Deduplication result
   * @returns {Object} Statistics object
   */
  getDeduplicationStats(eventLists, result) {
    const sourceStats = {};
    
    eventLists.forEach((eventList, index) => {
      const derivedSource = (eventList && eventList.events && eventList.events[0] && eventList.events[0].source) || null;
      const sourceName = eventList.source || derivedSource || `source_${index}`;
      sourceStats[sourceName] = {
        originalCount: eventList.events?.length || 0,
        survivedCount: 0,
        duplicatesRemoved: 0
      };
    });

    // Count survived events by source
    result.uniqueEvents.forEach(event => {
      const source = event._originalSource;
      if (sourceStats[source]) {
        sourceStats[source].survivedCount++;
      }
    });

    // Calculate duplicates removed
    Object.keys(sourceStats).forEach(source => {
      const stats = sourceStats[source];
      stats.duplicatesRemoved = stats.originalCount - stats.survivedCount;
    });

    return {
      totalOriginal: result.totalProcessed,
      totalUnique: result.uniqueEvents.length,
      totalDuplicatesRemoved: result.duplicatesRemoved,
      processingTime: result.processingTime,
      sourceBreakdown: sourceStats,
      duplicateGroups: result.duplicateGroups
    };
  }
}

export default EventDeduplicator;
