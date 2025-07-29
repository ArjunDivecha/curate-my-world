// Test the actual portfolio scraping on the URLs we're getting

const portfolioUrls = [
  "https://sf.funcheap.com/city-guide/july-street-fairs-festivals/", // "San Francisco July Festivals & Street Fairs (2025)"
  "https://sf.funcheap.com/events-calendar/", // "San Francisco Events Calendar 2025/2026 | SF"  
  "https://www.ticketmaster.com/discover/concerts/san-francisco", // "San Francisco Concert Tickets"
  "https://sf.funcheap.com/18-fun-events-in-sf/", // "18 fun events in SF"
];

async function testPortfolioScraping(url) {
  console.log(`\n🔍 Testing portfolio scraping: ${url}`);
  console.log('=' .repeat(80));
  
  try {
    console.log('📡 Fetching URL...');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log(`📊 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status}`);
      return;
    }
    
    const html = await response.text();
    console.log(`📄 HTML length: ${html.length} characters`);
    
    // Check for JSON-LD structured data
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    console.log(`🔍 JSON-LD scripts found: ${jsonLdMatches ? jsonLdMatches.length : 0}`);
    
    if (jsonLdMatches) {
      for (let i = 0; i < jsonLdMatches.length; i++) {
        try {
          const jsonContent = jsonLdMatches[i].replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const data = JSON.parse(jsonContent);
          console.log(`📋 JSON-LD ${i + 1} type: ${data['@type'] || 'Unknown'}`);
          
          if (data['@type'] === 'Event' || (Array.isArray(data) && data.some(item => item['@type'] === 'Event'))) {
            console.log(`✅ Found Event data in JSON-LD ${i + 1}`);
            const eventList = Array.isArray(data) ? data.filter(item => item['@type'] === 'Event') : [data];
            console.log(`📊 Events in this JSON-LD: ${eventList.length}`);
            
            eventList.slice(0, 3).forEach((event, idx) => {
              console.log(`   ${idx + 1}. "${event.name}" - ${event.startDate}`);
            });
          }
        } catch (e) {
          console.log(`❌ Error parsing JSON-LD ${i + 1}: ${e.message}`);
        }
      }
    }
    
    // Test regex patterns
    console.log('\n🔍 Testing regex patterns...');
    const eventPatterns = [
      { name: "Concert/show pattern", regex: /([A-Za-z][^\n\r]{10,80}(?:concert|show|festival|performance|event|music|band|artist)[^\n\r]{0,40})\s*[-–—]?\s*([A-Za-z]+ \d{1,2}(?:,?\s*\d{4})?)/gi },
      { name: "Venue pattern", regex: /([A-Za-z][^\n\r]{10,80})\s+at\s+([A-Za-z][^\n\r]{5,50})\s*[-–—]?\s*([A-Za-z]+ \d{1,2}(?:,?\s*\d{4})?)/gi },
      { name: "Tickets pattern", regex: /([A-Za-z][^\n\r]{10,80}(?:tickets?|show|concert)[^\n\r]{0,40})\s*[-–—]?\s*([A-Za-z]+ \d{1,2}(?:,?\s*\d{4})?)/gi }
    ];
    
    let totalMatches = 0;
    
    eventPatterns.forEach(pattern => {
      const matches = [...html.matchAll(pattern.regex)];
      console.log(`📊 ${pattern.name}: ${matches.length} matches`);
      totalMatches += matches.length;
      
      matches.slice(0, 3).forEach((match, idx) => {
        const title = match[1]?.replace(/<[^>]*>/g, '').trim();
        const date = match[2] || match[3];
        console.log(`   ${idx + 1}. "${title}" - ${date}`);
      });
    });
    
    console.log(`🎯 Total regex matches: ${totalMatches}`);
    
    // Look for common event indicators in the HTML
    console.log('\n🔍 Checking for event indicators...');
    const indicators = [
      { name: "Event titles", count: (html.match(/event/gi) || []).length },
      { name: "Concert mentions", count: (html.match(/concert/gi) || []).length },
      { name: "Show mentions", count: (html.match(/show/gi) || []).length },
      { name: "Festival mentions", count: (html.match(/festival/gi) || []).length },
      { name: "Date patterns", count: (html.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi) || []).length },
      { name: "Venue patterns", count: (html.match(/\bat\s+[A-Z][a-z]/g) || []).length }
    ];
    
    indicators.forEach(indicator => {
      console.log(`📊 ${indicator.name}: ${indicator.count}`);
    });
    
  } catch (error) {
    console.log(`💥 Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🧪 Testing Portfolio Scraping on Actual URLs');
  console.log('=' .repeat(80));
  
  for (const url of portfolioUrls) {
    await testPortfolioScraping(url);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between requests
  }
  
  console.log('\n🎯 SUMMARY: Portfolio scraping debug results');
}

runTests();
