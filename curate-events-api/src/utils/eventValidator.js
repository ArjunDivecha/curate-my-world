/**
 * =============================================================================
 * SCRIPT NAME: eventValidator.js
 * =============================================================================
 *
 * DESCRIPTION:
 * Centralized validation gate for ALL events regardless of source.
 * Rejects listing pages, events without dates, placeholder venues,
 * and events outside the Bay Area.
 *
 * VERSION: 1.0
 * LAST UPDATED: 2026-02-06
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('EventValidator');

// URL patterns that indicate a listing/calendar page rather than a specific event
const LISTING_URL_PATTERNS = [
  /\/events\/?$/i,
  /\/calendar\/?$/i,
  /\/upcoming\/?$/i,
  /\/shows\/?$/i,
  /\/schedule\/?$/i,
  /\/whats-on\/?$/i,
  /\/things-to-do\/?$/i,
  /\/search\/?$/i,
  /\/listings\/?$/i,
  /\/browse\/?$/i
];

// Title patterns that indicate a listing page, not a specific event
const LISTING_TITLE_PATTERNS = [
  /^upcoming\s+(events|shows|concerts)/i,
  /^(all|browse|find|search)\s+(events|shows|concerts)/i,
  /things\s+to\s+do\s+in/i,
  /^events?\s+(calendar|listing|schedule)/i,
  /best\s+(events|shows|concerts)\s+in/i,
  /top\s+\d+\s+(events|shows|concerts)/i
];

// Placeholder venue names that indicate non-specific events
const PLACEHOLDER_VENUES = [
  'various locations',
  'various venues',
  'multiple venues',
  'multiple locations',
  'tbd',
  'to be determined',
  'to be announced',
  'online',
  'virtual',
  'location tbd'
];

/**
 * Validate a single event.
 * @param {Object} event - Event object to validate
 * @param {Object} options - Validation options
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateEvent(event, options = {}) {
  const { requireDate = true, requireVenue = false } = options;

  if (!event) {
    return { valid: false, reason: 'null_event' };
  }

  // Must have a title
  if (!event.title || event.title.trim().length === 0) {
    return { valid: false, reason: 'missing_title' };
  }

  // Reject listing-page titles
  const title = event.title.trim();
  for (const pattern of LISTING_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return { valid: false, reason: `listing_title: "${title}"` };
    }
  }

  // Reject listing-page URLs
  const urls = [event.eventUrl, event.ticketUrl, event.externalUrl].filter(Boolean);
  for (const url of urls) {
    for (const pattern of LISTING_URL_PATTERNS) {
      if (pattern.test(url)) {
        return { valid: false, reason: `listing_url: "${url}"` };
      }
    }
  }

  // Must have a date (if required)
  if (requireDate) {
    if (!event.startDate) {
      return { valid: false, reason: 'missing_date' };
    }
    // Validate date is parseable
    try {
      const d = new Date(event.startDate);
      if (isNaN(d.getTime())) {
        return { valid: false, reason: `invalid_date: "${event.startDate}"` };
      }
    } catch {
      return { valid: false, reason: `unparseable_date: "${event.startDate}"` };
    }
  }

  // Reject placeholder venues (if requireVenue is on)
  if (requireVenue) {
    const venueName = (typeof event.venue === 'string' ? event.venue : event.venue?.name || '').toLowerCase().trim();
    if (!venueName) {
      return { valid: false, reason: 'missing_venue' };
    }
    if (PLACEHOLDER_VENUES.includes(venueName)) {
      return { valid: false, reason: `placeholder_venue: "${venueName}"` };
    }
  }

  return { valid: true, reason: 'passed' };
}

/**
 * Filter an array of events, removing invalid ones.
 * Logs a summary of rejections.
 * @param {Array} events - Events to validate
 * @param {Object} options - Validation options
 * @returns {{ validEvents: Array, rejectedCount: number, rejections: Object }}
 */
export function filterValidEvents(events, options = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return { validEvents: [], rejectedCount: 0, rejections: {} };
  }

  const validEvents = [];
  const rejections = {};

  for (const event of events) {
    const result = validateEvent(event, options);
    if (result.valid) {
      validEvents.push(event);
    } else {
      const category = result.reason.split(':')[0];
      rejections[category] = (rejections[category] || 0) + 1;
    }
  }

  const rejectedCount = events.length - validEvents.length;

  if (rejectedCount > 0) {
    logger.info('Event validation completed', {
      original: events.length,
      valid: validEvents.length,
      rejected: rejectedCount,
      rejections
    });
  }

  return { validEvents, rejectedCount, rejections };
}

export default { validateEvent, filterValidEvents };
