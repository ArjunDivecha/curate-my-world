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
    const { location, preferences } = await req.json();
    
    if (!location) {
      throw new Error('Location is required');
    }

    console.log(`Starting search for location: ${location}`);
    console.log(`Preferences:`, JSON.stringify(preferences, null, 2));

    // Get Brave Search API key
    const braveApiKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
    if (!braveApiKey) {
      throw new Error('BRAVE_SEARCH_API_KEY not found');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Search for real events using Brave Search API
    const events = await searchForRealEvents(location, preferences, braveApiKey);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          events: [], 
          message: `No real events found in ${location}. Try a different location or adjust your preferences.` 
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
    
    // Store events in database
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
        message: `Successfully found and stored ${events.length} real events in ${location}!` 
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

async function searchForRealEvents(location: string, preferences: EventPreferences, apiKey: string) {
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
  const query = `${location} ${categories.join(' ')} events ${currentMonth} ${nextMonth} 2025 ${keywords}`.trim();
  
  console.log(`Brave Search query: ${query}`);
  
  try {
    const searchResults = await braveWebSearch(query, apiKey);
    
    if (searchResults.web?.results && searchResults.web.results.length > 0) {
      console.log(`Brave Search returned ${searchResults.web.results.length} raw results`);
      const extractedEvents = extractEventsFromSearchResults(searchResults, location, preferences);
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
function extractEventsFromSearchResults(searchResults: any, location: string, preferences: EventPreferences) {
  const events: any[] = [];
  
  if (!searchResults.web?.results) {
    console.log('No web results in search response');
    return events;
  }
  
  console.log(`Processing ${searchResults.web.results.length} search results...`);
  
  for (const result of searchResults.web.results) {
    // Look for event indicators in title and description
    const title = result.title || '';
    const description = result.description || '';
    const url = result.url || '';
    
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
    
    // More inclusive logic: if it has event keywords OR event URL OR event domain, and no exclude keywords
    const shouldInclude = (hasEventKeywords || hasEventUrl || hasEventDomain) && !hasExcludeKeywords;
    
    console.log(`Checking: ${title.substring(0, 70)}...`);
    console.log(`  Event keywords: ${hasEventKeywords}`);
    console.log(`  Exclude keywords: ${hasExcludeKeywords}`);
    console.log(`  Event URL: ${hasEventUrl}`);
    console.log(`  Event domain: ${hasEventDomain}`);
    console.log(`  Should include: ${shouldInclude}`);
    
    
    if (shouldInclude) {
      console.log(`Processing event: ${title}`);
      
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
        /\b(\d{1,2})\s+july\b/i,
        /\b(\d{1,2})\s+august\b/i,
        /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/, // fallback for any date
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
            } else if (match[0].includes('july') || match[0].includes('august')) {
              // Handle month names better
              const monthStr = match[0].includes('july') ? 'july' : 'august';
              const dayMatch = match[0].match(/\d{1,2}/);
              const day = dayMatch ? parseInt(dayMatch[0]) : 15;
              const monthIndex = monthStr === 'july' ? 6 : 7; // July=6, August=7
              eventDate = new Date(2025, monthIndex, day);
            } else {
              // Handle other month names
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                'july', 'august', 'september', 'october', 'november', 'december'];
              for (let i = 0; i < monthNames.length; i++) {
                if (match[0].includes(monthNames[i])) {
                  const dayMatch = match[0].match(/\d{1,2}/);
                  const day = dayMatch ? parseInt(dayMatch[0]) : 15;
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
        // Default to next month if no date found
        console.log('No date found, using default (next month)');
        eventDate = new Date();
        eventDate.setMonth(eventDate.getMonth() + 1);
        eventDate.setDate(15); // Mid-month
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
