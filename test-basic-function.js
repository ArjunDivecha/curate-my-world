// Test the basic function without AI to see if it works
const testBasicFunction = async () => {
  console.log('🔧 Testing basic function without AI...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "San Francisco, CA",
    preferences: {
      categories: ["Music"],
      customKeywords: ["concert"]
    }
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
  
  try {
    console.log('📡 Calling function with 15s timeout...');
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('📊 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Success! Events found:', data.events?.length || 0);
    
    if (data.events && data.events.length > 0) {
      // Check sources
      const sources = {};
      data.events.forEach(event => {
        sources[event.source] = (sources[event.source] || 0) + 1;
      });
      
      console.log('📊 Event sources:', sources);
      
      // Show first few events
      console.log('\n📋 Sample events:');
      data.events.slice(0, 3).forEach((event, index) => {
        console.log(`${index + 1}. ${event.title}`);
        console.log(`   📍 ${event.venue}`);
        console.log(`   🔗 ${event.source}`);
      });
    }
    
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.log('❌ Function timed out after 15 seconds');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
};

testBasicFunction();
