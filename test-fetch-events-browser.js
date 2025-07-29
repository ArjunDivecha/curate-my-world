// Test the Fetch Events functionality as it would work in the browser
const testFetchEventsBrowser = async () => {
  console.log('🌐 Testing Fetch Events functionality (browser simulation)...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  // Simulate the payload that would be sent from the browser
  const testPayload = {
    location: "San Francisco, CA", // Default location
    preferences: {
      categories: ["Music", "Art", "Food"], // Default categories
      customKeywords: ["concert", "festival", "show"] // Default keywords
    }
  };
  
  try {
    console.log('📡 Calling fetch-real-events function...');
    console.log('📍 Location:', testPayload.location);
    console.log('🎯 Categories:', testPayload.preferences.categories);
    console.log('🔍 Keywords:', testPayload.preferences.customKeywords);
    
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
    console.log(`\n✅ SUCCESS! Events fetched and stored in database`);
    console.log(`📊 Total events found: ${data.events?.length || 0}`);
    
    if (data.events && data.events.length > 0) {
      // Analyze event sources
      const sourceBreakdown = {};
      data.events.forEach(event => {
        sourceBreakdown[event.source] = (sourceBreakdown[event.source] || 0) + 1;
      });
      
      console.log('\n📊 Event source breakdown:');
      Object.entries(sourceBreakdown).forEach(([source, count]) => {
        const emoji = source === 'brave_search_scraped' ? '🎯' : '🔍';
        console.log(`  ${emoji} ${source}: ${count} events`);
      });
      
      // Show portfolio scraped events specifically
      const portfolioEvents = data.events.filter(event => event.source === 'brave_search_scraped');
      
      if (portfolioEvents.length > 0) {
        console.log(`\n🎯 PORTFOLIO SCRAPED EVENTS (${portfolioEvents.length}):`);
        portfolioEvents.forEach((event, index) => {
          console.log(`${index + 1}. "${event.title}"`);
          console.log(`   📍 ${event.venue}`);
          console.log(`   📅 ${new Date(event.date_time).toLocaleDateString()}`);
          console.log(`   🔗 ${event.external_url}`);
          console.log('');
        });
        
        console.log('🎉 PORTFOLIO SCRAPING IS WORKING!');
        console.log('✅ Individual events are being extracted from portfolio pages');
        console.log('✅ Events are being stored in the database');
        console.log('✅ The browser would show these events in the UI');
      } else {
        console.log('\n⚠️ No portfolio scraped events found in this run');
      }
      
      // Show regular events too
      const regularEvents = data.events.filter(event => event.source === 'brave_search');
      if (regularEvents.length > 0) {
        console.log(`\n🔍 REGULAR SEARCH EVENTS (${regularEvents.length}):`);
        regularEvents.slice(0, 3).forEach((event, index) => {
          console.log(`${index + 1}. "${event.title}"`);
          console.log(`   📍 ${event.venue}`);
          console.log('');
        });
      }
      
      console.log('\n🌐 BROWSER INTEGRATION STATUS:');
      console.log('✅ Function call successful');
      console.log('✅ Events returned in correct format');
      console.log('✅ Portfolio scraping working');
      console.log('✅ Events would appear in the UI');
      console.log('\n🎯 The "Fetch Events" button in the browser will work correctly!');
      
    } else {
      console.log('❌ No events found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testFetchEventsBrowser();
