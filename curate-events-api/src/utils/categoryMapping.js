/**
 * =============================================================================
 * SCRIPT NAME: categoryMapping.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Unified category mapping for all event providers. This is the single source
 * of truth for how our categories map to each provider's classification system.
 * 
 * SUPPORTED CATEGORIES (10 total):
 * - Tier 1 (High volume): music, theatre, comedy, movies, art
 * - Tier 2 (Good coverage): food, tech, lectures, kids, desi
 * 
 * PROVIDERS:
 * - Ticketmaster: Uses segment IDs and genre IDs
 * - Exa: Uses search queries with domain hints
 * - Serper: Uses search queries with site operators
 * 
 * VERSION: 1.0
 * CREATED: 2025-11-25
 * =============================================================================
 */

import { createLogger } from './logger.js';

const logger = createLogger('CategoryMapping');

/**
 * Master category configuration
 * Each category has mappings for all supported providers
 */
export const CATEGORY_CONFIG = {
  // =========================================================================
  // TIER 1: High Volume Categories (Ticketmaster + all sources)
  // =========================================================================
  
  music: {
    displayName: 'Music',
    description: 'Concerts, live music, bands, DJ events',
    priority: 'high',
    ticketmaster: {
      segmentId: 'KZFzniwnSyZfZ7v7nJ',  // Music segment
      genreId: null
    },
    searchQueries: [
      '{category} concerts {location} tickets',
      'live music events {location}',
      'bands playing {location}'
    ],
    searchDomains: [
      'songkick.com',
      'bandsintown.com',
      'concerts.livenation.com'
    ],
    keywords: ['concert', 'music', 'band', 'live', 'performance', 'show', 'tour', 'DJ', 'festival']
  },

  theatre: {
    displayName: 'Theatre',
    description: 'Plays, musicals, Broadway, performing arts',
    priority: 'high',
    ticketmaster: {
      segmentId: 'KZFzniwnSyZfZ7v7na',  // Arts & Theatre segment
      genreId: 'KnvZfZ7v7l1'            // Theatre genre
    },
    searchQueries: [
      'theatre plays {location} tickets',
      'musicals {location}',
      'broadway shows {location}'
    ],
    searchDomains: [
      'broadwaysf.com',
      'act-sf.org',
      'berkeleyrep.org',
      'theatreworks.org'
    ],
    keywords: ['theatre', 'theater', 'play', 'musical', 'broadway', 'drama', 'stage', 'performance']
  },

  comedy: {
    displayName: 'Comedy',
    description: 'Stand-up comedy, improv, comedy shows',
    priority: 'high',
    ticketmaster: {
      segmentId: 'KZFzniwnSyZfZ7v7na',  // Arts & Theatre segment
      genreId: 'KnvZfZ7vAe1'            // Comedy genre
    },
    searchQueries: [
      'stand-up comedy {location} tickets',
      'comedy shows {location}',
      'improv comedy {location}'
    ],
    searchDomains: [
      'cobbscomedyclub.com',
      'punchlinecomedyclub.com',
      'heliumcomedy.com',
      'comedyoakland.com'
    ],
    keywords: ['comedy', 'standup', 'stand-up', 'improv', 'comedian', 'funny', 'humor', 'comic']
  },

  movies: {
    displayName: 'Movies',
    description: 'Film screenings, premieres, cinema events',
    priority: 'high',
    ticketmaster: {
      segmentId: 'KZFzniwnSyZfZ7v7nn',  // Film segment
      genreId: null
    },
    searchQueries: [
      'film screenings {location}',
      'movie premieres {location}',
      'cinema events {location}'
    ],
    searchDomains: [
      'alamo drafthouse',
      'roxie.com',
      'bfroxie.com'
    ],
    keywords: ['movie', 'film', 'cinema', 'screening', 'premiere', 'documentary', 'indie film']
  },

  art: {
    displayName: 'Art',
    description: 'Art exhibitions, galleries, museums',
    priority: 'high',
    ticketmaster: null,  // Not supported — TM "Arts & Theatre" segment is theatre/comedy, not visual art

    searchQueries: [
      'art exhibitions {location}',
      'gallery openings {location}',
      'museum events {location}'
    ],
    searchDomains: [
      'sfmoma.org',
      'asianart.org',
      'deyoung.famsf.org',
      'bfroxie.org'
    ],
    keywords: ['art', 'gallery', 'exhibition', 'museum', 'painting', 'sculpture', 'visual arts']
  },

  // =========================================================================
  // TIER 2: Good Coverage Categories (Web + some providers)
  // =========================================================================

  food: {
    displayName: 'Food & Drink',
    description: 'Food festivals, tastings, culinary events',
    priority: 'medium',
    ticketmaster: null,  // Not supported by Ticketmaster
    searchQueries: [
      'food festivals {location}',
      'wine tasting events {location}',
      'culinary events {location}',
      'food truck events {location}'
    ],
    searchDomains: [
      'eventbrite.com',
      'sfgate.com/food'
    ],
    keywords: ['food', 'culinary', 'tasting', 'wine', 'beer', 'restaurant', 'chef', 'cooking', 'festival']
  },

  tech: {
    displayName: 'Tech',
    description: 'Tech meetups, hackathons, AI/ML conferences',
    priority: 'medium',
    ticketmaster: null,  // Not supported by Ticketmaster
    searchQueries: [
      'tech meetups {location}',
      'hackathons {location}',
      'AI ML conferences {location}',
      'startup events {location}'
    ],
    searchDomains: [
      'meetup.com',
      'lu.ma',
      'eventbrite.com'
    ],
    keywords: ['tech', 'technology', 'AI', 'machine learning', 'startup', 'hackathon', 'software', 'programming', 'coding']
  },

  lectures: {
    displayName: 'Lectures & Talks',
    description: 'Lectures, author talks, seminars, workshops',
    priority: 'medium',
    ticketmaster: {
      segmentId: 'KZFzniwnSyZfZ7v7n1',  // Miscellaneous segment
      genreId: 'KnvZfZ7vAeA'            // Lecture/Seminar genre
    },
    searchQueries: [
      'lectures {location}',
      'author talks {location}',
      'seminars workshops {location}',
      'speaker events {location}'
    ],
    searchDomains: [
      'cityarts.net',
      'commonwealthclub.org',
      'jccsf.org'
    ],
    keywords: ['lecture', 'talk', 'seminar', 'workshop', 'speaker', 'author', 'presentation', 'discussion']
  },

  kids: {
    displayName: 'Kids & Family',
    description: 'Family-friendly events, children activities',
    priority: 'medium',
    ticketmaster: {
      segmentId: 'KZFzniwnSyZfZ7v7n1',  // Miscellaneous segment
      genreId: 'KnvZfZ7vA1E'            // Family genre
    },
    searchQueries: [
      'family events {location}',
      'kids activities {location}',
      'children events {location}'
    ],
    searchDomains: [
      'funcheap.com',
      'redtri.com'
    ],
    keywords: ['family', 'kids', 'children', 'family-friendly', 'all ages', 'parent', 'toddler']
  },

  desi: {
    displayName: 'Desi',
    description: 'Indian and South Asian events in the Bay Area',
    priority: 'medium',
    ticketmaster: null, // Scraper-first category
    searchQueries: [
      'desi events {location}',
      'indian events {location}',
      'bollywood bhangra {location}',
      'garba dandiya {location}',
      'south asian cultural events {location}'
    ],
    searchDomains: [
      'events.sulekha.com',
      'eventmozo.com',
      'simplydesi.us',
      'epadosi.com'
    ],
    keywords: [
      'desi', 'indian', 'south asian', 'bollywood', 'bhangra', 'garba', 'dandiya',
      'holi', 'diwali', 'punjabi', 'gujarati', 'tamil', 'telugu', 'hindi', 'urdu',
      'kathak', 'bharatanatyam', 'kollywood', 'tollywood'
    ]
  }
};

