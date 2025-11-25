/**
 * =============================================================================
 * SCRIPT NAME: eventPageDetector.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Sophisticated detection system to distinguish individual event pages from
 * aggregator/listing pages. Uses multi-factor scoring based on URL patterns,
 * title heuristics, and description analysis.
 * 
 * KEY INSIGHT: Real events are "leaf pages" with unique URLs focusing on a
 * single event (per Google's Event Schema documentation).
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-11-25
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('EventPageDetector');

/**
 * URL patterns that indicate AGGREGATOR/LISTING pages (NOT individual events)
 */
const AGGREGATOR_URL_PATTERNS = [
  // Eventbrite category/browse pages
  /eventbrite\.com\/b\//i,
  /eventbrite\.com\/d\//i,
  /eventbrite\.com\/cc\//i,
  /eventbrite\.com\/discover/i,
  /eventbrite\.com\/search/i,
  /eventbrite\.com\/o\//i, // Organizer pages
  
  // Meetup listing pages
  /meetup\.com\/find\//i,
  /meetup\.com\/topics\//i,
  /meetup\.com\/[^\/]+\/events\/?$/i, // Group events list (no event ID)
  /meetup\.com\/[^\/]+\/?$/i, // Group homepage
  
  // Facebook listing pages
  /facebook\.com\/events\/search/i,
  /facebook\.com\/events\/calendar/i,
  /facebook\.com\/events\/?$/i,
  
  // Generic listing page patterns
  /\/events\/?$/i,
  /\/events\/?(?:\?|#|$)/i,
  /\/calendar\/?$/i,
  /\/calendar\/?(?:\?|#|$)/i,
  /\/schedule\/?$/i,
  /\/upcoming\/?$/i,
  /\/whats-?on\/?$/i,
  /\/what-?s-?playing\/?$/i,
  /\/shows\/?$/i,
  /\/performances\/?$/i,
  /\/concerts\/?$/i,
  /\/all-events/i,
  /\/event-listing/i,
  /\/event-calendar/i,
];

/**
 * URL patterns that indicate INDIVIDUAL EVENT pages (high confidence)
 */
const EVENT_DETAIL_URL_PATTERNS = [
  // Eventbrite event pages: /e/event-name-123456789
  /eventbrite\.com\/e\/[a-z0-9-]+-\d+/i,
  
  // Meetup event pages: /group-name/events/123456789
  /meetup\.com\/[^\/]+\/events\/\d+/i,
  
  // Facebook event pages: /events/123456789
  /facebook\.com\/events\/\d+/i,
  
  // Lu.ma events
  /lu\.ma\/[a-z0-9-]+$/i,
  
  // Ticketmaster event pages
  /ticketmaster\.com\/[^\/]+-tickets\/[^\/]+\/event/i,
  
  // EventBrite alternative pattern
  /eventbrite\.[a-z]+\/e\/[^\/]+$/i,
];

/**
 * Title patterns that indicate AGGREGATOR pages (strongly negative)
 */
const AGGREGATOR_TITLE_PATTERNS = [
  // Year ranges indicate season/listing pages
  /20\d{2}[\/\-–—]20?\d{2}/i, // 2025/2026, 2025-26, 2025–2026
  /20\d{2}\s*[\/\-–—]\s*20?\d{2}/i,
  
  // Plural event types = listing page
  /\bevents?\s+(&|and)\s+(tickets?|activities)/i,
  /\b(shows|events|musicals|plays|performances|concerts|activities)\s+in\s+/i,
  /\b(upcoming|all|best|top|find|discover|browse|search|explore)\s+(events?|shows?)/i,
  
  // Season/schedule indicators
  /\bseason\b/i,
  /\bschedule\b/i,
  /\bcalendar\b/i,
  /\bwhat'?s\s+(on|playing)/i,
  /\bthings\s+to\s+do/i,
  
  // Generic listing titles
  /^(arts?|theatre|theater|music|food|tech):\s+/i, // "Arts: Theatre Events..."
  /tickets?\s+20\d{2}/i, // "Tickets 2025" or "Tickets 2025/2026"
  
  // Venue season pages
  /theatre\s+shows\s+20\d{2}/i,
  /theater\s+shows\s+20\d{2}/i,
  
  // "Events & Tickets" patterns
  /events?\s*[&+]\s*tickets?\s+in/i,
  /events?\s*[&+]\s*activities?\s+in/i,
  
  // Generic endings that indicate listings
  /\|\s*eventbrite$/i, // Ends with "| Eventbrite" (usually category pages)
  /\|\s*meetup$/i,
  
  // Official site/ticketing site patterns (venue homepages)
  /official\s+(ticketing\s+)?site/i,
  /ticketing\s+site/i,
  
  // Events Calendar patterns (including · bullet separator)
  /events?\s*calendar/i,
  /[·•]\s*events?\s*calendar/i,
  /calendar\s*[·•]/i,
  
  // Venue homepage patterns
  /\|\s*official\s+site/i,
  /home\s*page/i,
];

/**
 * Title patterns that indicate INDIVIDUAL EVENT pages (positive)
 */
const EVENT_TITLE_PATTERNS = [
  // Specific dates (not year ranges)
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(jan|feb|mar|apr)/i,
  
  // Specific times
  /\b\d{1,2}:\d{2}\s*(am|pm)\b/i,
  /\b\d{1,2}\s*(am|pm)\b/i,
  
  // Single event indicators
  /\btickets\s+(on\s+sale|available|now)/i,
  /\blive\s+(at|in|@)/i,
  /\bpresents:/i,
  /\bfeaturing\b/i,
];

/**
 * Description patterns that indicate AGGREGATOR pages
 */
const AGGREGATOR_DESCRIPTION_PATTERNS = [
  // Lists multiple events
  /\b(here are|here's|check out|browse|find)\s+(the|some|our)?\s*(events?|shows?)/i,
  /\b\d+\s+(events?|shows?|performances?)/i, // "50 events" or "12 shows"
  
  // Numbered event lists
  /\b[1-9]\.\s*\*?\*?event\s*name/i, // "1. **Event Name**"
  /\bevent\s+\d+:/i,
  
  // Multiple dates listed
  /provides?\s+information\s+on\s+(various|multiple)/i,
  
  // Aggregator language
  /\b(upcoming|all|various)\s+events?\b/i,
  /\bevent\s+listing/i,
  /\bevent\s+calendar/i,
];

/**
 * Calculate aggregator score for a result
 * Higher score = more likely to be an aggregator (should be filtered)
 * 
 * @param {string} url - The page URL
 * @param {string} title - The page title
 * @param {string} description - The page description
 * @returns {Object} Score details
 */
export function calculateAggregatorScore(url, title, description) {
  let score = 0;
  const reasons = [];
  
  const urlLower = (url || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  // === URL ANALYSIS ===
  
  // Check for aggregator URL patterns (strong negative signal)
  for (const pattern of AGGREGATOR_URL_PATTERNS) {
    if (pattern.test(urlLower)) {
      score += 3.0;
      reasons.push(`aggregator-url:${pattern.source.substring(0, 30)}`);
      break; // One match is enough
    }
  }
  
  // Check for event detail URL patterns (strong positive signal)
  let hasEventDetailUrl = false;
  for (const pattern of EVENT_DETAIL_URL_PATTERNS) {
    if (pattern.test(urlLower)) {
      score -= 2.5;
      hasEventDetailUrl = true;
      reasons.push(`event-detail-url:${pattern.source.substring(0, 30)}`);
      break;
    }
  }

  // === TITLE ANALYSIS ===
  
  // Check for aggregator title patterns
  for (const pattern of AGGREGATOR_TITLE_PATTERNS) {
    if (pattern.test(titleLower)) {
      score += 2.0;
      reasons.push(`aggregator-title:${pattern.source.substring(0, 30)}`);
    }
  }
  
  // Check for event title patterns (positive)
  for (const pattern of EVENT_TITLE_PATTERNS) {
    if (pattern.test(titleLower)) {
      score -= 1.0;
      reasons.push(`event-title:${pattern.source.substring(0, 30)}`);
    }
  }
  
  // Title length heuristic: very long titles with commas often indicate listings
  const commaCount = (title || '').split(',').length - 1;
  if (commaCount >= 3) {
    score += 0.5;
    reasons.push('many-commas-in-title');
  }
  
  // Title contains "..." often indicates truncated listing title
  if ((title || '').includes('...') || (title || '').includes('…')) {
    score += 0.3;
    reasons.push('truncated-title');
  }

  // === DESCRIPTION ANALYSIS ===
  
  // Check for aggregator description patterns
  for (const pattern of AGGREGATOR_DESCRIPTION_PATTERNS) {
    if (pattern.test(descLower)) {
      score += 1.5;
      reasons.push(`aggregator-desc:${pattern.source.substring(0, 30)}`);
    }
  }
  
  // Multiple event names in description (numbered lists)
  const numberedItems = (description || '').match(/\d+\.\s+\*?\*?[A-Z]/g);
  if (numberedItems && numberedItems.length >= 2) {
    score += 2.0;
    reasons.push('numbered-list-in-desc');
  }
  
  // Multiple dates in description = likely listing
  const dateMatches = (description || '').match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/gi);
  if (dateMatches && dateMatches.length >= 3) {
    score += 1.0;
    reasons.push('multiple-dates-in-desc');
  }

  // === VENUE PAGES ===
  
  // Venue homepage (just venue name as title, no specific event)
  if ((title || '').match(/^(the\s+)?\w+(\s+\w+){0,3}$/) && !hasEventDetailUrl) {
    // Very short title might be a venue name
    if (descLower.includes('upcoming events') || descLower.includes('event calendar')) {
      score += 1.5;
      reasons.push('venue-homepage');
    }
  }

  // === FINAL DECISION ===
  // Threshold of 2.5 allows borderline cases through while still filtering obvious aggregators
  const isAggregator = score >= 2.5;
  
  return {
    score,
    isAggregator,
    reasons,
    confidence: Math.min(Math.abs(score) / 5, 1.0) // Normalize confidence 0-1
  };
}

/**
 * Filter events to remove aggregator/listing pages
 * 
 * @param {Array} events - Array of event objects
 * @param {Object} options - Filtering options
 * @returns {Array} Filtered events
 */
export function filterAggregatorPages(events, options = {}) {
  const { threshold = 2.5, verbose = false } = options;
  
  if (!Array.isArray(events)) return events;
  
  const beforeCount = events.length;
  const filtered = [];
  const removed = [];
  
  for (const event of events) {
    const url = event.eventUrl || event.ticketUrl || event.externalUrl || '';
    const title = event.title || '';
    const description = event.description || '';
    
    const result = calculateAggregatorScore(url, title, description);
    
    if (result.score < threshold) {
      filtered.push(event);
    } else {
      removed.push({
        title: title.substring(0, 60),
        url: url.substring(0, 80),
        score: result.score,
        reasons: result.reasons
      });
    }
  }
  
  const removedCount = beforeCount - filtered.length;
  
  if (removedCount > 0) {
    logger.info('Aggregator pages filtered', {
      before: beforeCount,
      after: filtered.length,
      removed: removedCount,
      threshold
    });
    
    if (verbose && removed.length > 0) {
      logger.debug('Removed aggregator pages', { removed: removed.slice(0, 5) });
    }
  }
  
  return filtered;
}

/**
 * Analyze a single URL/title/description for debugging
 */
export function analyzeEvent(url, title, description) {
  const result = calculateAggregatorScore(url, title, description);
  return {
    url,
    title,
    ...result,
    verdict: result.isAggregator ? 'AGGREGATOR (filter out)' : 'EVENT (keep)'
  };
}

export default {
  calculateAggregatorScore,
  filterAggregatorPages,
  analyzeEvent
};

