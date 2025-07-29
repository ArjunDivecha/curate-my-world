// Test what happens when the browser calls the function (simulate browser behavior)
const testBrowserSimulation = async () => {
  console.log('🌐 Simulating browser call to fetch-real-events...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  // This is exactly what the FetchEventsButton does
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
    console.log('📋 Payload (same as browser):', JSON.stringify(testPayload, null, 2));
    
    // Simulate the exact call the browser makes (with anon key instead of direct auth)
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📊 Raw response:', responseText);
    
    if (!response.ok) {
      console.log('❌ Function failed - this is what the browser sees');
      return;
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON:', parseError.message);
      return;
    }
    
    console.log('✅ Function succeeded - browser would see:', JSON.stringify(data, null, 2));
    
    if (data.success && data.events && data.events.length > 0) {
      console.log(`\n🎉 Browser would show: Found ${data.events.length} events!`);
      
      // Show AI-scraped events
      const aiEvents = data.events.filter(event => event.source === 'ai_portfolio_scraped');
      if (aiEvents.length > 0) {
        console.log(`🤖 AI-extracted events that browser would display: ${aiEvents.length}`);
        aiEvents.slice(0, 3).forEach((event, index) => {
          console.log(`${index + 1}. ${event.title} at ${event.venue}`);
        });
      }
    } else {
      console.log('\n❌ Browser would show: No events found');
      if (data.error) {
        console.log('Error browser would see:', data.error);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Browser would see network error:', error.message);
  }
};

testBrowserSimulation();