/**
 * List of supported categories (in display order)
 */
export const SUPPORTED_CATEGORIES = [
  'music', 'theatre', 'comedy', 'movies', 'art',  // Tier 1
  'food', 'tech', 'lectures', 'kids', 'desi'       // Tier 2
];

/**
 * Get Ticketmaster classification for a category
 * @param {string} category - Category name
 * @returns {Object|null} { segmentId, genreId } or null if not supported
 */
export function getTicketmasterClassification(category) {
  const config = CATEGORY_CONFIG[category.toLowerCase()];
  if (!config || !config.ticketmaster) {
    return null;
  }
  return config.ticketmaster;
}

/**
 * Get search queries for a category (for Exa/Serper)
 * @param {string} category - Category name
 * @param {string} location - Location to search
 * @returns {string[]} Array of search queries
 */
export function getSearchQueries(category, location) {
  const config = CATEGORY_CONFIG[category.toLowerCase()];
  if (!config) {
    return [`${category} events ${location}`];
  }
  
  return config.searchQueries.map(q => 
    q.replace('{category}', category).replace('{location}', location)
  );
}

/**
 * Get preferred domains for a category (for Exa includeDomains)
 * @param {string} category - Category name
 * @returns {string[]} Array of domain names
 */
export function getPreferredDomains(category) {
  const config = CATEGORY_CONFIG[category.toLowerCase()];
  return config?.searchDomains || [];
}

