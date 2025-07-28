// Test location filtering with Google Maps API
const testLocationFiltering = async () => {
  console.log('🌍 Testing location filtering with Google Maps API...\n');
  
  const testCases = [
    {
      name: 'San Francisco events',
      location: 'San Francisco, CA',
      expectedInArea: true
    },
    {
      name: 'San Jose events (should be included - Bay Area)',
      location: 'San Jose, CA', 
      expectedInArea: true
    },
    {
      name: 'Oakland events (should be included - Bay Area)',
      location: 'Oakland, CA',
      expectedInArea: true
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n--- Testing: ${testCase.name} ---`);
    
    try {
      const response = await fetch('https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dummy-token-for-testing'
        },
        body: JSON.stringify({
          location: testCase.location,
          preferences: {
            categories: ['Music'],
            customKeywords: ['concert', 'live']
          }
        })
      });

      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log(`Error details: ${errorText}`);
        continue;
      }

      const data = await response.json();
      console.log(`✅ Status: ${data.success ? 'Success' : 'Failed'}`);
      console.log(`📊 Events found: ${data.events?.length || 0}`);
      
      if (data.events && data.events.length > 0) {
        console.log('\n📍 Event locations found:');
        data.events.slice(0, 5).forEach((event, index) => {
          console.log(`  ${index + 1}. ${event.title}`);
          console.log(`     Venue: ${event.venue || 'Not specified'}`);
          console.log(`     Date: ${event.date || 'Not specified'}`);
          console.log(`     Location: ${event.location || 'Not specified'}`);
        });
        
        // Check if events are actually in the target area
        const outOfAreaEvents = data.events.filter(event => {
          const location = event.location || event.venue || '';
          return location.toLowerCase().includes('new york') || 
                 location.toLowerCase().includes('chicago') ||
                 location.toLowerCase().includes('los angeles') ||
                 location.toLowerCase().includes('miami');
        });
        
        if (outOfAreaEvents.length > 0) {
          console.log(`\n⚠️  Found ${outOfAreaEvents.length} potentially out-of-area events:`);
          outOfAreaEvents.forEach(event => {
            console.log(`     - ${event.title} (${event.location || event.venue})`);
          });
        } else {
          console.log('\n✅ All events appear to be in the correct geographic area');
        }
      } else if (data.message) {
        console.log(`📝 Message: ${data.message}`);
      }

    } catch (error) {
      console.error(`❌ Error testing ${testCase.name}:`, error.message);
    }
  }
  
  console.log('\n🏁 Location filtering test completed!');
};

// Run the test
testLocationFiltering().catch(console.error);