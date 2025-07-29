import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

interface EventPreferences {
  categories: string[];
  priceRange: { min: number; max: number };
  timePreferences: string[];
  customKeywords: string[];
}

interface PerplexityEvent {
  title: string;
  date_time: string;
  end_date_time?: string;
  venue: string;
  address: string;
  city: string;
  state?: string;
  description: string;
  price_min?: number;
  price_max?: number;
  category: string;
  external_url?: string;
  source: string;
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
    const requestBody = await req.json();
    const { location, preferences } = requestBody;
    
    // Validate required fields
    if (!location || typeof location !== 'string') {
      throw new Error('Valid location is required');
    }
    
    console.log(`🎯 Fetching events for location: ${location}`);
    console.log(`🎛️ Preferences:`, JSON.stringify(preferences, null, 2));

    // Get Perplexity API key
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY') || 
                            Deno.env.get('PPLX_API_KEY') || 
                            Deno.env.get('PERPLEXITY_KEY') ||
                            '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';

    if (!perplexityApiKey) {
      throw new Error('Perplexity API key not found in environment');
    }

    // Get Supabase connection for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Fetch events using Perplexity
    const events = await fetchEventsWithPerplexity(location, preferences, perplexityApiKey);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          events: [], 
          message: `No events found in ${location} using Perplexity. Try adjusting your preferences.` 
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }

    console.log(`✨ Found ${events.length} events from Perplexity`);
    
    // Clear existing events and insert new ones
    console.log('🧹 Clearing existing events...');
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteError) {
      console.warn('Warning: Could not clear old events:', deleteError);
    }
    
    // Store events in database
    const { error } = await supabase
      .from('events')
      .insert(events);

    if (error) {
      console.error('Error storing events:', error);
      throw new Error(`Failed to store events in database: ${error.message}`);
    }

    // Count events by category for debugging
    const eventsByCategory = events.reduce((acc, event) => {
      acc[event.category] = (acc[event.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return new Response(
      JSON.stringify({ 
        success: true, 
        events: events,
        debug: {
          eventsByCategory,
          totalEvents: events.length,
          source: 'perplexity_api'
        },
        message: `Successfully found ${events.length} events in ${location} using Perplexity AI!` 
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-events-perplexity:', error);
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

async function fetchEventsWithPerplexity(
  location: string, 
  preferences: EventPreferences, 
  apiKey: string
): Promise<PerplexityEvent[]> {
  const allEvents: PerplexityEvent[] = [];
  
  // Create category-specific queries
  const categoryQueries = generateCategoryQueries(location, preferences);
  
  console.log(`🔍 Generated ${categoryQueries.length} category queries`);
  
  for (const query of categoryQueries) {
    try {
      console.log(`📡 Querying: ${query.category}`);
      const events = await queryPerplexity(query.prompt, query.category, location, apiKey);
      allEvents.push(...events);
      
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error querying ${query.category}:`, error);
      // Continue with other categories even if one fails
    }
  }
  
  // Remove duplicates and return comprehensive results
  const uniqueEvents = removeDuplicateEvents(allEvents);
  console.log(`📊 Unique events after deduplication: ${uniqueEvents.length}`);
  
  return uniqueEvents; // Return all unique events - no artificial limit
}

function generateCategoryQueries(location: string, preferences: EventPreferences) {
  const cityName = location.split(',')[0].trim();
  const now = new Date();
  const currentMonth = now.toLocaleString('default', { month: 'long' });
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleString('default', { month: 'long' });
  
  const queries = [];
  
  // Define comprehensive prompts for each event category - get ALL events, not just curated ones
  const categoryPrompts = {
    'theatre': `get me a list of all the theatre events playing in the bay area over the next 30 days`,
    
    'music': `Get me a list of all the live music events and concerts playing in the ${cityName} area over the next 30 days. Include all venues and all genres. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url.`,
    
    'street fairs': `Find ALL street fairs, outdoor festivals, community celebrations, block parties, and public gatherings in ${cityName} over the next 3 months. Include neighborhood festivals, street closures with events, outdoor markets, community gatherings, cultural street events, parades, outdoor celebrations, and any public festival or fair. Include both large organized events and small neighborhood gatherings. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include every outdoor community event regardless of size.`,
    
    'museums': `Find ALL museum exhibitions, gallery openings, art shows, gallery events, and cultural displays in ${cityName} over the next 3 months. Include major museums (SFMOMA, de Young, Legion of Honor), small galleries, community art centers, pop-up galleries, artist studios, cultural centers, library exhibitions, and any venue displaying art or cultural content. Include new exhibitions, ongoing shows, special events, gallery talks, artist receptions, and cultural displays. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include every art and cultural exhibition regardless of venue size or prestige.`,
    
    'tech conferences': `Find ALL technology events, conferences, meetups, workshops, hackathons, and tech gatherings in ${cityName} over the next 3 months. Include major conferences, small meetups, networking events, workshops, coding bootcamps, startup events, tech talks, demo days, coworking space events, university tech events, and any technology-related gathering. Include software, hardware, AI, blockchain, startups, design, data science, cybersecurity, and all tech topics. Include both paid and free events. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include every tech event regardless of size or topic specificity.`,
    
    'craft fairs': `Find ALL craft fairs, art markets, maker events, artisan shows, and creative gatherings in ${cityName} over the next 3 months. Include large craft fairs, small markets, maker faires, artist showcases, handmade goods sales, creative workshops, DIY events, pottery sales, jewelry shows, textile arts, woodworking, and any event featuring handmade or artistic items. Include both indoor and outdoor venues, permanent and temporary markets. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include every craft and artisan event regardless of size or type of craft.`,
    
    'seasonal festivals': `Get me a list of all the seasonal festivals and cultural celebrations in the ${cityName} area over the next 30 days. Include cultural festivals, community events, and heritage celebrations. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url.`,
    
    'academic talks': `Find ALL academic lectures, educational talks, scholarly presentations, seminars, and educational events in ${cityName} over the next 3 months. Include university lectures, research presentations, expert talks, educational seminars, book talks, library events, museum lectures, symposiums, academic conferences, continuing education, adult learning, and any educational presentation open to the public. Include events from universities, colleges, libraries, museums, community centers, and educational organizations. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include every educational event regardless of institution size or topic complexity.`,
    
    'food festivals': `Get me a list of all the food festivals and culinary events in the ${cityName} area over the next 30 days. Include food festivals, farmers markets, wine tastings, and food-related events. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url.`
  };
  
  // Generate queries for user-selected categories
  for (const category of preferences.categories || ['music', 'museums', 'food festivals']) {
    const categoryKey = category.toLowerCase().replace(/\s+/g, ' ');
    let prompt = categoryPrompts[categoryKey];
    
    // Fallback to generic prompt if specific category not found
    if (!prompt) {
      prompt = `Find ALL ${category.toLowerCase()} events in ${cityName} over the next 3 months. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include all events that are confirmed and open to the public.`;
    }
    
    queries.push({
      category: categoryKey || category.toLowerCase(),
      prompt: prompt
    });
  }
  
  // Add custom keyword queries if provided
  if (preferences.customKeywords && preferences.customKeywords.length > 0) {
    const keywordPrompt = `Find ALL events in ${cityName} related to: ${preferences.customKeywords.join(', ')} over the next 3 months. Return every single event that matches these criteria. Provide results as a JSON array with objects containing: event_name, start_date, end_date, venue_name, address, description, price_info, website_url. Include all confirmed public events.`;
    
    queries.push({
      category: 'custom',
      prompt: keywordPrompt
    });
  }
  
  return queries;
}

async function queryPerplexity(prompt: string, category: string, location: string, apiKey: string): Promise<PerplexityEvent[]> {
  // Exact replication of user's successful Python approach
  const payload = {
    model: 'sonar-reasoning',
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 8000,
    temperature: 0.1
  };

  console.log(`🐍 Replicating Python approach for ${category}`);
  console.log(`📡 Query: ${prompt}`);

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  console.log(`✅ Response received for ${category}`);
  console.log(`📝 Content length: ${content.length} characters`);
  console.log(`🔍 First 500 chars: ${content.substring(0, 500)}`);
  
  // Log full response like Python code did
  console.log(`📄 FULL RAW RESPONSE FOR ${category.toUpperCase()}:`);
  console.log('=' * 80);
  console.log(content);
  console.log('=' * 80);
  
  // Count potential events exactly like Python code
  const lines = content.split('\n');
  let eventPatterns = [];
  
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (stripped) {
      // Look for event title patterns exactly like Python
      if ((stripped.startsWith('**') && stripped.endsWith('**')) ||
          (stripped.startsWith('- **') && stripped.includes('**')) ||
          stripped.startsWith('•') ||
          stripped.startsWith('-')) {
        eventPatterns.push(`Line ${i+1}: ${stripped}`);
      }
    }
  }
  
  console.log(`🎭 ANALYSIS FOR ${category.toUpperCase()}:`);
  console.log(`📝 Total lines: ${lines.length}`);
  console.log(`🎪 Potential event patterns found: ${eventPatterns.length}`);
  
  if (eventPatterns.length > 0) {
    console.log(`📋 First 10 event patterns:`);
    for (let i = 0; i < Math.min(10, eventPatterns.length); i++) {
      console.log(`  ${eventPatterns[i]}`);
    }
  }
  
  // Parse using the same logic as before but with better debugging
  const events = parsePerplexityResponse(content, category, location);
  console.log(`📊 Final parsed events: ${events.length}`);
  
  return events;
}

function parsePerplexityResponse(content: string, category: string, location: string): PerplexityEvent[] {
  try {
    // First try to extract JSON from the response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\[([\s\S]*?)\]/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[0].replace(/```json\s*/, '').replace(/\s*```/, '');
      const rawEvents = JSON.parse(jsonStr);
      
      if (Array.isArray(rawEvents)) {
        return rawEvents.map((event: any) => {
          const startDate = parseEventDate(event.start_date || event.dates || event.date);
          const endDate = parseEventDate(event.end_date) || new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
          
          const priceInfo = event.price_info || event.price_range || '';
          let priceMin = null;
          let priceMax = null;
          
          if (priceInfo && priceInfo !== 'Contact venue') {
            const priceMatch = priceInfo.match(/\$(\d+)(?:-\$?(\d+))?/);
            if (priceMatch) {
              priceMin = parseInt(priceMatch[1]);
              priceMax = priceMatch[2] ? parseInt(priceMatch[2]) : priceMin;
            }
          }
          
          const cityName = location.split(',')[0].trim();
          const stateName = location.split(',')[1]?.trim() || 'CA';
          
          return {
            title: event.event_name || event.conference_name || event.name || event.title || 'Untitled Event',
            date_time: startDate.toISOString(),
            end_date_time: endDate.toISOString(),
            venue: event.venue_name || event.location || 'TBD',
            address: event.address || location,
            city: cityName,
            state: stateName,
            description: event.description || event.focus || '',
            price_min: priceMin,
            price_max: priceMax,
            category: category,
            external_url: event.website_url || event.url || null,
            source: 'perplexity_api'
          };
        }).filter(event => event.title !== 'Untitled Event');
      }
    }
    
    // If no JSON found, parse narrative format
    console.log('No JSON found, parsing narrative format...');
    return parseNarrativeResponse(content, category, location);
    
  } catch (error) {
    console.error('Error parsing JSON, trying narrative format:', error);
    return parseNarrativeResponse(content, category, location);
  }
}

function parseNarrativeResponse(content: string, category: string, location: string): PerplexityEvent[] {
  const events: PerplexityEvent[] = [];
  const cityName = location.split(',')[0].trim();
  const stateName = location.split(',')[1]?.trim() || 'CA';
  
  // Remove <think> sections that contain reasoning, not actual events
  const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  console.log(`🧹 Cleaned content length: ${cleanContent.length} (original: ${content.length})`);
  
  // Split content into lines and look for event patterns
  const lines = cleanContent.split('\n');
  let currentEvent: any = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for event titles (numbered lists, bullets, bold text)
    const titleMatch = line.match(/^\d+\.\s*\*\*([^*]+)\*\*/) ||  // "1. **Event Name**"
                      line.match(/^\*\*([^*]+)\*\*/) ||           // "**Event Name**"
                      line.match(/^-\s*\*\*([^*]+)\*\*/) ||       // "- **Event Name**"
                      line.match(/^•\s*([^•]+)/) ||               // "• Event Name"
                      line.match(/^-\s*([^-]+)(?:\s*-\s*|$)/);
    
    if (titleMatch) {
      // Save previous event if we have one
      if (currentEvent.title) {
        events.push(createEventFromNarrative(currentEvent, category, cityName, stateName));
      }
      
      // Start new event
      currentEvent = {
        title: titleMatch[1].trim()
      };
      continue;
    }
    
    // Look for venue information
    const venueMatch = line.match(/(?:at\s+|venue[:\s]+|location[:\s]+)([^,\n]+)/i);
    if (venueMatch && !currentEvent.venue) {
      currentEvent.venue = venueMatch[1].trim();
    }
    
    // Look for dates
    const dateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:-\d{1,2})?,?\s*\d{4}?/i) ||
                      line.match(/\d{1,2}\/\d{1,2}\/\d{4}/) ||
                      line.match(/(through|until|to)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i);
    
    if (dateMatch && !currentEvent.date) {
      currentEvent.date = dateMatch[0];
    }
    
    // Look for description (lines that aren't titles or venues)
    if (line.length > 20 && !titleMatch && !venueMatch && !dateMatch && line.includes(' ')) {
      if (!currentEvent.description) {
        currentEvent.description = line;
      } else {
        currentEvent.description += ' ' + line;
      }
    }
  }
  
  // Don't forget the last event
  if (currentEvent.title) {
    events.push(createEventFromNarrative(currentEvent, category, cityName, stateName));
  }
  
  console.log(`Parsed ${events.length} events from narrative format`);
  return events;
}

function createEventFromNarrative(eventData: any, category: string, cityName: string, stateName: string): PerplexityEvent {
  const startDate = parseEventDate(eventData.date);
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
  
  return {
    title: eventData.title || 'Untitled Event',
    date_time: startDate.toISOString(),
    end_date_time: endDate.toISOString(),
    venue: eventData.venue || 'TBD',
    address: eventData.address || `${cityName}, ${stateName}`,
    city: cityName,
    state: stateName,
    description: eventData.description || '',
    price_min: null,
    price_max: null,
    category: category,
    external_url: null,
    source: 'perplexity_api'
  };
}

function parseEventDate(dateStr: string | undefined): Date {
  if (!dateStr) {
    // Default to a random date in the next 30 days
    const now = new Date();
    const randomDays = Math.floor(Math.random() * 30) + 1;
    return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
  }
  
  try {
    // Try parsing the date string directly
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    
    // Handle common formats like "July 15-16, 2025" or "August 5, 2025"
    const monthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:-\d{1,2})?,?\s*(\d{4})?/i);
    if (monthMatch) {
      const month = monthMatch[1];
      const day = parseInt(monthMatch[2]);
      const year = parseInt(monthMatch[3]) || new Date().getFullYear();
      
      const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 
                         'july', 'august', 'september', 'october', 'november', 'december']
                         .findIndex(m => m.toLowerCase() === month.toLowerCase());
      
      if (monthIndex !== -1) {
        return new Date(year, monthIndex, day);
      }
    }
    
    // Fallback to current date plus random days
    const now = new Date();
    const randomDays = Math.floor(Math.random() * 30) + 1;
    return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
    
  } catch (error) {
    console.warn('Error parsing date:', dateStr, error);
    const now = new Date();
    const randomDays = Math.floor(Math.random() * 30) + 1;
    return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
  }
}

function removeDuplicateEvents(events: PerplexityEvent[]): PerplexityEvent[] {
  const uniqueEvents = new Map<string, PerplexityEvent>();
  
  for (const event of events) {
    // Create a key based on title and date
    const key = `${event.title.toLowerCase().trim()}|${new Date(event.date_time).toDateString()}`;
    
    // Keep the first occurrence or one with more complete information
    if (!uniqueEvents.has(key) || event.description.length > uniqueEvents.get(key)!.description.length) {
      uniqueEvents.set(key, event);
    }
  }
  
  return Array.from(uniqueEvents.values());
}