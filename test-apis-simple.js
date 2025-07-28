/**
 * Simple API test to check if our keys work directly
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://llspbinxevyitinvagvx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSimple() {
  console.log('🔍 Testing simple function call...');
  
  try {
    // Test a very simple function call to see if the basic setup works
    const result = await supabase.functions.invoke('fetch-real-events', {
      body: {
        location: 'San Francisco, CA',
        preferences: {
          categories: ['music'],
          customKeywords: []
        }
      }
    });

    if (result.error) {
      console.error('❌ Function call failed:', result.error);
    } else {
      console.log('✅ Function call succeeded:', result.data);
    }

    // Test database access
    console.log('\n📊 Testing database access...');
    const { data: sources, error: dbError } = await supabase
      .from('event_sources')
      .select('name, enabled, last_run')
      .eq('enabled', true);

    if (dbError) {
      console.error('❌ Database access failed:', dbError);
    } else {
      console.log('✅ Database access succeeded:');
      sources.forEach(source => {
        console.log(`   - ${source.name}: ${source.last_run ? 'Previously run' : 'Never run'}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSimple();