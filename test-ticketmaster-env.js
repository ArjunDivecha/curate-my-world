/**
 * Test Ticketmaster function environment variables
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://llspbinxevyitinvagvx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testTicketmasterEnv() {
  console.log('🔍 Testing Ticketmaster environment variables...');
  
  try {
    const result = await supabase.functions.invoke('ticketmaster-collector', {
      body: {
        location: 'San Francisco, CA',
        coordinates: { lat: 37.7749, lng: -122.4194 },
        categories: ['music'],
        limit: 5
      }
    });

    if (result.error) {
      console.error('❌ Function call failed:');
      console.error('Status:', result.error.context?.status);
      console.error('Response:', result.error.message);
      
      // Try to get the response body
      if (result.error.context?.body) {
        try {
          const body = await result.error.context.body.text();
          console.error('Response body:', body);
        } catch (e) {
          console.error('Could not read response body');
        }
      }
    } else {
      console.log('✅ Function call successful:', result.data);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

testTicketmasterEnv();