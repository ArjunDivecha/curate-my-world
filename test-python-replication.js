// Exact replication of user's Python approach in Node.js
console.log('🐍 Replicating Python Perplexity Test in Node.js');

async function replicatePythonTest() {
  try {
    const apiKey = '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';
    const query = "get me a list of all the theatre events playing in the bay area over the next 30 days";
    
    console.log('🎯 Testing exact Python replication:');
    console.log('- Model: sonar-reasoning');
    console.log(`- Query: ${query}`);
    console.log('- Expected: ~40 events, ~7,239 characters');
    console.log('');
    
    const payload = {
      model: "sonar-reasoning",
      messages: [
        {
          role: "user",
          content: query
        }
      ],
      max_tokens: 8000,
      temperature: 0.1
    };
    
    console.log('📡 Making API call...');
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`📊 Response Status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      console.log(`✅ Success! Content length: ${content.length} characters`);
      console.log('\n' + '='.repeat(80));
      console.log('RAW RESPONSE:');
      console.log('='.repeat(80));
      console.log(content);
      console.log('='.repeat(80));
      
      // Count potential events like Python code
      const lines = content.split('\n');
      let eventPatterns = [];
      
      for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (stripped && (
          (stripped.startsWith('**') && stripped.endsWith('**')) ||
          (stripped.startsWith('- **') && stripped.includes('**')) ||
          stripped.startsWith('•') ||
          stripped.startsWith('-')
        )) {
          eventPatterns.push(`Line ${i+1}: ${stripped}`);
        }
      }
      
      console.log(`\n🎭 ANALYSIS:`);
      console.log(`📝 Total lines: ${lines.length}`);
      console.log(`🎪 Potential event patterns found: ${eventPatterns.length}`);
      
      if (eventPatterns.length > 0) {
        console.log(`\n📋 First 10 event patterns:`);
        for (let i = 0; i < Math.min(10, eventPatterns.length); i++) {
          console.log(`  ${eventPatterns[i]}`);
        }
      }
      
      console.log('\n📊 COMPARISON WITH YOUR PYTHON RESULTS:');
      console.log(`Your Python: ~40 events, ~7,239 characters`);
      console.log(`This test: ${eventPatterns.length} events, ${content.length} characters`);
      
      return { eventCount: eventPatterns.length, contentLength: content.length, content };
      
    } else {
      console.log(`❌ Error: ${response.status}`);
      console.log(`Response: ${await response.text()}`);
    }
    
    console.log('📝 Original Python structure comparison:');
    console.log(`
payload = {
    "model": "sonar-reasoning",
    "messages": [
        {
            "role": "user", 
            "content": "get me a list of all the theatre events playing in the bay area over the next 30 days"
        }
    ],
    "max_tokens": 8000,
    "temperature": 0.1
}

response = requests.post(
    "https://api.perplexity.ai/chat/completions",
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    json=payload
)

content = response.json()['choices'][0]['message']['content']
# This content contained 40 events in 7,239 characters
    `);
    
    console.log('🔍 Key differences to investigate:');
    console.log('1. API key - Supabase has working key, we need to use same one');
    console.log('2. Request format - Should be identical');
    console.log('3. Response parsing - Python saw narrative format with 40 events');
    console.log('4. Our TypeScript parsing might be missing events');
    console.log('');
    console.log('💡 Solution: Need to see actual Supabase function logs to compare');
    console.log('   the raw response content length and format');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

replicatePythonTest();