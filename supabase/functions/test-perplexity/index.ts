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
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    console.log('🚀 Testing Perplexity API access from Supabase...');

    // Check if API key is available in Supabase environment
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY') || 
                            Deno.env.get('PPLX_API_KEY') || 
                            Deno.env.get('PERPLEXITY_KEY');

    if (!perplexityApiKey) {
      console.error('❌ Perplexity API key not found in environment');
      console.log('Available env vars:', Object.keys(Deno.env.toObject()).filter(key => key.includes('API') || key.includes('KEY')));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Perplexity API key not found in environment variables',
          availableKeys: Object.keys(Deno.env.toObject()).filter(key => key.includes('API') || key.includes('KEY'))
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

    console.log('✅ Perplexity API key found, length:', perplexityApiKey.length);

    // Tech conference test query
    const testQuery = "Get me a list of all the major tech conferences in the Bay Area that are open to the public in the next 3 months. Provide the results formatted as a JSON array, with each object containing: conference name, dates, location, focus, registration status, and price range.";
    
    console.log('📡 Making API call to Perplexity...');
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityApiKey}`
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'user',
            content: testQuery
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      })
    });

    console.log('📊 Perplexity API Response Status:', response.status);
    console.log('📊 Perplexity API Response Status Text:', response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Perplexity API Error:', errorText);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Perplexity API error: ${response.status} - ${errorText}`,
          status: response.status
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
    console.log('✅ Perplexity API Response received successfully!');
    console.log('📋 Response keys:', Object.keys(data));

    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      console.log('💬 Perplexity Response:', content);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Perplexity API test successful!',
          query: testQuery,
          response: content,
          usage: data.usage || null
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    } else {
      console.log('⚠️ Unexpected response structure:', JSON.stringify(data, null, 2));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unexpected response structure from Perplexity',
          response: data
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

  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
    console.error('🔍 Error stack:', error.stack);
    
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