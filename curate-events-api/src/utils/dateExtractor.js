/**
 * =============================================================================
 * DATE EXTRACTOR - Robust Date Extraction from Text
 * =============================================================================
 * 
 * Uses chrono-node (industry-standard NLP date parser) to extract dates from
 * unstructured text. Handles:
 * - Formal dates: "November 22, 2025", "11/22/2025", "2025-11-22"
 * - Natural language: "tomorrow", "next Friday", "2 weeks from now"
 * - Event formats: "Friday at 8pm", "Sep 12-13", "Nov 22, 7:00 PM"
 * 
 * KEY FEATURES:
 * - forwardDate: Prefers future dates for event parsing
 * - Confidence scoring: Know if date was actually extracted
 * - NEVER defaults to today's date (prevents past events slipping through)
 * 
 * VERSION: 1.0
 * CREATED: 2025-11-26
 * =============================================================================
 */

import * as chrono from 'chrono-node';
import { createLogger } from './logger.js';

const logger = createLogger('DateExtractor');

/**
 * Extract date from text using chrono-node (primary) with regex fallback
 * 
 * @param {string} text - Text to extract date from
 * @param {Object} options - Extraction options
 * @param {boolean} options.preferFuture - Prefer future dates (default: true)
 * @param {string} options.timezone - Timezone for parsing (default: 'America/Los_Angeles')
 * @returns {Object} { date: ISO string or null, confidence: 'high'|'medium'|'low'|'none', raw: original text match }
 */
export function extractDate(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { date: null, confidence: 'none', raw: null };
  }

  const { preferFuture = true, timezone = 'America/Los_Angeles' } = options;
  const referenceDate = new Date();

  try {
    // Try chrono-node first (handles most natural language dates)
    const results = chrono.parse(text, referenceDate, { forwardDate: preferFuture });
    
    if (results && results.length > 0) {
      const result = results[0];
      const parsedDate = result.start.date();
      
      // Calculate confidence based on chrono's certainty
      let confidence = 'high';
      
      // Check if key components are certain (not implied)
      const hasCertainDay = result.start.isCertain('day');
      const hasCertainMonth = result.start.isCertain('month');
      const hasCertainYear = result.start.isCertain('year');
      
      if (!hasCertainYear) {
        confidence = 'medium'; // Year was implied
      }
      if (!hasCertainDay || !hasCertainMonth) {
        confidence = 'low'; // Day or month was implied
      }

      logger.debug('Chrono extracted date', {
        raw: result.text,
        parsed: parsedDate.toISOString(),
        confidence,
        certainty: { day: hasCertainDay, month: hasCertainMonth, year: hasCertainYear }
      });

      return {
        date: parsedDate.toISOString(),
        endDate: result.end ? result.end.date().toISOString() : null,
        confidence,
        raw: result.text
      };
    }

    // Fallback: Try strict regex patterns for structured dates
    const regexResult = extractDateWithRegex(text);
    if (regexResult.date) {
      logger.debug('Regex extracted date', regexResult);
      return { ...regexResult, confidence: 'medium' };
    }

    // No date found - return null (NEVER default to today)
    logger.debug('No date found in text', { textSample: text.substring(0, 100) });
    return { date: null, confidence: 'none', raw: null };

  } catch (error) {
    logger.error('Error extracting date', { error: error.message, text: text.substring(0, 100) });
    return { date: null, confidence: 'none', raw: null, error: error.message };
  }
}

/**
 * Fallback regex extraction for structured date formats
 * @param {string} text - Text to search
 * @returns {Object} { date: ISO string or null, raw: matched text }
 */
function extractDateWithRegex(text) {
  const patterns = [
    // ISO format: 2025-11-22
    {
      regex: /(\d{4})-(\d{2})-(\d{2})/,
      parse: (m) => new Date(m[1], parseInt(m[2]) - 1, m[3])
    },
    // US format: 11/22/2025 or 11/22/25
    {
      regex: /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
      parse: (m) => {
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return new Date(year, parseInt(m[1]) - 1, m[2]);
      }
    },
    // Long month: November 22, 2025 or Nov 22, 2025
    {
      regex: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i,
      parse: (m) => {
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIndex = months.findIndex(month => month === m[1].toLowerCase());
        const year = m[3] || new Date().getFullYear();
        return new Date(year, monthIndex, m[2]);
      }
    },
    // Abbreviated month: Nov 22, 2025
    {
      regex: /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i,
      parse: (m) => {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIndex = months.findIndex(month => month === m[1].toLowerCase());
        const year = m[3] || new Date().getFullYear();
        return new Date(year, monthIndex, m[2]);
      }
    },
    // Day Month Year: 22 November 2025
    {
      regex: /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december),?\s*(\d{4})?/i,
      parse: (m) => {
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIndex = months.findIndex(month => month === m[2].toLowerCase());
        const year = m[3] || new Date().getFullYear();
        return new Date(year, monthIndex, m[1]);
      }
    }
  ];

  for (const { regex, parse } of patterns) {
    const match = text.match(regex);
    if (match) {
      try {
        const date = parse(match);
        if (!isNaN(date.getTime())) {
          return { date: date.toISOString(), raw: match[0] };
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  return { date: null, raw: null };
}

/**
 * Check if a date is in the past (before today)
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if date is in the past
 */
export function isDateInPast(date) {
  if (!date) return true;
  
  try {
    const eventDate = new Date(date);
    if (isNaN(eventDate.getTime())) return true;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return eventDate < today;
  } catch {
    return true;
  }
}

/**
 * Check if a date is valid and in the future
 * @param {string|Date} date - Date to check  
 * @returns {boolean} True if date is valid and in the future
 */
export function isValidFutureDate(date) {
  if (!date) return false;
  
  try {
    const eventDate = new Date(date);
    if (isNaN(eventDate.getTime())) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Valid if today or in the future
    return eventDate >= today;
  } catch {
    return false;
  }
}

/**
 * Extract event date with full metadata
 * @param {string} text - Text containing event information
 * @param {Object} options - Options
 * @returns {Object} Full extraction result with date, confidence, and validation
 */
export function extractEventDate(text, options = {}) {
  const result = extractDate(text, { preferFuture: true, ...options });
  
  return {
    ...result,
    isValid: result.date !== null,
    isFuture: isValidFutureDate(result.date),
    isPast: isDateInPast(result.date)
  };
}

export default {
  extractDate,
  extractEventDate,
  isDateInPast,
  isValidFutureDate
};