/**
 * Get keywords for a category (for filtering/scoring)
 * @param {string} category - Category name
 * @returns {string[]} Array of keywords
 */
export function getCategoryKeywords(category) {
  const config = CATEGORY_CONFIG[category.toLowerCase()];
  return config?.keywords || [category];
}

/**
 * Check if a category is supported by Ticketmaster
 * @param {string} category - Category name
 * @returns {boolean}
 */
export function isTicketmasterSupported(category) {
  const config = CATEGORY_CONFIG[category.toLowerCase()];
  return config?.ticketmaster != null;
}

/**
 * Get display name for a category
 * @param {string} category - Category name
 * @returns {string}
 */
export function getCategoryDisplayName(category) {
  const config = CATEGORY_CONFIG[category.toLowerCase()];
  return config?.displayName || category;
}

/**
 * Normalize category name (handle aliases)
 * @param {string} category - Input category name
 * @returns {string} Normalized category name
 */
export function normalizeCategory(category) {
  const input = category.toLowerCase().trim();
  
  // Direct match
  if (CATEGORY_CONFIG[input]) {
    return input;
  }
  
  // Check aliases in keywords
  for (const [catName, config] of Object.entries(CATEGORY_CONFIG)) {
    if (config.keywords.some(k => k.toLowerCase() === input)) {
      return catName;
    }
  }
  
  // Common aliases — used for both incoming categories AND bucket filtering
  const aliases = {
    'theater': 'theatre',
    'performing arts': 'theatre',
    'performance art': 'theatre',
    'musical': 'theatre',
    'broadway': 'theatre',
    'opera': 'theatre',
    'dance': 'theatre',
    'concerts': 'music',
    'concert': 'music',
    'live music': 'music',
    'film': 'movies',
    'cinema': 'movies',
    'screening': 'movies',
    'standup': 'comedy',
    'stand-up': 'comedy',
    'improv': 'comedy',
    'comedian': 'comedy',
    'family': 'kids',
    'children': 'kids',
    'workshops': 'lectures',
    'workshop': 'lectures',
    'seminars': 'lectures',
    'seminar': 'lectures',
    'talks': 'lectures',
    'lecture': 'lectures',
    'conference': 'lectures',
    'technology': 'tech',
    'ai': 'tech',
    'artificial-intelligence': 'tech',
    'programming': 'tech',
    'culinary': 'food',
    'wine': 'food',
    'dining': 'food',
    'desi': 'desi',
    'indian': 'desi',
    'south asian': 'desi',
    'south-asian': 'desi',
    'bollywood': 'desi',
    'bhangra': 'desi',
    'garba': 'desi',
    'dandiya': 'desi',
    'holi': 'desi',
    'diwali': 'desi',
    'punjabi': 'desi',
    'gujarati': 'desi',
    'tamil': 'desi',
    'telugu': 'desi',
    'hindi': 'desi',
    'urdu': 'desi',
    'kathak': 'desi',
    'bharatanatyam': 'desi',
    'kollywood': 'desi',
    'tollywood': 'desi',
    'galleries': 'art',
    'gallery': 'art',
    'museums': 'art',
    'museum': 'art',
    'exhibitions': 'art',
    'exhibition': 'art',
    'visual arts': 'art',
    'fine art': 'art',
    'arts': 'art',
    'sports': 'sports',
    'sport': 'sports',
    'general': 'general'
  };
  
  return aliases[input] || input;
}

/**
 * Get all category info for API responses
 * @returns {Object[]} Array of category info objects
 */
export function getAllCategoryInfo() {
  return SUPPORTED_CATEGORIES.map(cat => ({
    id: cat,
    displayName: CATEGORY_CONFIG[cat].displayName,
    description: CATEGORY_CONFIG[cat].description,
    priority: CATEGORY_CONFIG[cat].priority,
    ticketmasterSupported: CATEGORY_CONFIG[cat].ticketmaster != null
  }));
}

export default {
  CATEGORY_CONFIG,
  SUPPORTED_CATEGORIES,
  getTicketmasterClassification,
  getSearchQueries,
  getPreferredDomains,
  getCategoryKeywords,
  isTicketmasterSupported,
  getCategoryDisplayName,
  normalizeCategory,
  getAllCategoryInfo
};
