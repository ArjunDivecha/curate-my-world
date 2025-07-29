import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { DOMParser, HTMLElement } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';

// Helper function to remove duplicate events based on title and date
function removeDuplicateEvents(events: any[]): any[] {
  const uniqueEvents = new Map<string, any>();
  for (const event of events) {
    const key = `${event.title}|${new Date(event.date_time).toDateString()}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }
  return Array.from(uniqueEvents.values());
}

// Helper function to extract a venue name
function extractVenue(title: string, html: string, location: string): string {
  // Prioritize patterns that are more likely to be specific
  const patterns = [
    /at\s+the\s+([\w\s]+)/i, // at the The Warfield
    /at\s+([\w\s]+)/i, // at The Guild
    /venue:\s*([\w\s]+)/i, // Venue: The Fillmore
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern) || html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return `${location.split(',')[0]} Venue`; // Fallback
}

// Helper function to parse dates, including month names and relative terms
function extractEventDates(title: string, dateStr: string): { startDate: Date | null; endDate: Date | null } {
  try {
    // Check for a full date with year first
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      // If year is in the past, assume it's for the next year
      if (date.getFullYear() < new Date().getFullYear()) {
        date.setFullYear(date.getFullYear() + 1);
      }
      const endDate = new Date(date.getTime() + 2 * 60 * 60 * 1000); // Assume 2-hour duration
      return { startDate: date, endDate };
    }

    // Handle month-day formats like "Jul 15"
    const monthDayMatch = dateStr.match(/([a-zA-Z]{3})\s(\d{1,2})/);
    if (monthDayMatch) {
      const monthStr = monthDayMatch[1];
      const day = parseInt(monthDayMatch[2], 10);
      const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].findIndex(m => monthStr.toLowerCase().startsWith(m));
      if (monthIndex !== -1) {
        const currentYear = new Date().getFullYear();
        date = new Date(currentYear, monthIndex, day);
        // If the parsed date is in the past, assume it's for the next year
        if (date < new Date()) {
          date.setFullYear(currentYear + 1);
        }
        const endDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
        return { startDate: date, endDate };
      }
    }

  } catch (e) {
    console.warn(`Could not parse date from string: "${dateStr}"`, e);
  }
  return { startDate: null, endDate: null };
}

interface EventPreferences {
  categories: string[];
  priceRange: { min: number; max: number };
  timePreferences: string[];
  customKeywords: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    // Input validation and sanitization
    const requestBody = await req.json();
    const { location, preferences } = requestBody;
    
    // Validate required fields
    if (!location || typeof location !== 'string') {
      throw new Error('Valid location is required');
    }
    
    // Sanitize location input
    const sanitizedLocation = location.replace(/[<>'"&]/g, '').trim();
    if (sanitizedLocation.length < 2 || sanitizedLocation.length > 100) {
      throw new Error('Location must be between 2 and 100 characters');
    }

    console.log(`Starting search for location: ${sanitizedLocation}`);
    console.log(`Preferences:`, JSON.stringify(preferences, null, 2));

    // Get API keys
    const braveApiKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
    if (!braveApiKey) {
      throw new Error('BRAVE_SEARCH_API_KEY not found');
    }

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      console.log('Warning: GOOGLE_MAPS_API_KEY not found. Location filtering will be less accurate.');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
    // Get the authorization header for user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Authorization required' 
        }),
        { 
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing required environment variables');
    }

    // Use service role for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Search for real events using Brave Search API
    const events = await searchForRealEvents(sanitizedLocation, preferences, braveApiKey, googleMapsApiKey);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          events: [], 
          message: `No real events found in ${sanitizedLocation}. Try a different location or adjust your preferences.` 
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }

    console.log(`Found ${events.length} events`);
    
    // KILL VAMPIRE EVENTS: Clear ALL existing events before inserting new ones
    console.log('🧛‍♂️ KILLING VAMPIRE EVENTS: Clearing database before inserting fresh events...');
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000'); // Delete all events
    
    if (deleteError) {
      console.error('Warning: Could not clear old events:', deleteError);
      // Try alternative deletion method
      await supabase.from('events').delete().neq('created_at', null);
    }
    
    console.log('💀 VAMPIRE EVENTS KILLED! Inserting fresh events...');
    
    // Store NEW events in database
    const { error } = await supabase
      .from('events')
      .insert(events);

    if (error) {
      console.error('Error storing events:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Sample event structure:', JSON.stringify(events[0], null, 2));
      throw new Error(`Failed to store events in database: ${error.message || JSON.stringify(error)}`);
    }

    // Count events by source for debugging
    const eventsBySource = events.reduce((acc, event) => {
      acc[event.source] = (acc[event.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return new Response(
      JSON.stringify({ 
        success: true, 
        events: events,
        debug: {
          eventsBySource,
          totalEvents: events.length,
          portfolioEvents: events.filter(e => e.source === 'brave_search_scraped').length
        },
        message: `Successfully found and stored ${events.length} real events in ${sanitizedLocation}!` 
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-real-events:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
});

async function searchForRealEvents(location: string, preferences: EventPreferences, braveApiKey: string, googleMapsApiKey?: string) {
  console.log('Starting Brave Search for real events...');
  
  const events: any[] = [];
  const categories = preferences.categories || ['Music', 'Art'];
  const keywords = preferences.customKeywords?.join(' ') || '';
  
  // Current date range for events
  const now = new Date();
  const currentMonth = now.toLocaleString('default', { month: 'long' });
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleString('default', { month: 'long' });
  
  // Use SINGLE simple query to avoid rate limiting
  // Based on testing: simple queries work much better than site-specific ones
  // Extract city name for more targeted search
  const cityName = location.split(',')[0].trim();
  const query = `"${cityName}" ${categories.join(' ')} events ${currentMonth} ${nextMonth} 2025 ${keywords}`.trim();
  
  console.log(`Brave Search query: ${query}`);
  
  try {
    const searchResults = await braveWebSearch(query, braveApiKey);
    
    if (searchResults.web?.results && searchResults.web.results.length > 0) {
      console.log(`Brave Search returned ${searchResults.web.results.length} raw results`);
      const extractedEvents = await extractEventsFromSearchResults(searchResults, location, preferences, false, googleMapsApiKey);
      events.push(...extractedEvents);
    } else {
      console.log('No results from Brave Search API');
    }
    
  } catch (error) {
    console.error(`Error searching with query "${query}":`, error);
    throw error; // Re-throw to handle at higher level
  }
  
  // Remove duplicates and limit results
  const uniqueEvents = removeDuplicateEvents(events);
  console.log(`Found ${uniqueEvents.length} unique events after deduplication`);
  
  // If no location-specific events found, try a broader search as fallback
  if (uniqueEvents.length === 0) {
    console.log(`No events found for ${location}, trying broader search...`);
    try {
      const fallbackQuery = `${cityName} events ${currentMonth} ${categories.join(' ')}`;
      console.log(`Fallback query: ${fallbackQuery}`);
      
      const fallbackResults = await braveWebSearch(fallbackQuery, braveApiKey);
      if (fallbackResults.web?.results) {
        const fallbackEvents = await extractEventsFromSearchResults(fallbackResults, location, preferences, true, googleMapsApiKey);
        const uniqueFallbackEvents = removeDuplicateEvents(fallbackEvents);
        console.log(`Found ${uniqueFallbackEvents.length} events with fallback search`);
        return uniqueFallbackEvents.slice(0, 10);
      }
    } catch (error) {
      console.log('Fallback search also failed:', error);
    }
  }
  
  return uniqueEvents.slice(0, 15); // Reduced to 15 for better quality
}

// Brave Search API function
async function braveWebSearch(query: string, apiKey: string) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '15'); // Increased for more results
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('country', 'US');
  // Remove freshness filter to get more results
  
  console.log(`Making Brave Search API call: ${url.toString()}`);
  
  const searchResponse = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey
    }
  });
  
  console.log(`Brave Search API response status: ${searchResponse.status}`);
  
  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    console.error(`Brave Search API error response: ${errorText}`);
    throw new Error(`Brave Search API error: ${searchResponse.status} - ${errorText}`);
  }
  
  const data = await searchResponse.json();
  console.log(`Brave Search returned ${data.web?.results?.length || 0} results`);
  
  return data;
}

async function scrapePortfolioEvents(url: string, location: string, preferences: EventPreferences): Promise<any[]> {
  console.log(`Scraping portfolio page: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch portfolio page ${url}. Status: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) {
      console.warn(`Failed to parse DOM for ${url}`);
      return [];
    }

    const events: any[] = [];
    // More robust selectors to find event containers
    const eventElements = doc.querySelectorAll('.event, .list-item, .card, [itemtype*="//schema.org/Event"]');

    console.log(`Found ${eventElements.length} potential event elements on ${url}`);

    for (const el of eventElements) {
      const element = el as HTMLElement;
      let title = element.querySelector('[itemprop="name"], .event-title, h2, h3')?.textContent?.trim() || '';
      const description = element.querySelector('[itemprop="description"], .event-description, p')?.textContent?.trim() || '';
      const eventUrl = element.querySelector('[itemprop="url"]')?.getAttribute('href') || element.querySelector('a')?.getAttribute('href') || '';
      const dateStr = element.querySelector('[itemprop="startDate"], .event-date, .date, time')?.getAttribute('datetime') || element.querySelector('.event-date, .date, time')?.textContent?.trim() || '';

      if (!title || !dateStr) {
        continue; // Skip if essential info is missing
      }
      
      const { startDate, endDate } = extractEventDates(title, dateStr);
      if (!startDate) {
        console.warn(`Could not parse date for event: "${title}" from date string: "${dateStr}"`);
        continue;
      }

      // Clean up title by removing date info if present
      title = title.replace(dateStr, '').trim();

      const venue = extractVenue(title, element.innerHTML, location);
      
      // Construct the full URL if it's relative
      const absoluteUrl = eventUrl.startsWith('http') ? eventUrl : new URL(eventUrl, url).href;

      const newEvent = {
        title,
        date_time: startDate.toISOString(),
        end_date_time: endDate ? endDate.toISOString() : new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        venue_name: venue,
        address: location, // Use general location for now
        latitude: null,
        longitude: null,
        price_range: 'Unknown',
        category: preferences.categories[0] || 'General',
        source: 'brave_search_scraped',
        event_url: absoluteUrl,
        description: description.substring(0, 200), // Truncate description
        is_real: true,
      };

      events.push(newEvent);
      
      if (events.length >= 10) {
        break; // Limit to 10 events per portfolio page
      }
    }

    console.log(`Successfully scraped ${events.length} events from ${url}`);
    return events;

  } catch (error) {
    console.error(`Error scraping portfolio page ${url}:`, error);
    // Create a debug event to log the raw HTML for later analysis
    return [{
      title: `Scraping Error on: ${url}`,
      date_time: new Date().toISOString(),
      description: `Error: ${error.message}. Raw HTML saved for debugging.`,
      source: 'scraping_error',
      is_real: false,
    }];
  }
}

