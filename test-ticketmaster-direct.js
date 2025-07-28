/**
 * Direct test of Ticketmaster API to check if the keys work
 */

const TICKETMASTER_CONSUMER_KEY = "jVynCHEsWHOQELf9LRGBJxDBxEtwv0HU";

async function testTicketmasterAPI() {
  console.log('🎭 Testing Ticketmaster API directly...');
  
  try {
    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    
    const params = new URLSearchParams({
      'apikey': TICKETMASTER_CONSUMER_KEY,
      'city': 'San Francisco',
      'stateCode': 'CA',
      'countryCode': 'US',
      'size': '10',
      'sort': 'date,asc',
      'classificationName': 'Music'
    });

    url.search = params.toString();

    console.log('📡 Making request to:', url.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CurateMyWorld/1.0'
      }
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ticketmaster API error:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ Ticketmaster API success!');
    console.log('📊 Events found:', data._embedded?.events?.length || 0);
    
    if (data._embedded?.events && data._embedded.events.length > 0) {
      console.log('🎯 Sample event:', {
        name: data._embedded.events[0].name,
        date: data._embedded.events[0].dates?.start?.localDate,
        venue: data._embedded.events[0]._embedded?.venues?.[0]?.name,
        url: data._embedded.events[0].url
      });
    }

  } catch (error) {
    console.error('❌ Direct API test failed:', error);
  }
}

testTicketmasterAPI();