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

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!perplexityApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Search for real events using multiple strategies
    const realEvents = await searchForRealEvents(location, preferences, perplexityApiKey);

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

async function searchForRealEvents(location: string, preferences: EventPreferences, apiKey: string) {
  const events: any[] = [];

  // Strategy 1: Search major event platforms
  const eventSources = [
    { site: 'site:eventbrite.com', type: 'eventbrite' },
    { site: 'site:meetup.com', type: 'meetup' }, 
    { site: 'site:facebook.com/events', type: 'facebook' },
    { site: 'site:ticketmaster.com', type: 'ticketmaster' }
  ];

  for (const source of eventSources) {
    try {
      const sourceEvents = await searchEventSource(location, preferences, apiKey, source);
      events.push(...sourceEvents);
    } catch (error) {
      console.error(`Error searching ${source.site}:`, error);
    }
  }

  // Strategy 2: Search local venues and community sites
  try {
    const localEvents = await searchLocalEvents(location, preferences, apiKey);
    events.push(...localEvents);
  } catch (error) {
    console.error('Error searching local events:', error);
  }

  // Remove duplicates and return
  return removeDuplicateEvents(events.slice(0, 20)); // Limit to 20 events
}

async function searchEventSource(location: string, preferences: EventPreferences, apiKey: string, source: any) {
  const categories = preferences.categories?.join(' OR ') || 'events';
  const keywords = preferences.customKeywords?.join(' ') || '';
  
  const query = `${source.site} events in ${location} ${categories} ${keywords} upcoming 2025`.trim();

  console.log(`Searching ${source.type} with query: ${query}`);

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        {
          role: 'system',
          content: `Search for REAL events on ${source.type}. Find actual event listings with real venues, real dates, real tickets. Extract only factual information from actual event pages. Return JSON array with: title, description, venue, address, date_time, end_date_time, price_min, price_max, external_url, category, tags.`
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 2000,
      search_recency_filter: 'week'
    }),
  });

  if (!response.ok) {
    console.error(`${source.type} API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    return [];
  }

  // Extract events from the response
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const events = JSON.parse(jsonMatch[0]);
      return events.map((event: any) => ({
        id: crypto.randomUUID(),
        title: event.title,
        description: event.description,
        venue: event.venue,
        address: event.address,
        date_time: event.date_time,
        end_date_time: event.end_date_time,
        price_min: event.price_min || 0,
        price_max: event.price_max || 0,
        external_url: event.external_url,
        category: event.category,
        tags: event.tags || [],
        source: source.type,
        city: location.split(',')[0],
        state: location.split(',')[1]?.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    }
  } catch (parseError) {
    console.error(`Error parsing ${source.type} events:`, parseError);
  }

  return [];
}

async function searchLocalEvents(location: string, preferences: EventPreferences, apiKey: string) {
  const categories = preferences.categories?.join(' ') || 'events';
  const timePrefs = preferences.timePreferences?.join(' ') || '';
  
  const query = `"events in ${location}" ${categories} ${timePrefs} upcoming January February 2025 venue address tickets local community`;

  console.log(`Searching local events with query: ${query}`);

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        {
          role: 'system',
          content: `Find REAL local events in ${location}. Search local venues, community centers, theaters, clubs. Extract actual event details from real listings. Return JSON array with real event data.`
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      search_recency_filter: 'week'
    }),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    return [];
  }

  // Extract events from the response
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const events = JSON.parse(jsonMatch[0]);
      return events.map((event: any) => ({
        id: crypto.randomUUID(),
        title: event.title,
        description: event.description,
        venue: event.venue,
        address: event.address,
        date_time: event.date_time,
        end_date_time: event.end_date_time,
        price_min: event.price_min || 0,
        price_max: event.price_max || 0,
        external_url: event.external_url,
        category: event.category,
        tags: event.tags || [],
        source: 'local_search',
        city: location.split(',')[0],
        state: location.split(',')[1]?.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    }
  } catch (parseError) {
    console.error('Error parsing local events:', parseError);
  }

  return [];
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