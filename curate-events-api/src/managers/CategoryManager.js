/**
 * =============================================================================
 * SCRIPT NAME: CategoryManager.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Category configuration manager for event categorization and normalization.
 * Central source of truth for category definitions and aliases.
 * 
 * FEATURES:
 * - Category-specific prompt templates
 * - Location-based optimizations
 * - Time range handling
 * - Prompt validation and optimization
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-29
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('CategoryManager');

export class CategoryManager {
  constructor() {
    // Proven category mappings from successful tests
    this.categories = {
      theatre: {
        aliases: ['theater', 'plays', 'broadway', 'off-broadway', 'drama'],
        keywords: ['theatre', 'theater', 'plays', 'broadway', 'off-broadway', 'drama', 'musical', 'performance', 'stage'],
        priority: 'high'
      },
      music: {
        aliases: ['concerts', 'shows', 'bands', 'artists', 'performances'],
        keywords: ['concert', 'music', 'band', 'artist', 'live', 'performance', 'show', 'tour'],
        priority: 'high'
      },
      comedy: {
        aliases: ['standup', 'stand-up', 'improv', 'humor'],
        keywords: ['comedy', 'standup', 'stand-up', 'improv', 'humor', 'funny', 'comedian'],
        priority: 'medium'
      },
      food: {
        aliases: ['culinary', 'dining', 'restaurants', 'festivals'],
        keywords: ['food', 'culinary', 'dining', 'restaurant', 'festival', 'tasting', 'cooking'],
        priority: 'medium'
      },
      art: {
        aliases: ['galleries', 'exhibitions', 'museums', 'visual', 'arts', 'performing-arts', 'fine-arts'],
        keywords: ['art', 'gallery', 'exhibition', 'museum', 'visual', 'painting', 'sculpture'],
        priority: 'medium'
      },
      sports: {
        aliases: ['games', 'matches', 'athletics', 'teams'],
        keywords: ['sports', 'game', 'match', 'athletics', 'team', 'competition', 'tournament'],
        priority: 'low'
      },
      kids: {
        aliases: ['family', 'children', 'family-friendly', 'all-ages', 'toddler'],
        keywords: ['kids', 'family', 'children', 'family-friendly', 'all ages', 'parent', 'toddler', 'youth'],
        priority: 'medium'
      },
      lectures: {
        aliases: ['talks', 'presentations', 'seminars', 'workshops', 'discussions', 'education'],
        keywords: ['lecture', 'talk', 'presentation', 'seminar', 'workshop', 'discussion', 'speaker', 'author', 'educational'],
        priority: 'medium'
      },
      tech: {
        aliases: ['technology', 'startup', 'innovation', 'digital', 'ai', 'software'],
        keywords: ['tech', 'technology', 'startup', 'innovation', 'digital', 'ai', 'software', 'conference', 'meetup', 'hackathon'],
        priority: 'medium'
      },
      education: {
        aliases: ['learning', 'academic', 'school', 'university', 'courses'],
        keywords: ['education', 'learning', 'academic', 'school', 'university', 'course', 'class', 'training'],
        priority: 'medium'
      },
      movies: {
        aliases: ['films', 'cinema', 'movie theaters', 'showtimes', 'screenings'],
        keywords: ['movie', 'film', 'cinema', 'theater', 'screening', 'showtime', 'premiere'],
        priority: 'high'
      }
      // NOTE: Old categories removed (technology, finance, psychology, AI, business, science)
      // These are now consolidated: technology/AI → tech; business → tech; 
      // finance/psychology/science → too niche, removed
    };

    // JSON-formatted query templates for structured data
    // NOTE: Venue-specific information comes from the whitelist file (data/venue-whitelist.xlsx)
    // These templates are kept generic - ExaClient and SerperClient inject venue domains dynamically
    this.queryTemplates = {
      theatre: `Find ALL theatre events for {location} for the {dateRange}. Include plays, musicals, Broadway shows, opera, ballet, and all live theatrical performances.

Provide results in JSON format:
[
  {
    "title": "Show Title",
    "venue": "Theatre Name",
    "location": "City, State", 
    "date": "Date range or specific dates",
    "show_times": ["Time 1", "Time 2"],
    "website": "https://venue-website.com",
    "price_range": "Price information or Free",
    "description": "Brief description"
  }
]

Provide actual real events with accurate information.`,

      music: `Find all music events and concerts for {location} for the {dateRange}. Include major concerts, local shows, club performances, festivals, classical music, jazz, rock, pop, indie, and all musical events.

Provide results in JSON format:
[
  {
    "title": "Artist/Band Name or Event Title",
    "venue": "Venue Name",
    "location": "City, State",
    "date": "Date range or specific dates", 
    "show_times": ["Time 1", "Time 2"],
    "website": "https://venue-website.com",
    "price_range": "Price information or Free",
    "genre": "Music genre"
  }
]

Provide actual real events with accurate information.`,

      comedy: `Find all comedy events for {location} for the {dateRange}. Include comedy clubs, stand-up shows, improv performances, comedy nights, and all comedy events.

Provide results in JSON format:
[
  {
    "title": "Comedian Name or Show Title",
    "venue": "Venue Name", 
    "location": "City, State",
    "date": "Date range or specific dates",
    "show_times": ["Time 1", "Time 2"], 
    "website": "https://venue-website.com",
    "price_range": "Price information or Free",
    "show_type": "Stand-up, Improv, etc."
  }
]

Provide actual real events with accurate information.`,

      food: `Find all food events for {location} for the {dateRange} - give me the results in JSON format with the following structure. Include food festivals, wine tastings, cooking classes, pop-up restaurants, and all culinary events:

[
  {
    "title": "Event Name",
    "venue": "Venue Name",
    "location": "City, State",
    "date": "Date range or specific dates",
    "show_times": ["Time 1", "Time 2"],
    "website": "https://venue-website.com", 
    "price_range": "Price information or Free",
    "cuisine_type": "Cuisine or event type"
  }
]

Provide actual real events with accurate information.`,

      art: `Find all art events for {location} for the {dateRange} - give me the results in JSON format with the following structure. Include museums, galleries, art centers, public art events, and all art-related activities:

[
  {
    "title": "Exhibition Title",
    "venue": "Gallery/Museum Name",
    "location": "City, State", 
    "date": "Date range or specific dates",
    "show_times": ["Opening hours"],
    "website": "https://venue-website.com",
    "price_range": "Admission price or Free",
    "artist_info": "Artist information"
  }
]

Provide actual real events with accurate information.`,

      sports: `Find all sports events for {location} for the {dateRange} - give me the results in JSON format with the following structure. Include professional games, college sports, recreational events, and all sporting activities:

[
  {
    "title": "Teams or Event Name",
    "venue": "Stadium/Arena Name",
    "location": "City, State",
    "date": "Date range or specific dates", 
    "show_times": ["Game time"],
    "website": "https://venue-website.com",
    "price_range": "Ticket price range",
    "sport_type": "Sport name"
  }
]

Provide actual real events with accurate information.`,

      lectures: `Find all public lectures, talks, and presentations for {location} for the {dateRange}. Include author talks, academic lectures, public discussions, seminars, book readings, and all speaking events.

Provide results in JSON format:
[
  {
    "title": "Speaker Name or Talk Title",
    "venue": "Venue Name",
    "location": "City, State",
    "date": "Date range or specific dates",
    "show_times": ["Time 1", "Time 2"],
    "website": "https://venue-website.com",
    "price_range": "Price information or Free",
    "topic": "Subject or theme"
  }
]

Provide actual real events with accurate information.`,

      kids: `Find all family-friendly and kids events for {location} for the {dateRange}. Include children's activities, family shows, kids workshops, family festivals, museum programs, and all-ages events.

Provide results in JSON format:
[
  {
    "title": "Event Title",
    "venue": "Venue Name",
    "location": "City, State",
    "date": "Date range or specific dates",
    "show_times": ["Time 1", "Time 2"],
    "website": "https://venue-website.com",
    "price_range": "Price information or Free",
    "age_range": "Recommended ages",
    "description": "Brief description"
  }
]

Provide actual real events with accurate information.`,

      tech: `Find all technology and innovation events for {location} for the {dateRange}. Include tech conferences, startup events, hackathons, AI/ML meetups, software launches, and innovation showcases.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Technology focus area"
}
]

Search thoroughly for tech conferences, meetups, product launches, and innovation events.`,

      education: `Find all educational and learning events for {location} for the {dateRange}. Include university lectures, workshops, courses, seminars, academic conferences, and learning opportunities.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Educational focus area"
}
]

Search thoroughly for lectures, courses, workshops, and educational events.`,

      movies: `Find all movies currently playing and coming soon for {location} for the {dateRange}. Include major theater chains, independent cinemas, drive-ins, and special screenings.

Provide results in JSON format:
[
{
  "title": "Movie Title (Year)",
  "venue": "Theater Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2", "Time 3"],
  "website": "https://theater-website.com",
  "price_range": "Ticket price range",
  "description": "Brief movie description",
  "genre": "Movie genre",
  "rating": "Movie rating (G, PG, PG-13, R, etc.)",
  "runtime": "Duration in minutes"
}
]

Search each theater thoroughly for current movies, showtimes, and special screenings. Include both mainstream releases and indie films. Provide actual real movies with accurate showtimes.`,

      // Legacy personalized category templates (kept for backward compatibility)
      technology: `Find all technology and programming events for {location} for the {dateRange}. Focus on Python programming, data science, machine learning, software development, and coding workshops.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Programming/Tech focus area"
}
]

Search thoroughly for programming workshops, coding bootcamps, tech meetups, and software development events.`,

      finance: `Find all finance and investment events for {location} for the {dateRange}. Focus on stock market analysis, trading strategies, fintech, investment seminars, and financial planning workshops.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Finance focus area"
}
]

Search thoroughly for investment seminars, trading workshops, fintech events, and financial education sessions.`,

      automotive: `Find all automotive and electric vehicle events for {location} for the {dateRange}. Focus on Tesla meetups, EV technology, car shows, automotive innovation, and electric vehicle conferences.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Automotive focus area"
}
]

Search thoroughly for Tesla events, EV meetups, car shows, and automotive technology conferences.`,

      'data-analysis': `Find all data science and analytics events for {location} for the {dateRange}. Focus on data visualization, statistical analysis, business intelligence, Python data science, and analytics workshops.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Data analysis focus area"
}
]

Search thoroughly for data science workshops, analytics seminars, visualization training, and statistical analysis events.`,

      business: `Find all business and entrepreneurship events for {location} for the {dateRange}. Focus on startup networking, business strategy, leadership development, and professional networking events.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Business focus area"
}
]

Search thoroughly for networking events, business seminars, startup meetups, and professional development workshops.`,

      science: `Find all science and research events for {location} for the {dateRange}. Focus on scientific conferences, research presentations, laboratory tours, and innovation showcases.

Provide results in JSON format:
[
{
  "title": "Event Title",
  "venue": "Venue Name",
  "location": "City, State",
  "date": "Date range or specific dates",
  "show_times": ["Time 1", "Time 2"],
  "website": "https://event-website.com",
  "price_range": "Price information or Free",
  "description": "Brief description",
  "topic": "Science focus area"
}
]

Search thoroughly for scientific conferences, research presentations, lab tours, and STEM events.`,
      
      psychology: `Find psychology and mental health related events for {location} for the {dateRange}. Include university department talks, research seminars, clinical workshops, professional society meetings, and community mental health events.

Return JSON with:
[
  {
    "title": "Talk/Workshop Name",
    "venue": "Organization/University/Clinic",
    "location": "City, State",
    "date": "Date or range",
    "show_times": ["Time 1", "Time 2"],
    "website": "https://event-url",
    "price_range": "Free or price",
    "topic": "Psychology/Mental Health focus"
  }
]

Focus on real, upcoming events with accurate details.`,

      'artificial-intelligence': `Find artificial intelligence events for {location} for the {dateRange}. Include conferences, meetups, hackathons, workshops, research seminars, and industry talks. Prioritize events with registration links (tickets/RSVP).

Return JSON with:
[
  {
    "title": "Event Name",
    "venue": "Venue/Organization",
    "location": "City, State",
    "date": "Date or range",
    "show_times": ["Time 1", "Time 2"],
    "website": "https://event-url",
    "price_range": "Free or price",
    "topic": "AI subfield (LLM/NLP/CV/MLops/etc.)"
  }
]

Include concrete, verifiable events with URLs and dates.`,

      default: `Find all {category} events for {location} for the {dateRange} - give me the results in JSON format with delimiters for title, venue, location, date, show_times, website, and price_range. Provide actual real events with accurate information.`
    };

    // Default date ranges
    this.dateRanges = {
      'this weekend': 'this weekend',
      'next week': 'next week',
      'next month': 'the next month',
      'next 30 days': 'the next 30 days',
      'today': 'today',
      'tomorrow': 'tomorrow'
    };
  }

  /**
   * Get normalized category name
   * @param {string} category - Input category
   * @returns {string} Normalized category
   */
  normalizeCategory(category) {
    const normalized = category.toLowerCase().trim();
    
    // Handle common variations first
    const commonVariations = {
      'theater': 'theatre',
      'food and drink': 'food',
      'food & drink': 'food',
      'food-and-drink': 'food',
      'food/drink': 'food',
      'culinary': 'food',
      'dining': 'food',
      'restaurants': 'food',
      'standup': 'comedy',
      'stand-up': 'comedy',
      'talks': 'lectures',
      'presentations': 'lectures',
      'seminars': 'lectures',
      'workshops': 'lectures',
      'galleries': 'art',
      'exhibitions': 'art',
      'visual': 'art',
      'arts': 'art',
      'performing-arts': 'art',
      'fine-arts': 'art',
      'films': 'movies',
      'cinema': 'movies',
      'movie theaters': 'movies',
      'showtimes': 'movies',
      'screenings': 'movies',
      // Backward compatibility mappings for replaced categories
      'automotive': 'psychology',
      'data-analysis': 'artificial-intelligence',
      'data analysis': 'artificial-intelligence'
    };
    
    if (commonVariations[normalized]) {
      return commonVariations[normalized];
    }
    
    // Check direct match
    if (this.categories[normalized]) {
      return normalized;
    }
    
    // Check aliases
    for (const [categoryName, config] of Object.entries(this.categories)) {
      if (config.aliases.includes(normalized)) {
        return categoryName;
      }
    }
    
    logger.warn('Unknown category, using default', { category });
    return 'general';
  }

  /**
   * Build optimized query using proven patterns
   * @param {Object} params - Query parameters
   * @param {string} params.category - Event category
   * @param {string} params.location - Location string
   * @param {string} params.dateRange - Optional date range
   * @returns {string} Optimized query string
   */
  buildQuery({ category, location, dateRange = 'next 30 days' }) {
    const normalizedCategory = this.normalizeCategory(category);
    const processedLocation = this.processLocation(location);
    const processedDateRange = this.processDateRange(dateRange);
    
    // Get template for category
    const template = this.queryTemplates[normalizedCategory] || this.queryTemplates.default;
    
    // Replace placeholders
    const query = template
      .replace('{location}', processedLocation)
      .replace('{dateRange}', processedDateRange)
      .replace('{category}', normalizedCategory);
    
    logger.info('Built optimized query', {
      category: normalizedCategory,
      location: processedLocation,
      dateRange: processedDateRange,
      queryLength: query.length
    });
    
    return query;
  }

  /**
   * Process location string for optimal queries
   * @param {string} location - Raw location string
   * @returns {string} Processed location
   */
  processLocation(location) {
    if (!location) {
      logger.warn('No location provided, using default');
      return 'San Francisco, CA';
    }
    
    // Clean and normalize location
    const cleaned = location.trim();
    
    // Add common variations for better results
    const cityName = cleaned.split(',')[0].trim();
    const stateName = cleaned.split(',')[1]?.trim();
    
    if (stateName) {
      return `${cityName}, ${stateName}`;
    }
    
    // If no state provided, try to infer or add context
    const locationMappings = {
      'nyc': 'New York City, NY',
      'sf': 'San Francisco, CA',
      'la': 'Los Angeles, CA',
      'chicago': 'Chicago, IL',
      'boston': 'Boston, MA',
      'seattle': 'Seattle, WA'
    };
    
    const normalized = cityName.toLowerCase();
    return locationMappings[normalized] || cleaned;
  }

  /**
   * Process date range for optimal queries
   * @param {string} dateRange - Raw date range
   * @returns {string} Processed date range
   */
  processDateRange(dateRange) {
    if (!dateRange) {
      return 'the next 30 days';
    }
    
    const normalized = dateRange.toLowerCase().trim();
    
    // Use predefined ranges if available
    if (this.dateRanges[normalized]) {
      return this.dateRanges[normalized];
    }
    
    return dateRange;
  }

  /**
   * Get category configuration
   * @param {string} category - Category name
   * @returns {Object} Category configuration
   */
  getCategoryConfig(category) {
    const normalized = this.normalizeCategory(category);
    return this.categories[normalized] || {
      aliases: [],
      keywords: [normalized],
      priority: 'low'
    };
  }

  /**
   * Get all supported categories
   * @returns {Array} List of supported categories
   */
  getSupportedCategories() {
    return Object.keys(this.categories).map(category => ({
      name: category,
      aliases: this.categories[category].aliases,
      priority: this.categories[category].priority
    }));
  }

  /**
   * Validate query parameters
   * @param {Object} params - Parameters to validate
   * @param {Object} options - Optional flags (e.g., { allowMissingLocation: true })
   * @returns {Object} Validation result
   */
  validateQuery(params, options = {}) {
    const errors = [];
    const warnings = [];
    const allowMissingLocation = Boolean(options.allowMissingLocation);
    
    // Check required parameters
    if (!params.category) {
      errors.push('Category is required');
    }
    
    if (!params.location) {
      if (allowMissingLocation) {
        warnings.push('Location omitted due to custom prompt override');
      } else {
        errors.push('Location is required');
      }
    }
    
    // Check category validity
    if (params.category) {
      const normalized = this.normalizeCategory(params.category);
      if (normalized === 'general') {
        warnings.push('Using general category - consider using a specific category for better results');
      }
    }
    
    // Check location format (only when provided)
    if (params.location && params.location.length < 2) {
      errors.push('Location must be at least 2 characters');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedCategory: params.category ? this.normalizeCategory(params.category) : null
    };
  }

  /**
   * Get optimization suggestions for better results
   * @param {Object} params - Query parameters
   * @returns {Array} Optimization suggestions
   */
  getOptimizationSuggestions(params) {
    const suggestions = [];
    
    if (params.category) {
      const config = this.getCategoryConfig(params.category);
      if (config.priority === 'low') {
        suggestions.push(`Consider using high-priority categories (theatre, music) for better results`);
      }
    }
    
    if (params.location && !params.location.includes(',')) {
      suggestions.push('Adding state/country to location may improve results');
    }
    
    if (!params.dateRange || params.dateRange === 'next 30 days') {
      suggestions.push('Using specific date ranges (this weekend, next week) may yield more targeted results');
    }
    
    return suggestions;
  }

  /**
   * Get venue-to-category mapping for high-confidence categorization
   * Uses generic venue patterns that work across all locations
   * @returns {Object} Venue category mappings with generic patterns
   */
  getVenueCategoryMap() {
    return {
      music: [
        // Generic venue types
        'symphony hall', 'opera house', 'jazz club', 'amphitheater', 'amphitheatre',
        'conservatory', 'music hall', 'concert hall', 'music center', 'philharmonic',
        'auditorium', 'arena', 'coliseum', 'pavilion', 'bandshell',
        // Common venue name patterns
        'civic center', 'performing arts', 'music venue', 'concert venue',
        // Chain venues
        'house of blues', 'blue note', 'fillmore', 'greek theatre'
      ],
      theatre: [
        // Generic theater types
        'theatre', 'theater', 'playhouse', 'performing arts center', 'drama center',
        'repertory', 'rep theatre', 'community theater', 'opera house',
        // Common patterns
        'stage', 'drama', 'broadway', 'off-broadway', 'west end'
      ],
      art: [
        // Art venue types
        'museum', 'gallery', 'art center', 'contemporary art', 'modern art',
        'sculpture garden', 'exhibition hall', 'cultural center',
        // Common patterns
        'moma', 'guggenheim', 'whitney', 'tate', 'louvre'
      ],
      food: [
        // Food venue types
        'restaurant', 'culinary institute', 'food festival', 'wine country',
        'farmers market', 'food hall', 'tasting room', 'brewery', 'winery',
        'culinary center', 'cooking school', 'food court'
      ],
      movies: [
        // Cinema types
        'cinema', 'movie theater', 'movie theatre', 'cineplex', 'multiplex',
        'drive-in', 'film center', 'screening room', 'imax',
        // Chain theaters
        'amc', 'regal', 'cinemark', 'landmark', 'showcase'
      ],
      tech: [
        // Tech venues
        'convention center', 'expo center', 'tech center', 'innovation hub',
        'startup campus', 'conference center', 'meetup space'
      ],
      education: [
        // Educational venues
        'university', 'college', 'school', 'library', 'lecture hall',
        'academic center', 'learning center', 'institute'
      ]
    };
  }

  /**
   * Get all category keywords for content analysis
   * @returns {Object} All category keywords
   */
  getAllCategoryKeywords() {
    const keywords = {};
    Object.entries(this.categories).forEach(([category, config]) => {
      keywords[category] = config.keywords || [];
    });
    return keywords;
  }
}

export default CategoryManager;