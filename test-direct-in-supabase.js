// Test calling the direct Perplexity approach through Supabase
console.log('🎯 Testing if we can replicate the successful approach in Supabase...');

async function testDirectSupabase() {
  try {
    const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/test-perplexity';
    const authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4';
    
    console.log('📡 Testing basic Perplexity connection through Supabase...');
    
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
    
    console.log('📊 Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Function Error:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ Function response received!');
    
    if (data.success && data.response) {
      console.log('🎉 Supabase can connect to Perplexity!');
      console.log('📝 Response length:', data.response.length, 'characters');
      console.log('🔍 First 200 chars:', data.response.substring(0, 200));
      
      console.log('\n💡 COMPARISON:');
      console.log('Direct Node.js test: 29 events, 9,859 characters');
      console.log(`Supabase test: Unknown events, ${data.response.length} characters`);
      
      if (data.response.length > 5000) {
        console.log('✅ Supabase is getting comprehensive responses too!');
        console.log('🔍 The issue must be in our parsing logic');
      } else {
        console.log('❌ Supabase is getting shorter responses');
        console.log('🔍 Need to investigate why Supabase responses differ');
      }
    } else {
      console.log('❌ Supabase test failed:', data.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testDirectSupabase();