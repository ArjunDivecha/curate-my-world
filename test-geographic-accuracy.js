// Test geographic accuracy - check if system excludes far away events
const testGeographicAccuracy = async () => {
  console.log('🌍 Testing geographic accuracy and Google Maps API filtering...\n');
  
  // Test with a broader search that might include other cities
  try {
    const response = await fetch('https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token-for-testing'
      },
      body: JSON.stringify({
        location: 'San Francisco, CA',
        preferences: {
          categories: ['Music', 'Arts'],
          customKeywords: ['concert', 'show', 'festival', 'performance']
        }
      })
    });

    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log(`✅ Status: ${data.success ? 'Success' : 'Failed'}`);
    console.log(`📊 Events found: ${data.events?.length || 0}`);
    
    if (data.events && data.events.length > 0) {
      console.log('\n📍 Analyzing event geographic distribution:');
      
      const locationAnalysis = {
        sanFrancisco: 0,
        bayArea: 0,
        california: 0,
        outOfState: 0,
        unknown: 0
      };
      
      const suspiciousEvents = [];
      
      data.events.forEach((event, index) => {
        const title = (event.title || '').toLowerCase();
        const venue = (event.venue || '').toLowerCase();
        const location = (event.location || '').toLowerCase();
        const fullText = `${title} ${venue} ${location}`;
        
        console.log(`\n  ${index + 1}. ${event.title}`);
        console.log(`     Venue: ${event.venue || 'Not specified'}`);
        console.log(`     Location: ${event.location || 'Not specified'}`);
        
        // Categorize by location
        if (fullText.includes('san francisco') || fullText.includes('sf ')) {
          locationAnalysis.sanFrancisco++;
        } else if (fullText.includes('oakland') || fullText.includes('san jose') || 
                   fullText.includes('berkeley') || fullText.includes('palo alto') ||
                   fullText.includes('bay area')) {
          locationAnalysis.bayArea++;
        } else if (fullText.includes('california') || fullText.includes('ca ')) {
          locationAnalysis.california++;
        } else if (fullText.includes('new york') || fullText.includes('chicago') ||
                   fullText.includes('los angeles') || fullText.includes('miami') ||
                   fullText.includes('boston') || fullText.includes('seattle')) {
          locationAnalysis.outOfState++;
          suspiciousEvents.push(event);
        } else {
          locationAnalysis.unknown++;
        }
      });
      
      console.log('\n📊 Geographic Distribution Analysis:');
      console.log(`   San Francisco: ${locationAnalysis.sanFrancisco} events`);
      console.log(`   Bay Area: ${locationAnalysis.bayArea} events`);
      console.log(`   California: ${locationAnalysis.california} events`);
      console.log(`   Out of State: ${locationAnalysis.outOfState} events`);
      console.log(`   Unknown/Generic: ${locationAnalysis.unknown} events`);
      
      if (suspiciousEvents.length > 0) {
        console.log(`\n⚠️  Found ${suspiciousEvents.length} potentially out-of-area events:`);
        suspiciousEvents.forEach(event => {
          console.log(`     - ${event.title}`);
          console.log(`       Venue: ${event.venue || 'Not specified'}`);
        });
        console.log('\n❌ Google Maps filtering may need improvement');
      } else {
        console.log('\n✅ Geographic filtering is working correctly - no out-of-area events detected');
      }
      
      // Calculate accuracy percentage
      const localEvents = locationAnalysis.sanFrancisco + locationAnalysis.bayArea;
      const totalEvents = data.events.length;
      const accuracyPercent = Math.round((localEvents / totalEvents) * 100);
      
      console.log(`\n🎯 Geographic Accuracy: ${accuracyPercent}% of events are in SF/Bay Area`);
      
    } else if (data.message) {
      console.log(`📝 Message: ${data.message}`);
    }

  } catch (error) {
    console.error('❌ Error testing geographic accuracy:', error.message);
  }
  
  console.log('\n🏁 Geographic accuracy test completed!');
};

// Run the test
testGeographicAccuracy().catch(console.error);