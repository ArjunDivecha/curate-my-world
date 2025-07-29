import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with correct credentials
const supabaseUrl = 'https://llspbinxevyitinvagvx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testActualUrls() {
  console.log('🔍 Getting actual URLs from Edge Function...');
  
  try {
    // Call the Edge Function with detailed logging enabled
    const { data, error } = await supabase.functions.invoke('fetch-real-events', {
      body: {
        location: 'San Francisco, CA',
        preferences: {
          categories: ['Music', 'Art', 'Food'],
          keywords: ['concert', 'festival', 'show']
        },
        debug: true // Enable debug mode if available
      }
    });

    if (error) {
      console.error('❌ Function call failed:', error);
      return;
    }

    console.log('✅ Function call successful!');
    
    if (data.events) {
      console.log(`📊 Total events returned: ${data.events.length}`);
      
      console.log('\n📋 ALL EVENTS WITH URLS:');
      data.events.forEach((event, index) => {
        console.log(`${index + 1}. "${event.title}"`);
        console.log(`   🔗 URL: ${event.external_url}`);
        console.log(`   📊 Source: ${event.source}`);
        console.log('');
      });
      
      // Test each URL to see which ones are accessible
      console.log('\n🧪 Testing URL accessibility...');
      
      for (let i = 0; i < Math.min(data.events.length, 5); i++) {
        const event = data.events[i];
        console.log(`\n🔍 Testing: "${event.title}"`);
        console.log(`🔗 URL: ${event.external_url}`);
        
        try {
          const response = await fetch(event.external_url, {
            method: 'HEAD', // Just check if accessible
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          console.log(`📊 Status: ${response.status} ${response.statusText}`);
          
          if (response.status === 200) {
            console.log('✅ URL is accessible');
          } else {
            console.log(`❌ URL returned error: ${response.status}`);
          }
          
        } catch (error) {
          console.log(`💥 URL failed: ${error.message}`);
        }
        
        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

testActualUrls();
