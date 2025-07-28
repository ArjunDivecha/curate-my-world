// Test with simpler queries
const testSimpleQuery = async () => {
  console.log('Testing simple queries...');
  
  const apiKey = 'BSAXThcr6XwVAvdRzzAhhhBhbGXCPaO';
  
  const queries = [
    'New York events',
    'NYC concerts',
    'events today',
    'concerts near me',
    'New York July events'
  ];
  
  for (const query of queries) {
    console.log(`\\n--- Testing: "${query}" ---`);
    
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '3');
    
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      });
      
      console.log('Status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Results: ${data.web?.results?.length || 0}`);
        
        if (data.web?.results && data.web.results.length > 0) {
          console.log('First result:', data.web.results[0].title);
        }
      } else {
        const errorText = await response.text();
        console.log('Error:', errorText);
      }
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log('Error:', error.message);
    }
  }
};

testSimpleQuery();
