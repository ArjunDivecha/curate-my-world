// Test single category to see detailed response
console.log('🎭 Testing single theatre category...');

async function testSingleCategory() {
  try {
    const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-events-perplexity';
    const authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4';
    
    const testPayload = {
      location: "San Francisco, CA",
      preferences: {
        categories: ["theatre"], // Only test theatre
        priceRange: { min: 0, max: 200 },
        timePreferences: ["Evening"],
        customKeywords: []
      }
    };
    
    console.log('📡 Calling function for theatre only...');
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Function Error:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Function response received!');
    
    if (data.success && data.events) {
      console.log(`\n🎉 Found ${data.events.length} theatre events!`);
      
      // Show all theatre events
      data.events.forEach((event, index) => {
        console.log(`\n${index + 1}. "${event.title}"`);
        console.log(`   📅 Date: ${new Date(event.date_time).toLocaleDateString()}`);
        console.log(`   📍 Venue: ${event.venue}`);
        console.log(`   📝 Description: ${event.description?.substring(0, 100) || 'No description'}...`);
        console.log(`   🔗 URL: ${event.external_url || 'Not provided'}`);
      });
      
    } else {
      console.log('❌ No events found or function failed');
      if (data.error) {
        console.log('Error:', data.error);
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testSingleCategory();