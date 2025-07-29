// Test portfolio page detection and scraping specifically
const testPortfolioDetection = async () => {
  console.log('🔍 Testing portfolio page detection and scraping...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "San Francisco, CA",
    preferences: {
      categories: ["Music"],
      customKeywords: ["concert", "music"]
    }
  };
  
  try {
    console.log('📡 Calling function with detailed logging...');
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ Response received! Found ${data.events?.length || 0} events`);
    
    if (data.events && data.events.length > 0) {
      // Analyze event sources
      const sourceBreakdown = {};
      data.events.forEach(event => {
        sourceBreakdown[event.source] = (sourceBreakdown[event.source] || 0) + 1;
      });
      
      console.log('\n📊 Event source breakdown:');
      Object.entries(sourceBreakdown).forEach(([source, count]) => {
        console.log(`  - ${source}: ${count} events`);
      });
      
      // Show portfolio scraped events specifically
      const portfolioEvents = data.events.filter(event => event.source === 'brave_search_scraped');
      
      if (portfolioEvents.length > 0) {
        console.log(`\n🎯 Portfolio scraped events (${portfolioEvents.length}):`);
        portfolioEvents.forEach((event, index) => {
          console.log(`${index + 1}. "${event.title}"`);
          console.log(`   📍 Venue: ${event.venue}`);
          console.log(`   📅 Date: ${event.date_time}`);
          console.log(`   🔗 URL: ${event.external_url}`);
          console.log('');
        });
        
        console.log('✅ Portfolio scraping IS working! Individual events extracted.');
      } else {
        console.log('\n❌ No portfolio scraped events found');
        console.log('This means either:');
        console.log('1. No portfolio pages were detected');
        console.log('2. Portfolio pages were detected but scraping failed');
        console.log('3. Portfolio pages were scraped but returned no events');
      }
      
      // Show all events for debugging
      console.log('\n📋 All events found:');
      data.events.forEach((event, index) => {
        console.log(`${index + 1}. "${event.title}" (${event.source})`);
        console.log(`   📍 ${event.venue}`);
        console.log(`   🔗 ${event.external_url}`);
        console.log('');
      });
      
    } else {
      console.log('❌ No events found at all');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testPortfolioDetection();
