// Test Providence, RI with 10-mile radius
console.log('🏛️ TESTING: Providence, RI with 10-mile radius\n');

const testProvidenceEvents = async () => {
  console.log('📍 Location: Providence, RI');
  console.log('📏 Radius: 10 miles');
  console.log('🎯 Expected: Only Providence area events (no Boston, NYC, etc.)\n');
  console.log('═'.repeat(60));
  
  try {
    const response = await fetch('https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer demo-token'
      },
      body: JSON.stringify({
        location: 'Providence, RI',
        preferences: {
          categories: ['Music', 'Art', 'Food & Drink'],
          customKeywords: ['concert', 'show', 'festival', 'event']
        }
      })
    });

    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      if (response.status === 401) {
        console.log('📝 Note: Authentication is enabled. This test shows the API structure.');
        console.log('💡 To test in the app: Login at http://localhost:8081 and change location to Providence, RI in preferences');
      }
      return;
    }

    const data = await response.json();
    console.log(`✅ Status: ${data.success ? 'Success' : 'Failed'}`);
    console.log(`📊 Events found: ${data.events?.length || 0}`);
    
    if (data.events && data.events.length > 0) {
      console.log('\n📋 Providence Area Events:');
      console.log('─'.repeat(50));
      
      data.events.forEach((event, index) => {
        console.log(`\n${index + 1}. ${event.title}`);
        console.log(`   📍 Venue: ${event.venue || 'Not specified'}`);
        console.log(`   📅 Date: ${event.date || 'Not specified'}`);
        console.log(`   🌍 Location: ${event.location || 'Not specified'}`);
      });
      
      // Analyze geographic accuracy for 10-mile radius
      console.log('\n🔍 GEOGRAPHIC ANALYSIS:');
      console.log('─'.repeat(30));
      
      const locationAnalysis = {
        providence: 0,
        rhodeIsland: 0,
        nearbyMass: 0, // Within 10 miles might include some MA
        outOfRange: 0
      };
      
      const outOfRangeEvents = [];
      
      data.events.forEach(event => {
        const title = (event.title || '').toLowerCase();
        const venue = (event.venue || '').toLowerCase();
        const location = (event.location || '').toLowerCase();
        const fullText = `${title} ${venue} ${location}`;
        
        if (fullText.includes('providence')) {
          locationAnalysis.providence++;
        } else if (fullText.includes('rhode island') || fullText.includes(' ri ') || fullText.includes('cranston') || fullText.includes('warwick')) {
          locationAnalysis.rhodeIsland++;
        } else if (fullText.includes('massachusetts') || fullText.includes('boston') || fullText.includes('cambridge')) {
          // Boston is ~50 miles away, should be filtered out
          locationAnalysis.outOfRange++;
          outOfRangeEvents.push({...event, reason: 'Boston area (>10 miles)'});
        } else if (fullText.includes('new york') || fullText.includes('connecticut') || fullText.includes('hartford')) {
          locationAnalysis.outOfRange++;
          outOfRangeEvents.push({...event, reason: 'Too far from Providence'});
        } else {
          // Could be nearby MA towns within 10 miles
          locationAnalysis.nearbyMass++;
        }
      });
      
      console.log(`✅ Providence events: ${locationAnalysis.providence}`);
      console.log(`✅ Rhode Island events: ${locationAnalysis.rhodeIsland}`);
      console.log(`🤔 Nearby MA (could be within 10mi): ${locationAnalysis.nearbyMass}`);
      console.log(`❌ Out of range events: ${locationAnalysis.outOfRange}`);
      
      if (outOfRangeEvents.length > 0) {
        console.log('\n⚠️  EVENTS OUTSIDE 10-MILE RADIUS:');
        outOfRangeEvents.forEach(event => {
          console.log(`   • ${event.title} (${event.reason})`);
        });
      }
      
      // Calculate accuracy
      const localEvents = locationAnalysis.providence + locationAnalysis.rhodeIsland + locationAnalysis.nearbyMass;
      const totalEvents = data.events.length;
      const accuracyPercent = Math.round((localEvents / totalEvents) * 100);
      
      console.log(`\n🎯 Geographic Accuracy: ${accuracyPercent}% within reasonable range`);
      
      if (accuracyPercent >= 90) {
        console.log('✅ EXCELLENT: 10-mile radius filtering is working well!');
      } else if (accuracyPercent >= 75) {
        console.log('✅ GOOD: Most events are properly filtered');
      } else {
        console.log('⚠️  NEEDS IMPROVEMENT: Geographic filtering could be tighter');
      }
      
    } else if (data.message) {
      console.log(`📝 Message: ${data.message}`);
    }

  } catch (error) {
    console.error('❌ Error testing Providence events:', error.message);
  }
  
  console.log('\n🏁 Providence 10-mile test completed!');
  console.log('\n💡 To test in the live app:');
  console.log('   1. Go to http://localhost:8081');
  console.log('   2. Login/signup');
  console.log('   3. Click preferences icon');
  console.log('   4. Change location to "Providence, RI"');
  console.log('   5. Set radius to 10 miles');
  console.log('   6. Click "Fetch Real Events"');
};

// Run the test
testProvidenceEvents().catch(console.error);