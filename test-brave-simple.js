// Simple test of Brave Search API
const testBraveSimple = async () => {
  console.log('Testing Brave Search API directly...');
  
  // Replace with your actual Brave Search API key
  const apiKey = 'YOUR_BRAVE_SEARCH_API_KEY';
  const query = 'San Francisco music events July 2025';
  
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '5');
  
  console.log('Query:', query);
  console.log('URL:', url.toString());
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      }
    });
    
    console.log('Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('Results found:', data.web?.results?.length || 0);
    
    if (data.web?.results) {
      data.web.results.forEach((result, index) => {
        console.log('\n--- RESULT ' + (index + 1) + ' ---');
        console.log('Title:', result.title);
        console.log('URL:', result.url);
        console.log('Description:', result.description?.substring(0, 100) + '...');
        
        // Check for event keywords
        const title = result.title || '';
        const description = result.description || '';
        const eventKeywords = ['concert', 'show', 'event', 'festival', 'exhibition', 'performance', 'tickets', 'live'];
        const hasEventKeywords = eventKeywords.some(keyword => 
          title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
        );
        console.log('Has event keywords:', hasEventKeywords);
        
        // Check for exclude keywords
        const excludeKeywords = ['trends report', 'annual report', 'guide', 'survey', 'forecasting', 'browser', 'upgrade'];
        const hasExcludeKeywords = excludeKeywords.some(keyword => 
          title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
        );
        console.log('Has exclude keywords:', hasExcludeKeywords);
        
        const shouldInclude = hasEventKeywords && !hasExcludeKeywords;
        console.log('Should include:', shouldInclude);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testBraveSimple();