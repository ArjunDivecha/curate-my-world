import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    console.log('🧪 Starting Ticketmaster test...');
    
    // Get environment variables
    const ticketmasterApiKey = Deno.env.get('TICKETMASTER_API_KEY');
    
    if (!ticketmasterApiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'TICKETMASTER_API_KEY not found in environment variables' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }
    
    console.log('✅ API key found, length:', ticketmasterApiKey.length);
    
    // Test API call
    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    const params = new URLSearchParams({
      'apikey': ticketmasterApiKey,
      'city': 'San Francisco',
      'stateCode': 'CA',
      'countryCode': 'US',
      'size': '5',
      'sort': 'date,asc'
    });
    url.search = params.toString();
    
    console.log('📡 Making API request...');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CurateMyWorld/1.0'
      }
    });
    
    console.log('📊 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error:', errorText);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Ticketmaster API error: ${response.status}`,
          details: errorText
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
    
    const data = await response.json();
    const eventCount = data._embedded?.events?.length || 0;
    
    console.log('✅ API call successful, found events:', eventCount);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully tested Ticketmaster API - found ${eventCount} events`,
        eventCount,
        apiKeyLength: ticketmasterApiKey.length
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );

  } catch (error) {
    console.error('❌ Error in test function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
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