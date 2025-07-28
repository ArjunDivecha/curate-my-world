import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

/**
 * Simplified Ticketmaster collector without collection_runs table dependency
 * This version focuses on just collecting events and storing them
 */

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
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { 
      location = 'San Francisco, CA', 
      coordinates = { lat: 37.7749, lng: -122.4194 },
      categories = ['music'], 
      limit = 10 
    } = await req.json();
    
    console.log('🎭 Starting Ticketmaster collection for:', location);
    
    // Get environment variables
    const ticketmasterApiKey = Deno.env.get('TICKETMASTER_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!ticketmasterApiKey) {
      throw new Error('TICKETMASTER_API_KEY not found in environment variables');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = Date.now();

    // Fetch events from Ticketmaster API
    const events = await fetchTicketmasterEvents(ticketmasterApiKey, coordinates, categories, limit);
    
    console.log(`🎯 Fetched ${events.length} events from Ticketmaster`);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No events found',
          stats: {
            totalFound: 0,
            newEvents: 0,
            executionTimeMs: Date.now() - startTime
          }
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }

    // Process and store events
    const processedEvents = await processAndStoreEvents(events, supabase);
    
    const executionTime = Date.now() - startTime;

    console.log(`✅ Ticketmaster collection completed in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Ticketmaster collection completed successfully`,
        stats: {
          totalFound: events.length,
          newEvents: processedEvents.length,
          executionTimeMs: executionTime
        },
        events: processedEvents.slice(0, 5) // Return first 5 for verification
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );

  } catch (error) {
    console.error('❌ Error in Ticketmaster collector:', error);
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

async function fetchTicketmasterEvents(
  apiKey: string,
  coordinates: { lat: number, lng: number },
  categories: string[],
  limit: number
): Promise<any[]> {
  console.log('🔍 Fetching events from Ticketmaster API...');
  
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  const params = new URLSearchParams({
    'apikey': apiKey,
    'latlong': `${coordinates.lat},${coordinates.lng}`,
    'radius': '50',
    'unit': 'miles',
    'size': Math.min(200, limit).toString(),
    'sort': 'date,asc'
  });

  // Add category filters if specified
  if (categories.length > 0) {
    const categoryMapping: { [key: string]: string } = {
      'music': 'KZFzniwnSyZfZ7v7nJ',
      'arts': 'KZFzniwnSyZfZ7v7na', 
      'sports': 'KZFzniwnSyZfZ7v7nE'
    };
    
    const segmentIds = categories
      .map(cat => categoryMapping[cat.toLowerCase()])
      .filter(Boolean);
      
    if (segmentIds.length > 0) {
      params.set('segmentId', segmentIds.join(','));
    }
  }

  url.search = params.toString();

  console.log('📡 Making Ticketmaster API request...');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'CurateMyWorld/1.0'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ticketmaster API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data._embedded?.events || [];
}

async function processAndStoreEvents(events: any[], supabase: any): Promise<any[]> {
  console.log('⚙️ Processing and storing events...');
  
  const processedEvents = [];
  
  for (const event of events) {
    try {
      // Transform Ticketmaster event to our schema
      const transformedEvent = {
        title: event.name,
        description: event.info || event.pleaseNote || '',
        venue: event._embedded?.venues?.[0]?.name || 'TBD',
        location: `${event._embedded?.venues?.[0]?.city?.name || 'San Francisco'}, ${event._embedded?.venues?.[0]?.state?.stateCode || 'CA'}`,
        event_date: event.dates?.start?.localDate,
        event_time: event.dates?.start?.localTime || null,
        url: event.url,
        source: 'ticketmaster',
        external_id: event.id,
        raw_data: event,
        quality_score: calculateQualityScore(event),
        event_status: 'active'
      };

      // Insert the event
      const { data: insertedEvent, error } = await supabase
        .from('events')
        .insert(transformedEvent)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Duplicate key error
          console.log(`⏭️ Skipping duplicate event: ${event.name}`);
        } else {
          console.error('❌ Error inserting event:', error);
        }
      } else {
        processedEvents.push(insertedEvent);
        console.log(`✅ Stored event: ${event.name}`);
      }

    } catch (eventError) {
      console.error('❌ Error processing event:', eventError);
    }
  }

  return processedEvents;
}

function calculateQualityScore(event: any): number {
  let score = 5; // Base score
  
  // Add points for complete information
  if (event.info || event.pleaseNote) score += 1;
  if (event._embedded?.venues?.[0]) score += 1;
  if (event.dates?.start?.localTime) score += 1;
  if (event.priceRanges?.length > 0) score += 1;
  if (event.images?.length > 0) score += 1;
  
  return Math.min(10, score);
}