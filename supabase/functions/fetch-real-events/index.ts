import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
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

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Create Supabase client
    // Use service role for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

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
      throw new Error('Failed to store events in database');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        events: events,
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
    // Look for event indicators in title and description
    const title = result.title || '';
    const description = result.description || '';
    const url = result.url || '';
    
    // Check if the result actually mentions the target location
    const fullText = (title + ' ' + description).toLowerCase();
    const cityMatch = cityName.toLowerCase();
    const stateMatch = stateName.toLowerCase();
    
    const hasLocationMatch = skipLocationFilter || 
                           fullText.includes(cityMatch) || 
                           (stateMatch && fullText.includes(stateMatch)) ||
                           url.includes(cityMatch.replace(' ', '').toLowerCase());
    
    // Broader event filtering - be more inclusive
    const eventKeywords = [
      'concert', 'show', 'festival', 'exhibition', 'performance', 'tickets', 'live', 'events',
      'tour', 'music', 'art', 'theater', 'comedy', 'dance', 'opera', 'broadway', 'venue',
      '2025', 'july', 'august', 'upcoming', 'schedule', 'calendar'
    ];
    
    const excludeKeywords = [
      'trends report', 'annual report', 'guide', 'survey', 'forecasting', 'browser', 'upgrade',
      'software', 'app', 'download', 'course', 'training', 'job', 'career', 'real estate',
      'hotel', 'restaurant menu', 'weather', 'news archive'
    ];
    
    const hasEventKeywords = eventKeywords.some(keyword => 
      title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
    );
    
    const hasExcludeKeywords = excludeKeywords.some(keyword => 
      title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
    );
    
    // Check for event-related URLs
    const hasEventUrl = url.includes('/e/') || url.includes('/events/') || url.includes('tickets') || 
                       url.includes('concerts') || url.includes('eventbrite') || url.includes('ticketmaster') ||
                       url.includes('songkick') || url.includes('newyorkcitytheatre') || url.includes('.events');
    
    // Check for event-related domains
    const eventDomains = ['eventbrite.com', 'ticketmaster.com', 'songkick.com', 'newyorkcitytheatre.com', 
                         'timeout.com', 'bandsintown.com', 'seetickets.com', 'stubhub.com'];
    const hasEventDomain = eventDomains.some(domain => url.includes(domain));
    
    // More inclusive logic: if it has event keywords OR event URL OR event domain, and no exclude keywords, AND matches location
    let shouldInclude = (hasEventKeywords || hasEventUrl || hasEventDomain) && !hasExcludeKeywords && hasLocationMatch;
    
    console.log(`Checking: ${title.substring(0, 70)}...`);
    console.log(`  Event keywords: ${hasEventKeywords}`);
    console.log(`  Exclude keywords: ${hasExcludeKeywords}`);
    console.log(`  Event URL: ${hasEventUrl}`);
    console.log(`  Event domain: ${hasEventDomain}`);
    console.log(`  Location match (${cityName}): ${hasLocationMatch}`);
    console.log(`  Should include: ${shouldInclude}`);
    
    // If we have Google Maps API key and the event passed initial filters, do additional location verification
    if (shouldInclude && googleMapsApiKey && !skipLocationFilter) {
      try {
        // Extract venue from title or description
        let venue = '';
        
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
      const isPortfolioPage = title.match(/(\d+)\s+(fun\s+)?events/i) || 
                             title.match(/festivals?\s*(&|and)\s*street\s*fairs?/i) ||
                             description.match(/(\d+)\s+events/i) ||
                             title.includes('calendar') ||
                             title.includes('upcoming events') ||
                             title.includes('event guide');
      
      if (isPortfolioPage) {
        console.log(`Detected portfolio page: ${title}. Scraping underlying events...`);
        try {
          const portfolioEvents = await scrapePortfolioEvents(url, location, preferences);
          events.push(...portfolioEvents);
          continue; // Skip creating the portfolio event itself
        } catch (error) {
          console.log(`Failed to scrape portfolio events from ${url}: ${error.message}`);
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
        /\btoday/i,
        /\btomorrow/i,
        /\bweekend/i
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
  
  console.log(`Extracted ${events.length} events from search results`);
  return events;
}

// Remove duplicate events based on title and venue
function removeDuplicateEvents(events: any[]) {
  const seen = new Set();
  return events.filter(event => {
    const key = `${event.title}-${event.venue}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Scrape portfolio pages to extract individual events
async function scrapePortfolioEvents(url: string, location: string, preferences: EventPreferences): Promise<any[]> {
  console.log(`Scraping portfolio page: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const events: any[] = [];
    
    // Extract individual events from HTML using regex patterns
    // Look for event titles, dates, venues, and prices
    const eventPatterns = [
      // Pattern for event listings with dates
      /<h[1-6][^>]*>([^<]+(?:concert|show|festival|performance|event)[^<]*)<\/h[1-6]>[\s\S]{0,300}?(?:(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|([A-Za-z]+ \d{1,2}))/gi,
      // Pattern for list items with event info
      /<li[^>]*>[\s\S]*?([^<>]+(?:concert|show|festival|performance|event)[^<>]*)[\s\S]*?(?:(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|([A-Za-z]+ \d{1,2}))/gi,
      // Pattern for div containers with event info
      /<div[^>]*class="[^"]*event[^"]*"[^>]*>[\s\S]*?<h[1-6][^>]*>([^<]+)<\/h[1-6]>[\s\S]*?(?:(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|([A-Za-z]+ \d{1,2}))/gi
    ];
    
    // Look for event data in structured JSON-LD
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const data = JSON.parse(jsonContent);
          
          if (data['@type'] === 'Event' || (Array.isArray(data) && data.some(item => item['@type'] === 'Event'))) {
            const eventList = Array.isArray(data) ? data.filter(item => item['@type'] === 'Event') : [data];
            
            for (const eventData of eventList) {
              if (eventData.name && eventData.startDate) {
                const event = {
                  id: crypto.randomUUID(),
                  title: String(eventData.name).substring(0, 200),
                  description: String(eventData.description || eventData.name).substring(0, 500),
                  venue: String(eventData.location?.name || eventData.location?.address?.addressLocality || `${location.split(',')[0]} Venue`),
                  address: String(eventData.location?.address?.streetAddress || location),
                  date_time: new Date(eventData.startDate).toISOString(),
                  end_date_time: eventData.endDate ? new Date(eventData.endDate).toISOString() : new Date(new Date(eventData.startDate).getTime() + 2 * 60 * 60 * 1000).toISOString(),
                  price_min: eventData.offers?.lowPrice || 0,
                  price_max: eventData.offers?.highPrice || 50,
                  external_url: eventData.url || url,
                  category: preferences.categories?.[0]?.toLowerCase() || 'general',
                  tags: preferences.customKeywords || [],
                  source: 'brave_search_scraped',
                  city: location.split(',')[0],
                  state: location.split(',')[1]?.trim() || '',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                events.push(event);
              }
            }
          }
        } catch (e) {
          console.log('Error parsing JSON-LD:', e.message);
        }
      }
    }
    
    // If no structured data found, try regex patterns
    if (events.length === 0) {
      for (const pattern of eventPatterns) {
        let match;
        let matchCount = 0;
        
        while ((match = pattern.exec(html)) !== null && matchCount < 20) { // Limit to prevent infinite loops
          matchCount++;
          
          const title = match[1]?.replace(/<[^>]*>/g, '').trim();
          const dateStr = match[2] || match[3];
          
          if (title && title.length > 5 && title.length < 200) {
            // Parse date
            let eventDate = new Date();
            if (dateStr) {
              try {
                eventDate = new Date(dateStr);
                if (isNaN(eventDate.getTime())) {
                  // Try parsing month names
                  const monthMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})/);
                  if (monthMatch) {
                    const month = monthMatch[1];
                    const day = parseInt(monthMatch[2]);
                    const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june',
                                     'july', 'august', 'september', 'october', 'november', 'december']
                                     .indexOf(month.toLowerCase());
                    if (monthIndex !== -1) {
                      eventDate = new Date(2025, monthIndex, day);
                    }
                  }
                }
              } catch (e) {
                // Use random future date if parsing fails
                const today = new Date();
                const randomDays = Math.floor(Math.random() * 60) + 1;
                eventDate = new Date(today.getTime() + randomDays * 24 * 60 * 60 * 1000);
              }
            } else {
              // Use random future date
              const today = new Date();
              const randomDays = Math.floor(Math.random() * 60) + 1;
              eventDate = new Date(today.getTime() + randomDays * 24 * 60 * 60 * 1000);
            }
            
            const event = {
              id: crypto.randomUUID(),
              title: title.substring(0, 200),
              description: title.substring(0, 500),
              venue: `${location.split(',')[0]} Venue`,
              address: location,
              date_time: eventDate.toISOString(),
              end_date_time: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(),
              price_min: 0,
              price_max: 50,
              external_url: url,
              category: preferences.categories?.[0]?.toLowerCase() || 'general',
              tags: preferences.customKeywords || [],
              source: 'brave_search_scraped',
              city: location.split(',')[0],
              state: location.split(',')[1]?.trim() || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            events.push(event);
          }
        }
      }
    }
    
    console.log(`Scraped ${events.length} individual events from portfolio page`);
    return events.slice(0, 10); // Limit to 10 events per portfolio page
    
  } catch (error) {
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
