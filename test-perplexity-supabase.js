// Test Perplexity API through Supabase Edge Function
console.log('🚀 Testing Perplexity API via Supabase Edge Function...');

async function testPerplexitySupabase() {
  try {
    const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/test-perplexity';
    const authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4';
    
    console.log('📡 Calling Supabase function:', functionUrl);
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        test: true
      })
    });
    
    console.log('📊 Function Response Status:', response.status);
    console.log('📊 Function Response Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Function Error Response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Function response received!');
    console.log('📋 Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('🎉 SUCCESS: Perplexity API is accessible through Supabase!');
      console.log('💬 Perplexity said:', data.response);
      if (data.usage) {
        console.log('📊 Usage stats:', data.usage);
      }
    } else {
      console.log('❌ Test failed:', data.error);
    }
    
  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
    console.error('🔍 Error details:', error);
  }
}

testPerplexitySupabase();