/**
 * =============================================================================
 * SCRIPT NAME: CategoryManager.js
 * =============================================================================
 * 
 * DESCRIPTION:
 * Category and prompt configuration manager for optimized Perplexity queries.
 * Based on proven patterns from test-direct-perplexity.js that return 30+ events.
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
        aliases: ['galleries', 'exhibitions', 'museums', 'visual'],
        keywords: ['art', 'gallery', 'exhibition', 'museum', 'visual', 'painting', 'sculpture'],
        priority: 'medium'
      },
      sports: {
        aliases: ['games', 'matches', 'athletics', 'teams'],
        keywords: ['sports', 'game', 'match', 'athletics', 'team', 'competition', 'tournament'],
        priority: 'low'
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
    };

    // JSON-formatted query templates for structured data
    this.queryTemplates = {
      theatre: `Find ALL theatre events for {location} for the {dateRange}. Search these specific venues and any other theatre venues in the Bay Area:

MAJOR VENUES TO SEARCH:
- Golden Gate Theatre (San Francisco) - https://www.broadwaysf.com
- War Memorial Opera House (San Francisco) - https://www.sfopera.com  
- San Francisco Playhouse (San Francisco) - https://www.sfplayhouse.org
- Brava Theater Center (San Francisco) - https://www.brava.org
- Blue Shield of California Theater at YBCA (San Francisco) - https://ybca.org
- Herbst Theatre (San Francisco) - https://www.cityboxoffice.com
- A.C.T. Strand Theater (San Francisco) - https://www.act-sf.org
- New Conservatory Theatre Center (San Francisco) - https://www.nctcsf.org
- Fox Theater Oakland - https://thefoxoakland.com
- The Greek Theatre UC Berkeley - https://calperformances.org
- San Jose Center for the Performing Arts - https://broadwaysanjose.com
- Paramount Theatre Oakland - https://www.paramountoakland.org
- Cal Performances Zellerbach Hall Berkeley - https://calperformances.org
- Berkeley Playhouse - https://berkeleyplayhouse.org
- Oakland Theater Project - https://oaklandtheaterproject.org
- Live Oak Theater TheatreFirst Berkeley - https://www.theatrefirst.com
- Berkeley Roda Theatre Berkeley Rep - https://www.berkeleyrep.org
- Marin Center Showcase Theater San Rafael - https://www.marincenter.org
- Stanford Theatre Palo Alto - https://stanfordtheatre.org
- Mountain View Center for the Performing Arts - https://mvcpa.com
- Marin Theatre Company Mill Valley - https://www.marintheatre.org
- TheatreWorks Silicon Valley Lucie Stern Theatre Palo Alto - https://www.theatreworks.org

Give me a COMPREHENSIVE list in JSON format with events from these venues:

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

Search each venue thoroughly for current shows, upcoming productions, and events. Provide actual real events with accurate information.`,

      music: `Find all music events and concerts for {location} for the {dateRange} - give me the results in JSON format with the following structure. Include major concerts, local shows, club performances, festivals, classical music, jazz, rock, pop, indie, and all musical events.

Search these specific music venues and any other music venues in the Bay Area:

MAJOR MUSIC VENUES TO SEARCH:
- Bill Graham Civic Auditorium (San Francisco) - https://billgrahamcivicauditorium.com
- The Fillmore (San Francisco) - https://thefillmore.com
- Great American Music Hall (San Francisco) - https://gamh.com
- Chase Center (San Francisco) - https://chasecenter.com
- SFJAZZ Center (San Francisco) - https://sfjazz.org
- The Warfield (San Francisco) - https://thewarfieldtheatre.com
- The Regency Ballroom (San Francisco) - https://theregencyballroom.com
- The Independent (San Francisco) - https://theindependentsf.com
- The Masonic (San Francisco) - https://masonicsf.com
- Stern Grove Festival Sigmund Stern Grove (San Francisco) - https://sterngrove.org
- Oracle Park (San Francisco) - https://mlb.com/giants/ballpark
- Golden Gate Park Bandshell (San Francisco) - https://illuminatesf.org/bandshell
- Shoreline Amphitheatre (Mountain View) - https://livenation.com/venue/KovZpZAEkeJA/shoreline-amphitheatre-tickets
- Greek Theatre UC Berkeley - https://calperformances.org
- Fox Theater Oakland - https://thefoxoakland.com
- Paramount Theatre Oakland - https://paramountoakland.org
- Oakland Arena - https://oaklandarena.com
- The New Parish Oakland - https://thenewparish.com
- SAP Center San Jose - https://sapcenter.com
- San Jose Civic - https://sanjosecivic.com
- Levi's Stadium Santa Clara - https://levisstadium.com
- Mountain Winery Saratoga - https://mountainwinery.com
- The Guild Theatre Menlo Park - https://theguildtheatre.com

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

Search each venue thoroughly for concerts, shows, and musical events. Provide actual real events with accurate information.`,

      comedy: `Find all comedy events for {location} for the {dateRange} - give me the results in JSON format with the following structure. Include comedy clubs, theaters, bars with comedy nights, improv shows, and all comedy events.

Search these specific comedy venues and any other comedy venues in the Bay Area:

MAJOR COMEDY VENUES TO SEARCH:
- Cobb's Comedy Club (San Francisco) - https://cobbscomedyclub.com
- The Punchline (San Francisco) - https://punchlinecomedyclub.com
- American Conservatory Theater (San Francisco) - https://www.act-sf.org
- Punch Line Sacramento (Sacramento) - https://punchlinecomedyclub.com
- Tommy T's Comedy Club (Pleasanton) - https://tommyts.com
- Rooster T. Feathers Comedy Club (Sunnyvale) - https://roostertfeathers.com
- Comedy Oakland (Oakland) - https://comedyoakland.com
- San Jose Improv (San Jose) - https://sanjose.improv.com
- Helium Comedy Club (San Jose) - https://heliumcomedy.com
- The Comedy Spot (Sacramento) - https://thecomedyspot.net
- Sacramento Comedy Spot (Sacramento) - https://saccomedyspot.com
- Laugh Track Comedy Club (San Jose) - https://laughtrackcomedy.com

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

Search each venue thoroughly for comedy shows, stand-up performances, and improv events. Provide actual real events with accurate information.`,

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

      lectures: `Find all public lectures, talks, and presentations for {location} for the {dateRange} - give me the results in JSON format with the following structure. Include author talks, academic lectures, public discussions, seminars, and all speaking events.

Search these specific lecture venues and any other venues hosting lectures in the Bay Area:

MAJOR LECTURE VENUES TO SEARCH:
- City Arts & Lectures (San Francisco) - https://www.cityarts.net
- Commonwealth Club of California (San Francisco) - https://www.commonwealthclub.org
- KQED Live (San Francisco) - https://www.kqed.org/live
- Profs and Pints Bay Area (San Francisco, Alameda, and Napa) - https://www.profsandpints.com/sfbayarea
- The Long Now Foundation / The Interval (San Francisco) - https://longnow.org
- Manny's SF (San Francisco) - https://www.welcometomannys.com
- San Francisco Public Library (San Francisco) - https://sfpl.org
- SLAC Public Lectures (Menlo Park) - https://www6.slac.stanford.edu/news-and-events/events/public-lectures
- SFJAZZ Center (San Francisco) - https://www.sfjazz.org
- Randall Museum Theater (San Francisco) - https://randallmuseum.org
- Omnivore Books on Food (San Francisco) - https://www.omnivorebooks.com
- CIIS Public Programs (San Francisco) - https://www.ciis.edu/public-programs
- Stanford Live / University Public Lectures (Stanford) - https://live.stanford.edu
- Cal Performances (Berkeley) - https://calperformances.org
- Wonderfest (San Francisco Bay Area) - https://wonderfest.org

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

Search each venue thoroughly for lectures, talks, author events, and presentations. Provide actual real events with accurate information.`,

      tech: `Find all technology and innovation events for {location} for the {dateRange}. Include tech conferences, startup events, hackathons, AI/ML meetups, software launches, and innovation showcases.

Search these tech venues and any other innovation spaces:

MAJOR TECH VENUES TO SEARCH:
- Moscone Center (San Francisco) - https://moscone.com
- Salesforce Tower (San Francisco)
- Google Campus (Mountain View)
- Meta Campus (Menlo Park)
- Apple Park (Cupertino)
- Stanford University (Palo Alto)
- UC Berkeley (Berkeley)
- TechCrunch Disrupt venues
- Various co-working spaces and startup hubs

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

Search these educational venues and institutions:

MAJOR EDUCATIONAL VENUES TO SEARCH:
- Stanford University (Palo Alto) - https://stanford.edu
- UC Berkeley (Berkeley) - https://berkeley.edu
- UC San Francisco (San Francisco) - https://ucsf.edu
- San Francisco State University - https://sfsu.edu
- City College of San Francisco - https://ccsf.edu
- Various libraries and community centers
- Educational conferences and workshops

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

Search these specific movie theaters and any other cinemas in the Bay Area:

MAJOR MOVIE THEATERS TO SEARCH:
- AMC Metreon 16 (San Francisco) - https://www.amctheatres.com
- Century Theaters San Francisco Centre 9 - https://www.centurytheaters.com
- Landmark Theatres (San Francisco) - https://www.landmarktheatres.com
- The Castro Theatre (San Francisco) - https://thecastrotheatre.com
- Roxie Theater (San Francisco) - https://www.roxie.com
- Clay Theater (San Francisco) - https://www.landmarktheatres.com
- Balboa Theatre (San Francisco) - https://www.landmarktheatres.com
- Embarcadero Center Cinema - https://www.landmarktheatres.com
- Opera Plaza Cinema (San Francisco) - https://www.landmarktheatres.com
- Century 20 Daly City - https://www.centurytheaters.com
- Century at Pacific Commons (Fremont) - https://www.centurytheaters.com
- AMC NewPark 12 (Newark) - https://www.amctheatres.com
- Century 16 Mountain View - https://www.centurytheaters.com
- AMC Saratoga 14 - https://www.amctheatres.com
- Century 20 Oakridge (San Jose) - https://www.centurytheaters.com
- Cinemark Century Theaters 16 (Union City) - https://www.cinemark.com
- Century 25 Union Landing (Union City) - https://www.centurytheaters.com
- Century Theaters 20 Great Mall (Milpitas) - https://www.centurytheaters.com

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
      'films': 'movies',
      'cinema': 'movies',
      'movie theaters': 'movies',
      'showtimes': 'movies',
      'screenings': 'movies'
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
   * @returns {Object} Validation result
   */
  validateQuery(params) {
    const errors = [];
    const warnings = [];
    
    // Check required parameters
    if (!params.category) {
      errors.push('Category is required');
    }
    
    if (!params.location) {
      errors.push('Location is required');
    }
    
    // Check category validity
    if (params.category) {
      const normalized = this.normalizeCategory(params.category);
      if (normalized === 'general') {
        warnings.push('Using general category - consider using a specific category for better results');
      }
    }
    
    // Check location format
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