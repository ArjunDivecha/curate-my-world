/**
 * Test the simple Ticketmaster function
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://llspbinxevyitinvagvx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSimpleTicketmaster() {
  console.log('🧪 Testing simple Ticketmaster function...');
  
  try {
    const result = await supabase.functions.invoke('test-ticketmaster', {
      body: {}
    });

    if (result.error) {
      console.error('❌ Function call failed:', result.error);
    } else {
      console.log('✅ Function call successful:', result.data);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

testSimpleTicketmaster();