/**
 * EventParser.js
 * 
 * Event response parser that handles both narrative and JSON formats from Perplexity
 * Uses proven patterns from successful test cases that identified 29+ events
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EventParser');

export class EventParser {
  constructor() {
    // Event title patterns observed in successful responses
    this.titlePatterns = [
      /^-\s*\*\*([^*]+)\*\*/,               // "- **Event Name**" (most common)
      /^\*\*([^*]+)\*\*/,                   // "**Event Name**"
      /^\d+\.\s*\*\*([^*]+)\*\*/,           // "1. **Event Name**"
      /^•\s*\*\*([^*]+)\*\*/,               // "• **Event Name**"
      /^•\s*([^•]+)/,                       // "• Event Name"
      /^-\s*([^(:\n]+)(?:\s*\([^)]+\))?/,   // "- Event Name (Venue)" - catch events with venue in parentheses
      /^\d+\.\s*([^:\n]+):/,                // "1. Event Name:"
      /^-\s*([^:\n]+):/                     // "- Event Name:"
    ];

    // Date patterns for parsing event dates
    this.datePatterns = [
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:-\d{1,2})?,?\s*\d{4}?/i,
      /\d{1,2}\/\d{1,2}\/\d{4}/,
      /(through|until|to)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i
    ];
  }

  /**
   * Parse Perplexity response and extract events
   * @param {string} content - Raw response content
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @returns {Array} Parsed events
   */
  parseResponse(content, category, location = 'San Francisco, CA') {
    logger.info('Starting response parsing', {
      contentLength: content.length,
      category,
      location
    });

    try {
      // First try to extract JSON from the response
      const jsonEvents = this.extractJsonEvents(content, category, location);
      if (jsonEvents.length > 0) {
        logger.info('Successfully parsed JSON events', { count: jsonEvents.length });
        return jsonEvents;
      }

      // If no JSON found, parse narrative format
      logger.info('No JSON found, parsing narrative format');
      const narrativeEvents = this.parseNarrativeResponse(content, category, location);
      
      logger.info('Parsing completed', {
        eventsFound: narrativeEvents.length,
        category
      });

      return narrativeEvents;

    } catch (error) {
      logger.error('Error parsing response', {
        error: error.message,
        contentLength: content.length,
        category
      });
      return [];
    }
  }

  /**
   * Extract JSON events from response content
   * @param {string} content - Response content
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @returns {Array} Parsed JSON events
   */
  extractJsonEvents(content, category, location) {
    try {
      // Multiple patterns to catch JSON in different formats
      const jsonPatterns = [
        /```json\s*([\s\S]*?)\s*```/,           // Code blocks with json
        /```\s*([\s\S]*?)\s*```/,               // Code blocks without json tag
        /\[\s*\{[\s\S]*?\}\s*\]/,               // Direct JSON array in text
        /^\s*\[[\s\S]*\]\s*$/m                  // JSON array on its own line
      ];

      for (const pattern of jsonPatterns) {
        const match = content.match(pattern);
        if (match) {
          let jsonStr = match[1] || match[0];
          jsonStr = jsonStr.trim();
          
          // Clean up common formatting issues
          jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
          
          try {
            const rawEvents = JSON.parse(jsonStr);
            
            if (Array.isArray(rawEvents) && rawEvents.length > 0) {
              logger.info('Found JSON event array', { 
                count: rawEvents.length,
                pattern: pattern.toString(),
                firstEventKeys: Object.keys(rawEvents[0] || {})
              });
              return rawEvents.map(event => this.normalizeJsonEvent(event, category, location));
            }
          } catch (parseError) {
            logger.debug('JSON parse attempt failed', { 
              error: parseError.message,
              jsonStr: jsonStr.substring(0, 200) + '...'
            });
            continue;
          }
        }
      }

      return [];

    } catch (error) {
      logger.debug('JSON extraction failed, will try narrative', { error: error.message });
      return [];
    }
  }

  /**
   * Parse narrative response format
   * @param {string} content - Response content
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @returns {Array} Parsed narrative events
   */
  parseNarrativeResponse(content, category, location) {
    const events = [];
    const cityName = location.split(',')[0].trim();
    const stateName = location.split(',')[1]?.trim() || 'CA';

    // Remove <think> sections that contain reasoning, not actual events
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '');
    logger.debug('Content cleaned', {
      originalLength: content.length,
      cleanedLength: cleanContent.length
    });

    // Split content into lines and look for event patterns
    const lines = cleanContent.split('\n');
    let currentEvent = {};
    let eventCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;

      // Check for event title patterns
      const titleMatch = this.findTitleMatch(line);
      
      if (titleMatch) {
        // Save previous event if we have one
        if (currentEvent.title) {
          const event = this.createEventFromNarrative(currentEvent, category, cityName, stateName);
          if (event) {
            events.push(event);
            eventCount++;
          }
        }

        // Start new event
        currentEvent = {
          title: titleMatch.trim(),
          lineNumber: i + 1
        };
        
        logger.debug('Found event title', {
          title: titleMatch,
          lineNumber: i + 1,
          pattern: line
        });
        
        continue;
      }

      // If we're tracking an event, look for additional details
      if (currentEvent.title) {
        // Look for venue information
        const venueMatch = line.match(/(?:at\s+|venue[:\s]+|location[:\s]+)([^,\n]+)/i);
        if (venueMatch && !currentEvent.venue) {
          currentEvent.venue = venueMatch[1].trim();
        }

        // Look for dates
        const dateMatch = this.findDateMatch(line);
        if (dateMatch && !currentEvent.date) {
          currentEvent.date = dateMatch[0];
        }

        // Look for description (lines that aren't titles, venues, or dates)
        if (line.length > 20 && !venueMatch && !dateMatch && line.includes(' ')) {
          if (!currentEvent.description) {
            currentEvent.description = line;
          } else if (currentEvent.description.length < 200) {
            currentEvent.description += ' ' + line;
          }
        }
      }
    }

    // Don't forget the last event
    if (currentEvent.title) {
      const event = this.createEventFromNarrative(currentEvent, category, cityName, stateName);
      if (event) {
        events.push(event);
        eventCount++;
      }
    }

    logger.info('Narrative parsing completed', {
      totalLines: lines.length,
      eventsFound: eventCount,
      finalEventCount: events.length
    });

    return events;
  }

  /**
   * Find title match using all available patterns
   * @param {string} line - Line to check
   * @returns {string|null} Matched title or null
   */
  findTitleMatch(line) {
    for (const pattern of this.titlePatterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    return null;
  }

  /**
   * Find date match in line
   * @param {string} line - Line to check
   * @returns {Array|null} Date match or null
   */
  findDateMatch(line) {
    for (const pattern of this.datePatterns) {
      const match = line.match(pattern);
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Create event object from narrative data
   * @param {object} eventData - Raw event data
   * @param {string} category - Event category
   * @param {string} cityName - City name
   * @param {string} stateName - State name
   * @returns {object|null} Normalized event object
   */
  createEventFromNarrative(eventData, category, cityName, stateName) {
    if (!eventData.title || eventData.title.length < 3) {
      return null;
    }

    const startDate = this.parseEventDate(eventData.date);
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000); // Default 3 hour duration

    return {
      id: uuidv4(),
      title: eventData.title.trim(),
      description: eventData.description || '',
      category: category,
      venue: eventData.venue || 'TBD',
      address: eventData.address || `${cityName}, ${stateName}`,
      city: cityName,
      state: stateName,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      priceRange: { min: null, max: null },
      externalUrl: null,
      source: 'perplexity_api',
      confidence: eventData.venue ? 0.8 : 0.6,
      metadata: {
        lineNumber: eventData.lineNumber,
        rawDate: eventData.date
      }
    };
  }

  /**
   * Normalize JSON event to standard format
   * @param {object} event - Raw JSON event
   * @param {string} category - Event category
   * @param {string} location - Location string
   * @returns {object} Normalized event object
   */
  normalizeJsonEvent(event, category, location) {
    const cityName = location.split(',')[0].trim();
    const stateName = location.split(',')[1]?.trim() || 'CA';

    // Handle the new JSON format from CategoryManager templates
    const startDate = this.parseEventDate(
      event.date || event.start_date || event.dates || event.show_times?.[0]
    );
    const endDate = this.parseEventDate(event.end_date) || 
                   new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    // Parse price information from new format
    const priceInfo = event.price_range || event.price_info || '';
    let priceMin = null;
    let priceMax = null;

    if (priceInfo && priceInfo !== 'Contact venue' && priceInfo.toLowerCase() !== 'free') {
      const priceMatch = priceInfo.match(/\$(\d+)(?:-\$?(\d+))?/);
      if (priceMatch) {
        priceMin = parseInt(priceMatch[1]);
        priceMax = priceMatch[2] ? parseInt(priceMatch[2]) : priceMin;
      }
    }

    // Build description from available fields
    let description = event.description || '';
    if (event.genre) description += ` Genre: ${event.genre}.`;
    if (event.show_type) description += ` Type: ${event.show_type}.`;
    if (event.cuisine_type) description += ` Cuisine: ${event.cuisine_type}.`;
    if (event.artist_info) description += ` Artist: ${event.artist_info}.`;
    if (event.sport_type) description += ` Sport: ${event.sport_type}.`;

    return {
      id: uuidv4(),
      title: event.title || event.event_name || event.conference_name || 
             event.name || 'Untitled Event',
      description: description.trim(),
      category: category,
      venue: event.venue || event.venue_name || event.location || 'TBD',
      address: event.location || event.address || location,
      city: cityName,
      state: stateName,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      priceRange: { min: priceMin, max: priceMax },
      externalUrl: event.website || event.website_url || event.url || null,
      source: 'perplexity_api',
      confidence: 0.9,
      metadata: {
        show_times: event.show_times || [],
        original_format: 'json'
      }
    };
  }

  /**
   * Parse event date string into Date object
   * @param {string|undefined} dateStr - Date string
   * @returns {Date} Parsed date
   */
  parseEventDate(dateStr) {
    if (!dateStr) {
      // Default to a random date in the next 30 days
      const now = new Date();
      const randomDays = Math.floor(Math.random() * 30) + 1;
      return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
    }

    try {
      // Try parsing the date string directly
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      // Handle common formats like "July 15-16, 2025" or "August 5, 2025"
      const monthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:-\d{1,2})?,?\s*(\d{4})?/i);
      if (monthMatch) {
        const month = monthMatch[1];
        const day = parseInt(monthMatch[2]);
        const year = parseInt(monthMatch[3]) || new Date().getFullYear();

        const monthIndex = [
          'january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december'
        ].findIndex(m => m.toLowerCase() === month.toLowerCase());

        if (monthIndex !== -1) {
          return new Date(year, monthIndex, day);
        }
      }

      // Fallback to current date plus random days
      const now = new Date();
      const randomDays = Math.floor(Math.random() * 30) + 1;
      return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);

    } catch (error) {
      logger.warn('Error parsing date', { dateStr, error: error.message });
      const now = new Date();
      const randomDays = Math.floor(Math.random() * 30) + 1;
      return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Count potential events in content for debugging
   * @param {string} content - Response content
   * @returns {object} Count analysis
   */
  analyzeContent(content) {
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '');
    const lines = cleanContent.split('\n');
    
    let patterns = {
      boldTitles: 0,
      numberedItems: 0,
      bulletPoints: 0,
      colonTitles: 0,
      total: 0
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.match(/^\*\*([^*]+)\*\*/)) patterns.boldTitles++;
      if (trimmed.match(/^\d+\./)) patterns.numberedItems++;
      if (trimmed.match(/^[-•]/)) patterns.bulletPoints++;
      if (trimmed.match(/^[^:]+:/)) patterns.colonTitles++;
    }

    patterns.total = patterns.boldTitles + patterns.numberedItems + patterns.bulletPoints + patterns.colonTitles;

    return {
      contentLength: content.length,
      cleanedLength: cleanContent.length,
      totalLines: lines.length,
      patterns
    };
  }
}

export default EventParser;