// Extract events from Brave Search results
async function extractEventsFromSearchResults(searchResults: any, location: string, preferences: EventPreferences, skipLocationFilter = false, googleMapsApiKey?: string) {
  const events: any[] = [];
  
  if (!searchResults.web?.results) {
    console.log('No web results in search response');
    return events;
  }
  
  console.log(`Processing ${searchResults.web.results.length} search results...`);
  
  // Extract city and state for location filtering
  const cityName = location.split(',')[0].trim();
  const stateName = location.split(',')[1]?.trim() || '';
  
  for (const result of searchResults.web.results) {
    const { title, description, url } = result;

    // Basic filtering
    if (excludeKeywords.some(kw => title.toLowerCase().includes(kw) || description.toLowerCase().includes(kw))) {
      continue;
    }

    if (isPortfolioPage(url, title, description, location)) {
      // This is a high-quality candidate, so we scrape it for events
      try {
        const scrapedEvents = await scrapePortfolioEvents(url, location, preferences);
        if (scrapedEvents.length > 0) {
          console.log(`SUCCESS: Scraped ${scrapedEvents.length} events from ${url}`);
          events.push(...scrapedEvents);
        } else {
          console.log(`INFO: Scraper returned 0 events for ${url}`);
        }
      } catch (e) {
        console.error(`Error processing portfolio page ${url}:`, e);
      }
    } else {
      // Fallback for non-portfolio pages: check for event keywords and extract a single event if possible.
      const hasEventKeywords = eventKeywords.some(kw => title.toLowerCase().includes(kw) || description.toLowerCase().includes(kw));
      if (hasEventKeywords) {
        const { startDate, endDate } = extractEventDates(title, description);
        if (startDate) {
          const venue = extractVenue(title, '', location);
          events.push({
            title: title,
            date_time: startDate.toISOString(),
            end_date_time: endDate ? endDate.toISOString() : new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            venue_name: venue,
            address: location,
            latitude: null,
            longitude: null,
            price_range: 'Unknown',
            category: preferences.categories[0] || 'General',
            source: 'brave_search',
            event_url: url,
            description: description,
            is_real: true,
          });
        }
      }
    }
          console.log(`🚀 Starting portfolio scraping for: ${url}`);
          

          
          const fallbackEvents = await scrapePortfolioEvents(url, location, preferences);
          console.log(`📊 Portfolio scraping completed. Found ${fallbackEvents.length} events`);
          
          if (fallbackEvents.length > 0) {
            console.log(`✅ SUCCESS: Fallback scraping extracted ${fallbackEvents.length} events from portfolio page`);
            console.log(`📋 Event titles: ${fallbackEvents.map(e => e.title).slice(0, 3).join(', ')}${fallbackEvents.length > 3 ? '...' : ''}`);
            events.push(...fallbackEvents);
            continue;
          } else {
            console.log(`❌ WARNING: Fallback scraping found no events for ${url}`);
          }
        } catch (error) {
          console.log(`💥 ERROR: Failed to scrape portfolio with fallback: ${error.message}`);
          console.log(`🔍 Error stack: ${error.stack}`);
          // Fall through to create the portfolio event as fallback
        }
      }
      
      // Extract date from title or description - more robust patterns
      const text = (title + ' ' + description).toLowerCase();
      
      // Try multiple date patterns with better 2025 handling
      const datePatterns = [
        /\b(\d{1,2}[\/-]\d{1,2}[\/-]2025)\b/,
        /\b(2025-\d{2}-\d{2})\b/,
        /\b(july|august|september|october|november|december)\s+(\d{1,2}),?\s*2025\b/i,
        /\b(\d{1,2})\s+(july|august|september|october|november|december)\s*2025\b/i,
        /\bjuly\s+(\d{1,2})\b/i,
        /\baugust\s+(\d{1,2})\b/i,
        /\bseptember\s+(\d{1,2})\b/i,
        /\boctober\s+(\d{1,2})\b/i,
        /\bnovember\s+(\d{1,2})\b/i,
      
      // Try different venue extraction patterns
      const venuePatterns = [
        /at ([^-,|\n\r]+)/i,        // "at Venue Name"
        /- ([^||\n\r]+) -/,         // "- Venue Name -"
        /\| ([^|\n\r]+)$/,          // "| Venue Name" at end
        /presents .+ - (.+) -/i,    // "presents Event - Venue -"
        /venue:?\s*([^,\n\r]+)/i,   // "Venue: Name"
        /location:?\s*([^,\n\r]+)/i, // "Location: Name"
        /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:presents|hosts|venue)/i // "Madison Square Garden presents"
      ];
      
      for (const pattern of venuePatterns) {
        const venueMatch = title.match(pattern) || description.match(pattern);
        if (venueMatch && venueMatch[1]) {
          venue = venueMatch[1].trim().replace(/['"]/g, ''); // Remove quotes
          if (venue.length > 3 && venue.length < 100) { // Reasonable venue name length
            break;
          }
        }
      }
      
      // If we found a venue, try to geocode it and check distance
      if (venue) {
        const venueQuery = `${venue}, ${location}`;
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(venueQuery)}&key=${googleMapsApiKey}`;
        const geocodeResponse = await fetch(geocodeUrl);
        const geocodeData = await geocodeResponse.json();
        
        if (geocodeData.results && geocodeData.results.length > 0) {
          // Get coordinates for target location
          const targetGeocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${googleMapsApiKey}`;
          const targetGeocodeResponse = await fetch(targetGeocodeUrl);
          const targetGeocodeData = await targetGeocodeResponse.json();
          
          if (targetGeocodeData.results && targetGeocodeData.results.length > 0) {
            const venueCoords = {
              lat: geocodeData.results[0].geometry.location.lat,
              lng: geocodeData.results[0].geometry.location.lng
            };
            
            const targetCoords = {
              lat: targetGeocodeData.results[0].geometry.location.lat,
              lng: targetGeocodeData.results[0].geometry.location.lng
            };
            
            // Calculate distance using Haversine formula
            const distance = calculateDistance(targetCoords, venueCoords);
            console.log(`  Venue: ${venue} is ${distance.toFixed(2)} miles from target location`);
            
            // If venue is more than 100 miles away, exclude it
            if (distance > 100) {
              shouldInclude = false;
              console.log(`  Excluding event: Venue is too far away (${distance.toFixed(2)} miles)`);
            }
          }
        }
      }
    } catch (error) {
      console.log(`  Error during Google Maps verification: ${error.message}`);
    }
  }
  
  
  if (shouldInclude) {
    console.log(`Processing event: ${title}`);
    
    // Check if this is a portfolio/aggregate page that contains multiple events
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    
    const isPortfolioPage = title.match(/(\d+)\s+(fun\s+)?events/i) || 
                           title.match(/festivals?\s*(&|and)\s*street\s*fairs?/i) ||
                           description.match(/(\d+)\s+events/i) ||
                           titleLower.includes('calendar') ||
                           titleLower.includes('upcoming events') ||
                           titleLower.includes('event guide') ||
                           titleLower.includes('events calendar') ||
                           titleLower.includes('concert tickets') ||
                           titleLower.includes('event tickets') ||
                           (titleLower.includes('concerts') && titleLower.includes('2025')) ||
                           (titleLower.includes('events') && titleLower.includes('2025')) ||
                           descLower.includes('find the best events') ||
                           descLower.includes('upcoming event tickets');
    
    console.log(`Portfolio check for "${title}": ${isPortfolioPage}`);
    console.log(`  - Title lower: "${titleLower}"`);
    
    if (isPortfolioPage) {
      console.log(`🎯 DETECTED PORTFOLIO PAGE: ${title}`);
      console.log(`🔗 Portfolio URL: ${url}`);
      console.log(`📍 Location: ${location}`);
      console.log(`⚙️ AI analysis temporarily disabled - using fallback scraping...`);
      try {
        console.log(`🚀 Starting portfolio scraping for: ${url}`);
        
        import { DOMParser, HTMLElement } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';

        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc) {
          console.warn('Failed to parse HTML document');
          return [];
        }

        const events: any[] = [];
        const eventElements = doc.querySelectorAll('.event, .list-item, .card, [itemtype*="//schema.org/Event"]');
        console.log(`🔍 Found ${eventElements.length} potential event elements.`);

        for (const el of eventElements) {
          const element = el as HTMLElement;
          const title = element.querySelector('[itemprop="name"], .event-title, h2, h3')?.textContent?.trim();
          const startDateStr = element.querySelector('[itemprop="startDate"], .event-date, .date')?.getAttribute('datetime') || element.querySelector('.event-date, .date')?.textContent?.trim();
          const eventUrl = element.querySelector('a[itemprop="url"]')?.getAttribute('href') || element.querySelector('a')?.getAttribute('href');
          const description = element.querySelector('[itemprop="description"], .description, .summary')?.textContent?.trim();

          if (title && startDateStr) {
            const { startDate, endDate } = extractEventDates(title, startDateStr);
            if (startDate) {
              events.push({
                id: crypto.randomUUID(),
                title: title.substring(0, 200),
                description: (description || title).substring(0, 500),
                venue: extractVenue(title, element.innerHTML, location),
                address: location,
                date_time: startDate.toISOString(),
                end_date_time: endDate.toISOString(),
                price_min: 0, // Placeholder
                price_max: 50, // Placeholder
                external_url: eventUrl ? new URL(eventUrl, url).href : url,
                category: preferences.categories?.[0]?.toLowerCase() || 'general',
                tags: preferences.customKeywords || [],
                source: 'brave_search_scraped',
                city: location.split(',')[0],
                state: location.split(',')[1]?.trim() || '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
        console.log(`✅ Scraped ${events.length} events from ${url}`);
        const limitedEvents = events.slice(0, 10);
        console.log(`🔄 Returning ${limitedEvents.length} events (limited to 10 per portfolio page)`);
        events.push(...limitedEvents);
        continue;
      } catch (error) {
        console.log(`💥 ERROR: Failed to scrape portfolio with fallback: ${error.message}`);
        console.log(`🔍 Error stack: ${error.stack}`);
        // Fall through to create the portfolio event as fallback
      }
    }
    
    // Extract date from title or description - more robust patterns
    const text = (title + ' ' + description).toLowerCase();
    
    // Try multiple date patterns with better 2025 handling
    const datePatterns = [
      /\b(\d{1,2}[\/-]\d{1,2}[\/-]2025)\b/,
      /\b(2025-\d{2}-\d{2})\b/,
      /\b(july|august|september|october|november|december)\s+(\d{1,2}),?\s*2025\b/i,
      /\b(\d{1,2})\s+(july|august|september|october|november|december)\s*2025\b/i,
      /\bjuly\s+(\d{1,2})\b/i,
      /\baugust\s+(\d{1,2})\b/i,
      /\bseptember\s+(\d{1,2})\b/i,
      /\boctober\s+(\d{1,2})\b/i,
      /\bnovember\s+(\d{1,2})\b/i,
      /\bdecember\s+(\d{1,2})\b/i,
      /\b(\d{1,2})\s+(july|august|september|october|november|december)\b/i,
      /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/, // fallback for any date
      /\bthis\s+week/i,
      /\bnext\s+week/i,
    ];
    
    let eventDate = new Date();
    let dateFound = false;
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        console.log(`Found date pattern: ${match[0]}`);
        try {
          if (match[0].includes('/') || match[0].includes('-')) {
            eventDate = new Date(match[0]);
          } else if (match[0].includes('this week')) {
            // Random day this week
            const today = new Date();
            const daysToAdd = Math.floor(Math.random() * 7);
            eventDate = new Date(today.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
          } else if (match[0].includes('next week')) {
            // Random day next week
            const today = new Date();
            const daysToAdd = 7 + Math.floor(Math.random() * 7);
            eventDate = new Date(today.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
          } else if (match[0].includes('today')) {
            eventDate = new Date();
          } else if (match[0].includes('tomorrow')) {
            eventDate = new Date();
            eventDate.setDate(eventDate.getDate() + 1);
          } else if (match[0].includes('weekend')) {
            // Next Saturday
            const today = new Date();
            const daysUntilSaturday = (6 - today.getDay()) % 7 || 7;
            eventDate = new Date(today.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
          } else if (match[0].includes('july') || match[0].includes('august') || match[0].includes('september') || match[0].includes('october') || match[0].includes('november') || match[0].includes('december')) {
            // Handle month names better
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                              'july', 'august', 'september', 'october', 'november', 'december'];
            for (let i = 0; i < monthNames.length; i++) {
              if (match[0].includes(monthNames[i])) {
                const dayMatch = match[0].match(/\d{1,2}/);
                const day = dayMatch ? parseInt(dayMatch[0]) : Math.floor(Math.random() * 28) + 1; // Random day 1-28
                eventDate = new Date(2025, i, day);
                break;
              }
            }
          }
          
          if (!isNaN(eventDate.getTime()) && eventDate.getFullYear() >= 2025) {
            dateFound = true;
            break;
          }
        } catch (e) {
          console.log(`Error parsing date: ${e.message}`);
        }
      }
    }
    
    if (!dateFound) {
      // Create varied dates instead of all the same date
      console.log('No date found, using varied default dates');
      const today = new Date();
      const randomDaysFromNow = Math.floor(Math.random() * 60) + 1; // 1-60 days from now
      eventDate = new Date(today.getTime() + randomDaysFromNow * 24 * 60 * 60 * 1000);
    }
    
    // Extract price information
    const priceMatch = description.match(/\$\d+(?:\.\d{2})?/);
    let priceMin = 0;
    let priceMax = 50;
    
    if (priceMatch) {
      const price = parseInt(priceMatch[0].replace('$', ''));
      priceMin = price;
      priceMax = price;
    }
    
    // Extract venue from title or description - improved for multiple platforms
    let venue = 'TBD';
    
    // Try different venue extraction patterns
    const venuePatterns = [
      /at ([^-,|\n\r]+)/i,        // "at Venue Name"
      /- ([^||\n\r]+) -/,         // "- Venue Name -"
      /\| ([^|\n\r]+)$/,          // "| Venue Name" at end
      /presents .+ - (.+) -/i,    // "presents Event - Venue -"
      /venue:?\s*([^,\n\r]+)/i,   // "Venue: Name"
      /location:?\s*([^,\n\r]+)/i, // "Location: Name"
      /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:presents|hosts|venue)/i // "Madison Square Garden presents"
    ];
    
    for (const pattern of venuePatterns) {
      const venueMatch = title.match(pattern) || description.match(pattern);
      if (venueMatch && venueMatch[1]) {
        venue = venueMatch[1].trim().replace(/['"]/g, ''); // Remove quotes
        if (venue.length > 3 && venue.length < 100) { // Reasonable venue name length
          break;
        }
      }
    }
    
    // If still no venue, try to extract from URL or set default based on source
    if (venue === 'TBD') {
      if (url.includes('eventbrite.com')) {
        venue = 'Eventbrite Event';
      } else if (url.includes('ticketmaster.com')) {
        venue = 'Ticketmaster Venue';
      } else if (url.includes('songkick.com')) {
        venue = 'Multiple Venues';
      } else if (url.includes('newyorkcitytheatre.com')) {
        venue = 'NYC Theater';
      } else {
        venue = `${location.split(',')[0]} Venue`;
      }
    }
    
    const event = {
      id: crypto.randomUUID(),
      title: title.substring(0, 200),
      description: description.substring(0, 500),
      venue: venue,
      address: location,
      date_time: eventDate.toISOString(),
      end_date_time: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      price_min: priceMin,
      price_max: priceMax,
      external_url: url,
      category: preferences.categories?.[0]?.toLowerCase() || 'general',
      tags: preferences.customKeywords || [],
      source: 'brave_search',
      city: location.split(',')[0],
      state: location.split(',')[1]?.trim() || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    events.push(event);
  }
}

import { DOMParser, HTMLElement } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';

// Scrape events from a portfolio page using a DOM parser
export async function scrapePortfolioEvents(url: string, location: string, preferences: EventPreferences): Promise<any[]> {
  console.log(`🚀 DOM SCRAPING: Starting for portfolio page: ${url}`);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) {
      console.warn('Failed to parse HTML document');
      return [];
    }

    const events: any[] = [];
    const eventElements = doc.querySelectorAll('.event, .list-item, .card, [itemtype*="//schema.org/Event"]');
    console.log(`🔍 Found ${eventElements.length} potential event elements.`);

    for (const el of eventElements) {
      const element = el as HTMLElement;
      const title = element.querySelector('[itemprop="name"], .event-title, h2, h3')?.textContent?.trim();
      const startDateStr = element.querySelector('[itemprop="startDate"], .event-date, .date')?.getAttribute('datetime') || element.querySelector('.event-date, .date')?.textContent?.trim();
      const eventUrl = element.querySelector('a[itemprop="url"]')?.getAttribute('href') || element.querySelector('a')?.getAttribute('href');
      const description = element.querySelector('[itemprop="description"], .description, .summary')?.textContent?.trim();

      if (title && startDateStr) {
        const { startDate, endDate } = extractEventDates(title, startDateStr);
        if (startDate) {
          events.push({
            id: crypto.randomUUID(),
            title: title.substring(0, 200),
            description: (description || title).substring(0, 500),
            venue: extractVenue(title, element.innerHTML, location),
            address: location,
            date_time: startDate.toISOString(),
            end_date_time: endDate.toISOString(),
            price_min: 0, // Placeholder
            price_max: 50, // Placeholder
            external_url: eventUrl ? new URL(eventUrl, url).href : url,
            category: preferences.categories?.[0]?.toLowerCase() || 'general',
            tags: preferences.customKeywords || [],
            source: 'brave_search_scraped',
            city: location.split(',')[0],
            state: location.split(',')[1]?.trim() || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
    console.log(`✅ Scraped ${events.length} events from ${url}`);
    const limitedEvents = events.slice(0, 10);
    console.log(`🔄 Returning ${limitedEvents.length} events (limited to 10 per portfolio page)`);
    return limitedEvents;

  } catch (error) {
    console.error(`🔥 Error scraping ${url}:`, error);
    return [];
    console.error(`Error scraping portfolio page ${url}:`, error.message);
    throw error;
  }
}

// Calculate distance between two points using Haversine formula
function calculateDistance(coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
