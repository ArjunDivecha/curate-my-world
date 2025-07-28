import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventPreferences {
  location: string;
  categories: string[];
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
    const { location, preferences }: { location: string; preferences: EventPreferences } = await req.json();
    
    console.log('Fetching events for location:', location, 'with preferences:', preferences);

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!perplexityApiKey || !openaiApiKey) {
      throw new Error('Missing API keys');
    }

    // Search for events using Perplexity
    const eventSearchQuery = buildSearchQuery(location, preferences);
    console.log('Search query:', eventSearchQuery);

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: `You are an event finder AI. Return ONLY a JSON array of events with this exact structure:
            [
              {
                "title": "Event Name",
                "description": "Event description",
                "startDate": "2025-07-28T19:00:00Z",
                "endDate": "2025-07-28T22:00:00Z",
                "venue": "Venue Name",
                "address": "Full Address",
                "city": "${location}",
                "state": "State/Province",
                "category": "music|food|art|sports|tech|business|health|education|entertainment|other",
                "priceMin": 0,
                "priceMax": 100,
                "externalUrl": "https://event-url.com",
                "imageUrl": "https://image-url.com/image.jpg"
              }
            ]
            Return real, current events happening in the next 30 days. Include ticket prices when available.`
          },
          {
            role: 'user',
            content: eventSearchQuery
          }
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    const perplexityData = await perplexityResponse.json();
    console.log('Perplexity response:', perplexityData);

    if (!perplexityData.choices?.[0]?.message?.content) {
      throw new Error('No events found from Perplexity');
    }

    // Parse events from Perplexity response
    let rawEvents;
    try {
      const content = perplexityData.choices[0].message.content;
      // Extract JSON from the content if it's wrapped in markdown
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      rawEvents = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Error parsing events JSON:', parseError);
      throw new Error('Failed to parse events from search results');
    }

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      throw new Error('No valid events found');
    }

    console.log('Found', rawEvents.length, 'raw events');

    // Use OpenAI to curate and score events
    const curationPrompt = buildCurationPrompt(preferences);
    
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: curationPrompt
          },
          {
            role: 'user',
            content: `Here are the events to curate and score: ${JSON.stringify(rawEvents)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    const openaiData = await openaiResponse.json();
    console.log('OpenAI curation response received');

    if (!openaiData.choices?.[0]?.message?.content) {
      throw new Error('Failed to curate events with AI');
    }

    // Parse curated events
    let curatedEvents;
    try {
      const content = openaiData.choices[0].message.content;
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      curatedEvents = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Error parsing curated events:', parseError);
      throw new Error('Failed to parse curated events');
    }

    // Store events in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const eventsToStore = curatedEvents.map((event: any) => ({
      title: event.title,
      description: event.description,
      date_time: event.startDate,
      end_date_time: event.endDate,
      venue: event.venue,
      address: event.address,
      city: event.city,
      state: event.state,
      category: event.category,
      price_min: event.priceMin || 0,
      price_max: event.priceMax || 0,
      external_url: event.externalUrl,
      image_url: event.imageUrl,
      source: 'perplexity_search',
      tags: event.tags || []
    }));

    console.log('Storing', eventsToStore.length, 'events in database');

    const { data: storedEvents, error: storeError } = await supabase
      .from('events')
      .upsert(eventsToStore, { onConflict: 'title,date_time', ignoreDuplicates: false })
      .select();

    if (storeError) {
      console.error('Error storing events:', storeError);
      throw new Error('Failed to store events in database');
    }

    console.log('Successfully stored', storedEvents?.length || 0, 'events');

    // Return the curated events with relevance scores
    return new Response(JSON.stringify({
      success: true,
      events: curatedEvents,
      stored: storedEvents?.length || 0,
      message: `Found and curated ${curatedEvents.length} events for ${location}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-real-events function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || 'Failed to fetch events'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSearchQuery(location: string, preferences: EventPreferences): string {
  const categories = preferences.categories?.join(', ') || '';
  const keywords = preferences.customKeywords?.join(', ') || '';
  
  let query = `Find current upcoming events in ${location} happening in the next 30 days.`;
  
  if (categories) {
    query += ` Focus on these categories: ${categories}.`;
  }
  
  if (keywords) {
    query += ` Include events related to: ${keywords}.`;
  }
  
  if (preferences.priceRange) {
    const { min, max } = preferences.priceRange;
    if (max === 0) {
      query += ` Include free events.`;
    } else {
      query += ` Include events with ticket prices between $${min} and $${max}.`;
    }
  }
  
  query += ` Include event details like venue, date, time, description, and ticket information.`;
  
  return query;
}

function buildCurationPrompt(preferences: EventPreferences): string {
  return `You are an AI event curator. Your job is to score and enhance event data based on user preferences.

USER PREFERENCES:
- Categories of interest: ${preferences.categories?.join(', ') || 'all'}
- Custom keywords: ${preferences.customKeywords?.join(', ') || 'none'}
- Price range: $${preferences.priceRange?.min || 0} - $${preferences.priceRange?.max || 'unlimited'}
- Time preferences: ${preferences.timePreferences?.join(', ') || 'any time'}

For each event, return a JSON array with the same structure but enhanced with:
1. "personalRelevanceScore": number between 0-100 based on how well it matches preferences
2. "aiReasoning": string explaining why this event is relevant to the user
3. "tags": array of relevant tags for better categorization
4. Enhanced and cleaned up descriptions
5. Validate and correct any data inconsistencies

Score events higher if they:
- Match the user's preferred categories
- Include their custom keywords
- Fall within their price range
- Happen during their preferred times
- Have good reviews or seem popular
- Are unique or special experiences

Return ONLY the JSON array, no additional text.`;
}