// Test AI-powered portfolio scraping with detailed logging
const testAIPortfolioScraping = async () => {
  console.log('🤖 Testing AI-powered portfolio scraping...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "San Francisco, CA",
    preferences: {
      categories: ["Music"],
      priceRange: { min: 0, max: 100 },
      timePreferences: ["Evening (5-9pm)"],
      customKeywords: ["concert"]
    }
  };
  
  try {
    console.log('📡 Calling fetch-real-events function with AI portfolio analysis...');
    console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📊 Raw response:', responseText);
    
    if (!response.ok) {
      console.log('❌ Function failed with error response');
      return;
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON:', parseError.message);
      return;
    }
    
    console.log('✅ Function response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.events && data.events.length > 0) {
      console.log(`\n🎉 Found ${data.events.length} events!`);
      
      // Analyze event sources
      const sourceBreakdown = {};
      data.events.forEach(event => {
        sourceBreakdown[event.source] = (sourceBreakdown[event.source] || 0) + 1;
      });
      
      console.log(`📊 Event source breakdown:`);
      Object.entries(sourceBreakdown).forEach(([source, count]) => {
        console.log(`  - ${source}: ${count}`);
      });
      
      // Look for AI-scraped events
      const aiEvents = data.events.filter(event => event.source === 'ai_portfolio_scraped');
      
      if (aiEvents.length > 0) {
        console.log(`\n🤖 AI-extracted events (${aiEvents.length}):`);
        aiEvents.forEach((event, index) => {
          console.log(`${index + 1}. ${event.title}`);
          console.log(`   📅 Date: ${event.date_time}`);
          console.log(`   📍 Venue: ${event.venue}`);
          console.log(`   🏷️ Category: ${event.category}`);
          console.log(`   🔗 URL: ${event.external_url}`);
          console.log('');
        });
      } else {
        console.log('\n⚠️ No AI-extracted events found.');
      }
      
    } else {
      console.log('\n❌ No events found or function failed');
      if (data.error) {
        console.log('Error details:', data.error);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
};

testAIPortfolioScraping();
