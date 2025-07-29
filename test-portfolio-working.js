// Verify that portfolio scraping is working (without AI but with fallback)
const testPortfolioWorking = async () => {
  console.log('🔍 Testing portfolio scraping functionality...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "San Francisco, CA",
    preferences: {
      categories: ["Music"],
      customKeywords: ["concert"]
    }
  };
  
  try {
    console.log('📡 Calling function...');
    
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
    console.log(`✅ Success! Found ${data.events?.length || 0} events`);
    
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
        portfolioEvents.slice(0, 5).forEach((event, index) => {
          console.log(`${index + 1}. ${event.title}`);
          console.log(`   📍 ${event.venue}`);
          console.log(`   🔗 ${event.external_url}`);
          console.log('');
        });
        
        console.log('✅ Portfolio scraping is WORKING! (using fallback method)');
      } else {
        console.log('\n⚠️ No portfolio scraped events found');
      }
      
      // Show regular events too
      const regularEvents = data.events.filter(event => event.source === 'brave_search');
      console.log(`\n📋 Regular search events: ${regularEvents.length}`);
      
    } else {
      console.log('❌ No events found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testPortfolioWorking();
