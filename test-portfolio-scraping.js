// Test portfolio scraping functionality
const testPortfolioScraping = async () => {
  console.log('🧪 Testing portfolio scraping functionality...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "San Francisco, CA",
    preferences: {
      categories: ["Music", "Art"],
      priceRange: { min: 0, max: 100 },
      timePreferences: ["Evening (5-9pm)"],
      customKeywords: ["concert", "festival"]
    }
  };
  
  try {
    console.log('📡 Calling fetch-real-events function...');
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Function response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.events && data.events.length > 0) {
      console.log(`\n🎉 Found ${data.events.length} events!`);
      
      // Look for portfolio-scraped events
      const portfolioEvents = data.events.filter(event => event.source === 'portfolio_scraped');
      const braveEvents = data.events.filter(event => event.source === 'brave_search');
      
      console.log(`📊 Event breakdown:`);
      console.log(`  - Portfolio scraped: ${portfolioEvents.length}`);
      console.log(`  - Brave search: ${braveEvents.length}`);
      
      if (portfolioEvents.length > 0) {
        console.log(`\n🔍 Portfolio scraped events:`);
        portfolioEvents.forEach((event, index) => {
          console.log(`${index + 1}. ${event.title}`);
          console.log(`   📅 Date: ${event.date_time}`);
          console.log(`   📍 Venue: ${event.venue}`);
          console.log(`   🏷️ Category: ${event.category}`);
          console.log(`   🔗 URL: ${event.external_url}`);
          console.log('');
        });
      } else {
        console.log('\n⚠️ No portfolio scraped events found. Portfolio scraping may not be working.');
      }
      
      // Look for events that might have been portfolio pages
      const potentialPortfolioEvents = data.events.filter(event => 
        event.title.match(/\d+\s+(fun\s+)?events/i) || 
        event.title.includes('calendar') ||
        event.title.includes('upcoming events') ||
        event.title.includes('event guide')
      );
      
      if (potentialPortfolioEvents.length > 0) {
        console.log(`\n🔍 Potential portfolio pages that weren't scraped:`);
        potentialPortfolioEvents.forEach((event, index) => {
          console.log(`${index + 1}. ${event.title}`);
          console.log(`   🔗 URL: ${event.external_url}`);
        });
      }
      
    } else {
      console.log('\n❌ No events found or function failed');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
};

testPortfolioScraping();
