// Debug the function step by step
const debugFunction = async () => {
  console.log('🔍 Debugging function step by step...');
  
  // Test 1: Direct Brave Search
  console.log('\\n--- TEST 1: Direct Brave Search ---');
  const apiKey = 'BSAXThcr6XwVAvdRzzAhhhBhbGXCPaO';
  const query = 'New York concerts July 2025 site:eventbrite.com';
  
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '3');
  url.searchParams.set('freshness', 'pw'); // past week
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Brave Search returned ${data.web?.results?.length || 0} results`);
      
      if (data.web?.results) {
        data.web.results.forEach((result, index) => {
          console.log(`\\n${index + 1}. ${result.title}`);
          console.log(`   URL: ${result.url}`);
          console.log(`   Description: ${result.description?.substring(0, 100)}...`);
          
          // Test filtering logic
          const title = result.title || '';
          const description = result.description || '';
          const url_str = result.url || '';
          
          const eventKeywords = ['concert', 'show', 'festival', 'exhibition', 'performance', 'tickets', 'live', 'events'];
          const excludeKeywords = ['trends report', 'annual report', 'guide', 'survey', 'forecasting', 'browser', 'upgrade'];
          
          const hasEventKeywords = eventKeywords.some(keyword => 
            title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
          );
          
          const hasExcludeKeywords = excludeKeywords.some(keyword => 
            title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
          );
          
          const hasEventUrl = url_str.includes('/e/') || url_str.includes('/events/') || url_str.includes('tickets') || url_str.includes('concerts');
          
          const shouldInclude = (hasEventKeywords && !hasExcludeKeywords) || hasEventUrl;
          
          console.log(`   Event keywords: ${hasEventKeywords}`);
          console.log(`   Exclude keywords: ${hasExcludeKeywords}`);
          console.log(`   Event URL: ${hasEventUrl}`);
          console.log(`   Should include: ${shouldInclude}`);
        });
      }
    } else {
      console.log('❌ Brave Search failed:', response.status);
    }
  } catch (error) {
    console.log('❌ Brave Search error:', error.message);
  }
  
  // Test 2: Function call with detailed logging
  console.log('\\n--- TEST 2: Function Call ---');
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "New York, NY",
    preferences: {
      categories: ["Music"],
      priceRange: { min: 0, max: 100 },
      timePreferences: ["Evening (5-9pm)"],
      customKeywords: ["concert"]
    }
  };
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    const data = await response.json();
    console.log('Function response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.log('❌ Function error:', error.message);
  }
};

debugFunction();
