/**
 * Test the simplified Ticketmaster function
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://llspbinxevyitinvagvx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSimpleTicketmaster() {
  console.log('🎭 Testing simplified Ticketmaster function...');
  
  try {
    const result = await supabase.functions.invoke('ticketmaster-simple', {
      body: {
        location: 'San Francisco, CA',
        coordinates: { lat: 37.7749, lng: -122.4194 },
        categories: ['music'],
        limit: 5
      }
    });

    if (result.error) {
      console.error('❌ Function call failed:', result.error);
    } else {
      console.log('✅ Function call successful:');
      console.log(`   - Success: ${result.data.success}`);
      console.log(`   - Message: ${result.data.message}`);
      console.log(`   - Events found: ${result.data.stats?.totalFound || 0}`);
      console.log(`   - New events: ${result.data.stats?.newEvents || 0}`);
      console.log(`   - Execution time: ${result.data.stats?.executionTimeMs || 0}ms`);
      
      if (result.data.events && result.data.events.length > 0) {
        console.log('\n🎯 Sample events:');
        result.data.events.forEach((event, index) => {
          console.log(`   ${index + 1}. "${event.title}" at ${event.venue}`);
          console.log(`      Date: ${event.event_date} | Quality: ${event.quality_score}/10`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

testSimpleTicketmaster();