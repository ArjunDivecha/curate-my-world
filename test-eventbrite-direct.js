/**
 * Direct test of Eventbrite API to check if the token works
 */

const EVENTBRITE_TOKEN = "QTQLJLTFNS74VHZHBR6B";

async function testEventbriteAPI() {
  console.log('🎫 Testing Eventbrite API directly...');
  
  try {
    const url = new URL('https://www.eventbriteapi.com/v3/events/search/');
    
    const params = new URLSearchParams({
      'token': EVENTBRITE_TOKEN,
      'location.address': 'San Francisco, CA',
      'location.within': '25mi',
      'start_date.range_start': new Date().toISOString(),
      'start_date.range_end': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      'page': '1',
      'expand': 'venue,category,subcategory,ticket_availability,logo',
      'status': 'live',
      'order_by': 'start_asc'
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
      console.error('❌ Eventbrite API error:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ Eventbrite API success!');
    console.log('📊 Events found:', data.events?.length || 0);
    
    if (data.events && data.events.length > 0) {
      console.log('🎯 Sample event:', {
        name: data.events[0].name?.text,
        start: data.events[0].start?.local,
        venue: data.events[0].venue?.name,
        url: data.events[0].url
      });
    }

  } catch (error) {
    console.error('❌ Direct API test failed:', error);
  }
}

testEventbriteAPI();