/**
 * =============================================================================
 * SCRIPT NAME: venueWhitelist.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Loads venue domains from whitelist.xlsx for targeted event searches.
 * Edit whitelist.xlsx to add/remove venues - no code changes needed.
 * 
 * INPUT FILE:
 * - curate-events-api/whitelist.xlsx
 *   Columns: category, scope, domain, name, enabled
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-11-25
 * =============================================================================
 */

import XLSX from 'xlsx';
import path from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('VenueWhitelist');

// =============================================================================
// CONFIGURATION
// =============================================================================

const WHITELIST_PATH = path.join(process.cwd(), 'whitelist.xlsx');
const RELOAD_INTERVAL_MS = 60 * 1000; // Reload every 60 seconds

// Geographic scope hierarchy
const SCOPE_HIERARCHY = {
  bayarea: ['bayarea', 'eastbay', 'berkeley', 'oakland', 'sf', 'southbay', 'peninsula', 'any'],
  eastbay: ['eastbay', 'berkeley', 'oakland', 'any'],
  berkeley: ['berkeley', 'any'],
  sf: ['sf', 'any'],
  southbay: ['southbay', 'sanjose', 'paloalto', 'mountainview', 'sunnyvale', 'any'],
  peninsula: ['peninsula', 'paloalto', 'redwoodcity', 'sanmateo', 'any'],
  any: ['any'],
};

// =============================================================================
// STATE
// =============================================================================

let venues = [];
let lastLoadTime = 0;

// =============================================================================
// XLSX LOADING
// =============================================================================

function loadWhitelist() {
  try {
    const workbook = XLSX.readFile(WHITELIST_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    venues = data
      .filter(row => {
        const enabled = String(row.enabled || 'yes').toLowerCase();
        return enabled !== 'no' && enabled !== '0' && enabled !== 'false';
      })
      .map(row => ({
        category: String(row.category || 'all').toLowerCase().trim(),
        scope: String(row.scope || 'any').toLowerCase().trim(),
        domain: String(row.domain || '').trim(),
        name: String(row.name || '').trim(),
      }))
      .filter(v => v.domain); // Must have a domain
    
    lastLoadTime = Date.now();
    logger.info(`Loaded ${venues.length} venues from whitelist.xlsx`);
  } catch (error) {
    logger.error('Failed to load whitelist.xlsx', { error: error.message, path: WHITELIST_PATH });
    // Keep existing venues if reload fails
    if (venues.length === 0) {
      logger.warn('No venues loaded - searches will use platform-only queries');
    }
  }
}

// Initial load
loadWhitelist();

// =============================================================================
// HELPERS
// =============================================================================

function reloadIfStale() {
  if (Date.now() - lastLoadTime > RELOAD_INTERVAL_MS) {
    loadWhitelist();
  }
}

function scopeMatches(venueScope, requestedScope) {
  if (venueScope === 'any') return true;
  const hierarchy = SCOPE_HIERARCHY[requestedScope] || [requestedScope, 'any'];
  return hierarchy.includes(venueScope);
}

function categoryMatches(venueCategory, requestedCategory) {
  if (venueCategory === 'all') return true;
  return venueCategory === requestedCategory;
}

function extractScope(location) {
  const loc = (location || '').toLowerCase();
  if (loc.includes('berkeley')) return 'berkeley';
  if (loc.includes('oakland')) return 'eastbay';
  if (loc.includes('san francisco') || loc.includes('sf')) return 'sf';
  if (loc.includes('san jose') || loc.includes('sunnyvale') || loc.includes('mountain view') || loc.includes('palo alto')) return 'southbay';
  if (loc.includes('bay area')) return 'bayarea';
  return 'bayarea'; // Default
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get venue domains for a category and location
 * @param {string} category - Event category (music, theatre, art, etc.)
 * @param {string} location - Location string (e.g., "San Francisco, CA")
 * @returns {string[]} Array of domains
 */
export function getVenueDomains(category, location) {
  reloadIfStale();
  
  const normalizedCategory = (category || '').toLowerCase().replace(/\s+/g, '-');
  const scope = extractScope(location);
  
  const domains = venues
    .filter(v => categoryMatches(v.category, normalizedCategory) && scopeMatches(v.scope, scope))
    .map(v => v.domain);
  
  return [...new Set(domains)]; // Dedupe
}

/**
 * Build site-specific queries for Exa/Serper
 * @param {string} category - Event category
 * @param {string} location - Location string
 * @param {number} limit - Max number of venue queries to generate
 * @returns {string[]} Array of site: queries
 */
export function buildVenueQueries(category, location, limit = 5) {
  const domains = getVenueDomains(category, location);
  const queries = [];
  
  // Take top venues (excluding platforms like eventbrite)
  const venueDomains = domains.filter(d => 
    !['eventbrite.com', 'meetup.com', 'lu.ma'].includes(d)
  ).slice(0, limit);
  
  for (const domain of venueDomains) {
    queries.push(`site:${domain} events 2025`);
  }
  
  return queries;
}

/**
 * Get domains for Exa's include_domains parameter
 * @param {string} category - Event category
 * @param {string} location - Location string
 * @returns {string[]} Array of domains
 */
export function getExaIncludeDomains(category, location) {
  return getVenueDomains(category, location);
}

/**
 * Force reload the whitelist file
 */
export function reloadWhitelist() {
  loadWhitelist();
}

/**
 * Get count of loaded venues (for health checks)
 */
export function getVenueCount() {
  return venues.length;
}

export default {
  getVenueDomains,
  buildVenueQueries,
  getExaIncludeDomains,
  reloadWhitelist,
  getVenueCount,
};
