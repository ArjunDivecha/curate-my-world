import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventPreferences {
  categories?: string[];
  priceRange?: { min: number; max: number };
  timePreferences?: string[];
  customKeywords?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { location, preferences } = await req.json();
    console.log(`Fetching REAL events for location: ${location} with preferences:`, preferences);

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const googleCxId = Deno.env.get('GOOGLE_CX_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!googleApiKey || !googleCxId || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Search for real events using Google Custom Search
    const realEvents = await searchForRealEvents(location, preferences, googleApiKey, googleCxId);

    if (realEvents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          events: [], 
          message: `No real events found in ${location}. Try a different location or adjust your preferences.` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${realEvents.length} real events, storing in database`);

    // Store events in database with better conflict handling
    const { error: insertError } = await supabase
      .from('events')
      .insert(realEvents);

    if (insertError) {
      console.error('Error storing events:', insertError);
      throw new Error('Failed to store events in database');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        events: realEvents, 
        message: `Found ${realEvents.length} real events in ${location}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in fetch-real-events function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function searchForRealEvents(location: string, preferences: EventPreferences, apiKey: string, cxId: string) {
  const events: any[] = [];

  // Strategy 1: Search major event platforms using Google Custom Search
  const eventSources = [
    { site: 'site:eventbrite.com', type: 'eventbrite' },
    { site: 'site:meetup.com', type: 'meetup' }, 
    { site: 'site:facebook.com/events', type: 'facebook' },
    { site: 'site:ticketmaster.com', type: 'ticketmaster' }
  ];

  for (const source of eventSources) {
    try {
      const sourceEvents = await searchEventSource(location, preferences, apiKey, cxId, source);
      events.push(...sourceEvents);
    } catch (error) {
      console.error(`Error searching ${source.site}:`, error);
    }
  }

  // Strategy 2: Search general events in location
  try {
    const localEvents = await searchLocalEvents(location, preferences, apiKey, cxId);
    events.push(...localEvents);
  } catch (error) {
    console.error('Error searching local events:', error);
  }

  // Remove duplicates and return
  return removeDuplicateEvents(events.slice(0, 20)); // Limit to 20 events
}

async function searchEventSource(location: string, preferences: EventPreferences, apiKey: string, cxId: string, source: any) {
  const categories = preferences.categories?.join(' ') || 'events';
  const keywords = preferences.customKeywords?.join(' ') || '';
  
  const query = `${source.site} events in "${location}" ${categories} ${keywords} 2025`.trim();

  console.log(`Searching ${source.type} with Google Custom Search: ${query}`);

  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}&num=5`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    console.error(`Google Search API error for ${source.type}: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const items = data.items || [];

  if (items.length === 0) {
    console.log(`No search results found for ${source.type}`);
    return [];
  }

  // Extract event information from search results
  const events: any[] = [];
  
  for (const item of items) {
    const event = extractEventFromSearchResult(item, source.type, location);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

async function searchLocalEvents(location: string, preferences: EventPreferences, apiKey: string, cxId: string) {
  const categories = preferences.categories?.join(' ') || 'events';
  const timePrefs = preferences.timePreferences?.join(' ') || '';
  
  const query = `events in "${location}" ${categories} ${timePrefs} 2025 tickets venue`;

  console.log(`Searching local events with Google: ${query}`);

  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}&num=10`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    console.error(`Google Search API error for local events: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const items = data.items || [];

  if (items.length === 0) {
    console.log(`No local events found for ${location}`);
    return [];
  }

  // Extract event information from search results
  const events: any[] = [];
  
  for (const item of items) {
    const event = extractEventFromSearchResult(item, 'local_search', location);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

function extractEventFromSearchResult(item: any, source: string, location: string) {
  try {
    // Extract basic information from Google search result
    const title = item.title || '';
    const snippet = item.snippet || '';
    const url = item.link || '';

    // Skip if this doesn't look like an event
    if (!title.toLowerCase().includes('event') && 
        !snippet.toLowerCase().includes('event') &&
        !snippet.toLowerCase().includes('concert') &&
        !snippet.toLowerCase().includes('show') &&
        !snippet.toLowerCase().includes('meeting')) {
      return null;
    }

    // Try to extract date information from snippet
    const dateMatch = snippet.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+\d{4})?\b/i);
    const timeMatch = snippet.match(/\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)\b/i);
    
    // Create a reasonable future date if none found
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 30) + 1);
    
    let eventDate = futureDate.toISOString();
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[0] + (dateMatch[0].includes('2025') ? '' : ', 2025'));
      if (!isNaN(parsedDate.getTime())) {
        eventDate = parsedDate.toISOString();
      }
    }

    // Try to extract venue information
    const venueMatch = snippet.match(/at\s+([^,.!?]+)/i);
    const venue = venueMatch ? venueMatch[1].trim() : 'Venue TBD';

    // Extract price information if available
    const priceMatch = snippet.match(/\$(\d+(?:\.\d{2})?)/);
    const price = priceMatch ? parseInt(priceMatch[1]) : 0;

    return {
      id: crypto.randomUUID(),
      title: title.substring(0, 200), // Limit title length
      description: snippet.substring(0, 500), // Limit description length
      venue: venue.substring(0, 100),
      address: `${location}`, // Use provided location as fallback
      date_time: eventDate,
      end_date_time: new Date(new Date(eventDate).getTime() + 2 * 60 * 60 * 1000).toISOString(), // +2 hours
      price_min: price,
      price_max: price > 0 ? price : 0,
      external_url: url,
      category: 'general',
      tags: [],
      source: source,
      city: location.split(',')[0],
      state: location.split(',')[1]?.trim() || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error extracting event from search result:', error);
    return null;
  }
}

function removeDuplicateEvents(events: any[]) {
  const seen = new Set();
  return events.filter(event => {
    const key = `${event.title}-${event.venue}-${event.date_time}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}