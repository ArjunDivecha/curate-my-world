// Test the function directly to see what happens
const testFunctionDirect = async () => {
  console.log('Testing function directly...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "New York, NY",
    preferences: {
      categories: ["Music"],
      priceRange: { min: 0, max: 100 },
      timePreferences: ["Evening (5-9pm)"],
      customKeywords: ["concert", "live"]
    }
  };
  
  console.log('Calling function...');
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.success && data.events && data.events.length > 0) {
      console.log(`\\n🎉 Function found ${data.events.length} new events!`);
      data.events.forEach((event, index) => {
        console.log(`${index + 1}. ${event.title} at ${event.venue}`);
      });
    } else {
      console.log('\\n❌ Function returned no events');
    }
    
  } catch (error) {
    console.error('\\n❌ ERROR:', error.message);
  }
};

testFunctionDirect();
