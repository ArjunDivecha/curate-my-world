// Test the new Perplexity-powered event fetching system
console.log('🚀 Testing Perplexity-powered event fetching...');

async function testPerplexityEvents() {
  try {
    const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-events-perplexity';
    const authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4';
    
    const testPayload = {
      location: "San Francisco, CA",
      preferences: {
        categories: ["theatre", "music", "food festivals", "seasonal festivals"],
        priceRange: { min: 0, max: 200 },
        timePreferences: ["Evening"],
        customKeywords: ["summer festival", "cultural celebration"]
      }
    };
    
    console.log('📡 Calling Perplexity events function...');
    console.log('🎯 Test payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Function Error:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Function response received!');
    console.log('📋 Response keys:', Object.keys(data));
    
    if (data.success && data.events && data.events.length > 0) {
      console.log(`\n🎉 SUCCESS: Found ${data.events.length} events!`);
      
      // Show breakdown by category
      if (data.debug && data.debug.eventsByCategory) {
        console.log('\n📊 Events by category:');
        Object.entries(data.debug.eventsByCategory).forEach(([category, count]) => {
          console.log(`  ${category}: ${count} events`);
        });
      }
      
      // Show first few events in detail
      console.log('\n🎫 Sample Events:');
      data.events.slice(0, 3).forEach((event, index) => {
        console.log(`\n${index + 1}. "${event.title}"`);
        console.log(`   📅 Date: ${new Date(event.date_time).toLocaleDateString()}`);
        console.log(`   📍 Venue: ${event.venue}`);
        console.log(`   🏙️ City: ${event.city}, ${event.state || 'N/A'}`);
        console.log(`   🏷️ Category: ${event.category}`);
        console.log(`   💰 Price: $${event.price_min || '?'}-$${event.price_max || '?'}`);
        console.log(`   📝 Description: ${event.description?.substring(0, 100) || 'No description'}...`);
        console.log(`   🔗 URL: ${event.external_url || 'Not provided'}`);
        console.log(`   🏠 Source: ${event.source}`);
      });
      
      // Validate event structure
      console.log('\n🔍 Validating event structure...');
      let validEvents = 0;
      let issues = [];
      
      data.events.forEach((event, index) => {
        let valid = true;
        
        if (!event.title || event.title === 'Untitled Event') {
          issues.push(`Event ${index + 1}: Missing or invalid title`);
          valid = false;
        }
        
        if (!event.date_time || isNaN(new Date(event.date_time).getTime())) {
          issues.push(`Event ${index + 1}: Invalid date_time`);
          valid = false;
        }
        
        if (!event.venue) {
          issues.push(`Event ${index + 1}: Missing venue`);
          valid = false;
        }
        
        if (!event.category) {
          issues.push(`Event ${index + 1}: Missing category`);
          valid = false;
        }
        
        if (valid) validEvents++;
      });
      
      console.log(`✅ Valid events: ${validEvents}/${data.events.length}`);
      if (issues.length > 0) {
        console.log('⚠️  Issues found:');
        issues.forEach(issue => console.log(`   - ${issue}`));
      }
      
    } else {
      console.log('❌ No events found or function failed');
      if (data.error) {
        console.log('Error:', data.error);
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('🔍 Stack:', error.stack);
  }
}

testPerplexityEvents();