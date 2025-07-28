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
    console.log(`Starting search for location: ${location}`);
    console.log(`Preferences:`, JSON.stringify(preferences, null, 2));

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!perplexityApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Test Perplexity connection first
    console.log('Testing Perplexity API connection...');
    
    const testResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'user',
            content: `Find 3 events happening in ${location} and return as JSON array: [{"title":"Event Name", "venue":"Venue", "date":"2025-02-15"}]`
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      }),
    });

    if (!testResponse.ok) {
      throw new Error(`Perplexity API error: ${testResponse.status} ${testResponse.statusText}`);
    }

    const testData = await testResponse.json();
    console.log('Perplexity test response:', JSON.stringify(testData, null, 2));

    // For now, return test response to see what we get
    return new Response(
      JSON.stringify({ 
        success: true, 
        events: [], 
        message: `Perplexity test completed. Check logs for response.`,
        debug: testData.choices[0]?.message?.content
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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

  // Strategy 1: Search major event platforms using Perplexity web search
  const eventSources = [
    { site: 'eventbrite.com', type: 'eventbrite' },
    { site: 'meetup.com', type: 'meetup' }, 
    { site: 'facebook.com/events', type: 'facebook' },
    { site: 'ticketmaster.com', type: 'ticketmaster' }
  ];

  for (const source of eventSources) {
    try {
      const sourceEvents = await searchEventSource(location, preferences, apiKey, source);
      events.push(...sourceEvents);
    } catch (error) {
      console.error(`Error searching ${source.site}:`, error);
    }
  }

  // Strategy 2: Search general events in location
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
  const categories = preferences.categories?.join(' ') || 'events';
  const keywords = preferences.customKeywords?.join(' ') || '';
  
  const query = `Search ${source.site} for events in ${location}. Find upcoming ${categories} ${keywords} events with venues, dates, and tickets`;

  console.log(`Scraping ${source.type} for real events: ${query}`);

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
          content: `You are a web scraper that finds REAL EVENT LISTINGS from ${source.site}. 
          
          Search ${source.site} and extract actual events with:
          - Real event titles from actual listings
          - Real venue names and addresses  
          - Real dates and times
          - Real ticket prices
          - Real event URLs from ${source.site}
          
          ONLY return events that actually exist on ${source.site}. Do not make up or generate any events.
          Return as JSON array with format: [{"title":"...", "venue":"...", "address":"...", "date_time":"...", "end_date_time":"...", "price_min":0, "price_max":0, "external_url":"...", "description":"..."}]`
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
    console.error(`Perplexity API error for ${source.type}: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  console.log(`Raw response from ${source.type}:`, content);

  if (!content) {
    console.log(`No content returned for ${source.type}`);
    return [];
  }

  // Extract events from the response
  try {
    // Look for JSON array in the response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const events = JSON.parse(jsonMatch[0]);
      if (Array.isArray(events)) {
        return events.map((event: any) => ({
          id: crypto.randomUUID(),
          title: event.title || 'Event',
          description: event.description || '',
          venue: event.venue || 'Venue TBD',
          address: event.address || location,
          date_time: event.date_time || new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          end_date_time: event.end_date_time || new Date(new Date(event.date_time || Date.now()).getTime() + 2 * 60 * 60 * 1000).toISOString(),
          price_min: event.price_min || 0,
          price_max: event.price_max || 0,
          external_url: event.external_url || '',
          category: event.category || 'general',
          tags: event.tags || [],
          source: source.type,
          city: location.split(',')[0],
          state: location.split(',')[1]?.trim() || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
      }
    }
    
    console.log(`No valid JSON found in ${source.type} response`);
    return [];
  } catch (parseError) {
    console.error(`Error parsing ${source.type} events:`, parseError);
    return [];
  }
}

async function searchLocalEvents(location: string, preferences: EventPreferences, apiKey: string) {
  const categories = preferences.categories?.join(' ') || 'events';
  const timePrefs = preferences.timePreferences?.join(' ') || '';
  
  const query = `Find real events happening in ${location} for ${categories} ${timePrefs} February March 2025 with venue addresses and ticket information`;

  console.log(`Searching for local events: ${query}`);

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
          content: `Find REAL events in ${location}. Search local venues, theaters, clubs, community centers. 
          
          Extract actual events with:
          - Real event titles from actual listings
          - Real venue names and specific addresses in ${location}
          - Real dates and times (February/March 2025)
          - Real ticket prices if available
          - Real event URLs
          
          ONLY return events that actually exist. Do not generate fake events.
          Return as JSON array: [{"title":"...", "venue":"...", "address":"...", "date_time":"...", "end_date_time":"...", "price_min":0, "price_max":0, "external_url":"...", "description":"..."}]`
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
    console.error(`Perplexity API error for local events: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    return [];
  }

  // Extract events from the response
  try {
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const events = JSON.parse(jsonMatch[0]);
      if (Array.isArray(events)) {
        return events.map((event: any) => ({
          id: crypto.randomUUID(),
          title: event.title || 'Local Event',
          description: event.description || '',
          venue: event.venue || 'Local Venue',
          address: event.address || location,
          date_time: event.date_time || new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          end_date_time: event.end_date_time || new Date(new Date(event.date_time || Date.now()).getTime() + 2 * 60 * 60 * 1000).toISOString(),
          price_min: event.price_min || 0,
          price_max: event.price_max || 0,
          external_url: event.external_url || '',
          category: event.category || 'general',
          tags: event.tags || [],
          source: 'local_search',
          city: location.split(',')[0],
          state: location.split(',')[1]?.trim() || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
      }
    }
    
    return [];
  } catch (parseError) {
    console.error('Error parsing local events:', parseError);
    return [];
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