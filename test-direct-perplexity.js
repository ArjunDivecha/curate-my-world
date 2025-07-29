// Direct test to Perplexity API to see raw responses
console.log('🎭 Direct Perplexity API Test...');

async function testDirectPerplexity() {
  try {
    // Use environment variable or hardcoded key
    const apiKey = process.env.PERPLEXITY_API_KEY || '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';
    
    const query = "get me a list of all the theatre events playing in the bay area over the next 30 days";
    
    console.log('📡 Calling Perplexity API directly...');
    console.log('🎯 Query:', query);
    console.log('🤖 Model: sonar-reasoning');
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'sonar-reasoning',
        messages: [
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 8000,
        temperature: 0.1
      })
    });
    
    console.log('📊 Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      return;
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('✅ Response received!');
    console.log('📝 Content length:', content.length, 'characters');
    console.log('🔍 First 500 characters:');
    console.log(content.substring(0, 500));
    console.log('\n...\n');
    console.log('🔍 Last 500 characters:');
    console.log(content.substring(content.length - 500));
    
    // Count potential events by looking for patterns
    const lines = content.split('\n');
    let eventCount = 0;
    let eventLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Look for lines that might be event titles
      if (trimmed.match(/^\*\*([^*]+)\*\*/) || 
          trimmed.match(/^-\s*\*\*([^*]+)\*\*/) || 
          trimmed.match(/^•\s*([^•]+)/) ||
          trimmed.match(/^-\s*([^-]+)/)) {
        eventCount++;
        eventLines.push(trimmed);
      }
    }
    
    console.log(`\n🎭 Estimated events found: ${eventCount}`);
    console.log('📋 Sample event lines:');
    eventLines.slice(0, 10).forEach((line, i) => {
      console.log(`${i + 1}. ${line}`);
    });
    
    if (data.usage) {
      console.log('\n💰 Usage:', data.usage);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testDirectPerplexity();