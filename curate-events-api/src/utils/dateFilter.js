/**
 * =============================================================================
 * SCRIPT NAME: dateFilter.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Date filtering utility to ensure events fall within specified date ranges.
 * This ensures consistency across all event sources by applying a final
 * filter after all events have been collected and deduplicated.
 * 
 * FEATURES:
 * - Filter events by date range (e.g., "next 30 days")
 * - Handle various date formats and edge cases
 * - Provide statistics on filtered events
 * 
 * VERSION: 1.0
 * CREATED: 2025-10-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('DateFilter');

export class DateFilter {
  constructor() {
    this.logger = logger;
  }

  /**
   * Parse date range string into start and end dates
   * @param {string} dateRange - Date range string (e.g., "next 30 days", "today", "this week")
   * @returns {Object} Object with startDate and endDate
   */
  parseDateRange(dateRange) {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    const normalized = (dateRange || 'next 30 days').toLowerCase().trim();
    
    if (normalized.includes('today')) {
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);
      return {
        startDate: now,
        endDate: endOfToday
      };
    }
    
    if (normalized.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);
      return {
        startDate: tomorrow,
        endDate: endOfTomorrow
      };
    }
    
    if (normalized.includes('this week') || normalized.includes('next 7 days')) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      weekEnd.setHours(23, 59, 59, 999);
      return {
        startDate: now,
        endDate: weekEnd
      };
    }
    
    if (normalized.includes('this weekend')) {
      // Find next Saturday
      const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
      const saturday = new Date(now);
      saturday.setDate(saturday.getDate() + daysUntilSaturday);
      
      const sunday = new Date(saturday);
      sunday.setDate(sunday.getDate() + 1);
      sunday.setHours(23, 59, 59, 999);
      
      return {
        startDate: saturday,
        endDate: sunday
      };
    }
    
    if (normalized.includes('next 14 days')) {
      const twoWeeksEnd = new Date(now);
      twoWeeksEnd.setDate(twoWeeksEnd.getDate() + 14);
      twoWeeksEnd.setHours(23, 59, 59, 999);
      return {
        startDate: now,
        endDate: twoWeeksEnd
      };
    }
    
    if (normalized.includes('next 30 days') || normalized.includes('next month')) {
      const monthEnd = new Date(now);
      monthEnd.setDate(monthEnd.getDate() + 29); // 29 days + today = 30 days total
      monthEnd.setHours(23, 59, 59, 999);
      return {
        startDate: now,
        endDate: monthEnd
      };
    }
    
    if (normalized.includes('next 60 days')) {
      const twoMonthsEnd = new Date(now);
      twoMonthsEnd.setDate(twoMonthsEnd.getDate() + 60);
      twoMonthsEnd.setHours(23, 59, 59, 999);
      return {
        startDate: now,
        endDate: twoMonthsEnd
      };
    }
    
    if (normalized.includes('next 90 days')) {
      const threeMonthsEnd = new Date(now);
      threeMonthsEnd.setDate(threeMonthsEnd.getDate() + 90);
      threeMonthsEnd.setHours(23, 59, 59, 999);
      return {
        startDate: now,
        endDate: threeMonthsEnd
      };
    }
    
    // Default: next 30 days
    const defaultEnd = new Date(now);
    defaultEnd.setDate(defaultEnd.getDate() + 29); // 29 days + today = 30 days total
    defaultEnd.setHours(23, 59, 59, 999);
    return {
      startDate: now,
      endDate: defaultEnd
    };
  }

  /**
   * Check if an event date falls within the specified range
   * @param {string|Date} eventDate - Event start date
   * @param {Date} startDate - Range start date
   * @param {Date} endDate - Range end date
   * @returns {boolean} True if event is within range
   */
  isWithinRange(eventDate, startDate, endDate) {
    if (!eventDate) {
      return false;
    }

    try {
      const date = new Date(eventDate);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        this.logger.warn('Invalid event date format', { eventDate });
        return false;
      }

      // Check if date is within range
      return date >= startDate && date <= endDate;
    } catch (error) {
      this.logger.error('Error checking date range', { 
        error: error.message, 
        eventDate 
      });
      return false;
    }
  }

  /**
   * Check if an event date is in the past (before today)
   * @param {string|Date} eventDate - Event start date
   * @returns {boolean} True if event is in the past
   */
  isPastEvent(eventDate) {
    if (!eventDate) {
      return true; // No date = assume past/invalid
    }

    try {
      const date = new Date(eventDate);
      
      if (isNaN(date.getTime())) {
        return true; // Invalid date = treat as past
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      return date < today;
    } catch (error) {
      return true; // Error = treat as past
    }
  }

  /**
   * Filter out past events from an array
   * @param {Array} events - Array of events
   * @returns {Object} Filtered events with statistics
   */
  filterPastEvents(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return {
        filteredEvents: [],
        originalCount: 0,
        removedCount: 0,
        pastEvents: []
      };
    }

    const filteredEvents = [];
    const pastEvents = [];

    events.forEach(event => {
      if (this.isPastEvent(event.startDate)) {
        pastEvents.push({
          title: event.title,
          startDate: event.startDate,
          source: event.source
        });
      } else {
        filteredEvents.push(event);
      }
    });

    if (pastEvents.length > 0) {
      this.logger.info('Filtered out past events', {
        originalCount: events.length,
        filteredCount: filteredEvents.length,
        removedCount: pastEvents.length,
        samplePastEvents: pastEvents.slice(0, 5)
      });
    }

    return {
      filteredEvents,
      originalCount: events.length,
      removedCount: pastEvents.length,
      pastEvents: pastEvents.slice(0, 10) // Keep sample for debugging
    };
  }

  /**
   * Filter events by date range
   * @param {Array} events - Array of events to filter
   * @param {string} dateRange - Date range string
   * @param {Object} options - Additional options
   * @returns {Object} Filtered events with statistics
   */
  filterEventsByDateRange(events, dateRange = 'next 30 days', options = {}) {
    const startTime = Date.now();
    
    if (!Array.isArray(events) || events.length === 0) {
      return {
        filteredEvents: [],
        originalCount: 0,
        filteredCount: 0,
        removedCount: 0,
        dateRange,
        processingTime: Date.now() - startTime
      };
    }

    const { startDate, endDate } = this.parseDateRange(dateRange);
    
    this.logger.info('Filtering events by date range', {
      dateRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      originalEventCount: events.length
    });

    const filteredEvents = [];
    const removedEvents = [];

    events.forEach(event => {
      if (this.isWithinRange(event.startDate, startDate, endDate)) {
        filteredEvents.push(event);
      } else {
        removedEvents.push({
          title: event.title,
          startDate: event.startDate,
          source: event.source
        });
      }
    });

    const processingTime = Date.now() - startTime;
    const removedCount = removedEvents.length;

    if (removedCount > 0) {
      this.logger.info('Date filtering removed out-of-range events', {
        originalCount: events.length,
        filteredCount: filteredEvents.length,
        removedCount,
        dateRange,
        processingTime: `${processingTime}ms`,
        sampleRemovedEvents: removedEvents.slice(0, 5) // Log first 5 removed events
      });
    } else {
      this.logger.info('Date filtering completed - all events within range', {
        eventCount: events.length,
        dateRange,
        processingTime: `${processingTime}ms`
      });
    }

    return {
      filteredEvents,
      originalCount: events.length,
      filteredCount: filteredEvents.length,
      removedCount,
      dateRange: {
        text: dateRange,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      processingTime,
      ...(options.includeRemovedEvents && { removedEvents })
    };
  }

  /**
   * Validate event date format
   * @param {string|Date} eventDate - Event date to validate
   * @returns {boolean} True if date is valid
   */
  isValidDate(eventDate) {
    if (!eventDate) return false;
    
    try {
      const date = new Date(eventDate);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  }

  /**
   * Get statistics about event date distribution
   * @param {Array} events - Array of events
   * @returns {Object} Statistics object
   */
  getDateStatistics(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return {
        totalEvents: 0,
        eventsWithDates: 0,
        eventsWithoutDates: 0,
        earliestDate: null,
        latestDate: null,
        dateRangeSpan: null
      };
    }

    const eventsWithDates = events.filter(e => this.isValidDate(e.startDate));
    const eventsWithoutDates = events.length - eventsWithDates.length;

    if (eventsWithDates.length === 0) {
      return {
        totalEvents: events.length,
        eventsWithDates: 0,
        eventsWithoutDates,
        earliestDate: null,
        latestDate: null,
        dateRangeSpan: null
      };
    }

    const dates = eventsWithDates.map(e => new Date(e.startDate));
    const earliestDate = new Date(Math.min(...dates));
    const latestDate = new Date(Math.max(...dates));
    const dateRangeSpan = Math.ceil((latestDate - earliestDate) / (1000 * 60 * 60 * 24));

    return {
      totalEvents: events.length,
      eventsWithDates: eventsWithDates.length,
      eventsWithoutDates,
      earliestDate: earliestDate.toISOString(),
      latestDate: latestDate.toISOString(),
      dateRangeSpan: `${dateRangeSpan} days`
    };
  }
}

export default DateFilter;

