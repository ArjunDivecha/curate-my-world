// Basic Perplexity API test to verify connection and response
console.log('🚀 Testing basic Perplexity API access...');

async function testPerplexityBasic() {
  try {
    // Check if API key is available
    const apiKey = process.env.PPLX_API_KEY;
    if (!apiKey) {
      console.error('❌ PPLX_API_KEY environment variable not found');
      return;
    }
    
    console.log('✅ API key found, length:', apiKey.length);
    
    // Simple test query
    const testQuery = "What is the current date?";
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: testQuery
          }
        ],
        max_tokens: 100,
        temperature: 0.1
      })
    });
    
    console.log('📡 API Response Status:', response.status);
    console.log('📡 API Response Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ API Response received successfully!');
    console.log('📊 Response structure:', Object.keys(data));
    
    if (data.choices && data.choices.length > 0) {
      console.log('💬 Perplexity Response:', data.choices[0].message.content);
      console.log('🎉 SUCCESS: Perplexity API is working correctly!');
    } else {
      console.log('⚠️ Unexpected response structure:', JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
    console.error('🔍 Error details:', error);
  }
}

testPerplexityBasic();