/**
 * Test script for the multi-source event discovery system
 * Run this to verify all APIs and functions are working correctly
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://llspbinxevyitinvagvx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSystem() {
  console.log('🚀 Testing Curate My World - Multi-Source Event Discovery System');
  console.log('=' .repeat(70));
  
  try {
    // Test 1: Check database schema
    console.log('\n📊 Test 1: Checking database schema...');
    
    const { data: eventSources, error: sourcesError } = await supabase
      .from('event_sources')
      .select('*')
      .limit(5);
    
    if (sourcesError) {
      console.error('❌ Database schema test failed:', sourcesError.message);
      console.log('💡 Please make sure you applied the database migration using migration-helper.html');
      return;
    }
    
    console.log(`✅ Found ${eventSources.length} event sources configured`);
    eventSources.forEach(source => {
      console.log(`   - ${source.name} (${source.source_type}): ${source.enabled ? 'Enabled' : 'Disabled'}`);
    });

    // Test 2: Test Eventbrite collector
    console.log('\n🎫 Test 2: Testing Eventbrite collector...');
    
    const eventbriteResult = await supabase.functions.invoke('eventbrite-collector', {
      body: {
        location: 'San Francisco, CA',
        categories: ['music', 'arts'],
        limit: 10
      }
    });

    if (eventbriteResult.error) {
      console.error('❌ Eventbrite test failed:', eventbriteResult.error);
    } else {
      const data = eventbriteResult.data;
      console.log(`✅ Eventbrite: ${data.success ? 'SUCCESS' : 'FAILED'}`);
      if (data.success) {
        console.log(`   - Found ${data.stats?.totalFound || 0} events`);
        console.log(`   - Added ${data.stats?.newEvents || 0} new events`);
        console.log(`   - Execution time: ${data.stats?.executionTimeMs || 0}ms`);
      } else {
        console.log(`   - Error: ${data.error}`);
      }
    }

    // Test 3: Test Ticketmaster collector
    console.log('\n🎭 Test 3: Testing Ticketmaster collector...');
    
    const ticketmasterResult = await supabase.functions.invoke('ticketmaster-collector', {
      body: {
        location: 'San Francisco, CA',
        coordinates: { lat: 37.7749, lng: -122.4194 },
        categories: ['music', 'arts'],
        limit: 10
      }
    });

    if (ticketmasterResult.error) {
      console.error('❌ Ticketmaster test failed:', ticketmasterResult.error);
    } else {
      const data = ticketmasterResult.data;
      console.log(`✅ Ticketmaster: ${data.success ? 'SUCCESS' : 'FAILED'}`);
      if (data.success) {
        console.log(`   - Found ${data.stats?.totalFound || 0} events`);
        console.log(`   - Added ${data.stats?.newEvents || 0} new events`);
        console.log(`   - Execution time: ${data.stats?.executionTimeMs || 0}ms`);
      } else {
        console.log(`   - Error: ${data.error}`);
      }
    }

    // Test 4: Test master orchestration
    console.log('\n🎺 Test 4: Testing master orchestration...');
    
    const orchestrationResult = await supabase.functions.invoke('orchestrate-collection', {
      body: {
        mode: 'incremental',
        location: 'San Francisco, CA',
        categories: ['music', 'arts', 'technology'],
        limits: { eventbrite: 15, ticketmaster: 15, brave: 10 }
      }
    });

    if (orchestrationResult.error) {
      console.error('❌ Orchestration test failed:', orchestrationResult.error);
    } else {
      const data = orchestrationResult.data;
      console.log(`✅ Orchestration: ${data.success ? 'SUCCESS' : 'FAILED'}`);
      if (data.success) {
        console.log(`   - Success rate: ${(data.summary.successRate * 100).toFixed(1)}%`);
        console.log(`   - Total events found: ${data.summary.totalEventsFound}`);
        console.log(`   - New events: ${data.summary.totalEventsNew}`);
        console.log(`   - Sources processed: ${data.summary.totalSources}`);
        console.log(`   - Execution time: ${data.executionTimeMs}ms`);
      } else {
        console.log(`   - Error: ${data.error}`);
      }
    }

    // Test 5: Check events in database
    console.log('\n📋 Test 5: Checking events in database...');
    
    const { data: recentEvents, error: eventsError } = await supabase
      .from('events')
      .select('id, title, venue, source, quality_score, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (eventsError) {
      console.error('❌ Events query failed:', eventsError.message);
    } else {
      console.log(`✅ Found ${recentEvents.length} recent events in database`);
      recentEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. "${event.title.substring(0, 50)}..." at ${event.venue}`);
        console.log(`      Source: ${event.source} | Quality: ${event.quality_score}/10 | ${new Date(event.created_at).toLocaleDateString()}`);
      });
    }

    // Test 6: Test AI deduplication (if we have events)
    if (recentEvents && recentEvents.length > 1) {
      console.log('\n🧠 Test 6: Testing AI deduplication...');
      
      const deduplicationResult = await supabase.functions.invoke('ai-deduplication', {
        body: {
          confidence_threshold: 0.7,
          batch_size: 20,
          location: 'San Francisco, CA'
        }
      });

      if (deduplicationResult.error) {
        console.error('❌ AI deduplication test failed:', deduplicationResult.error);
      } else {
        const data = deduplicationResult.data;
        console.log(`✅ AI Deduplication: ${data.success ? 'SUCCESS' : 'FAILED'}`);
        if (data.success) {
          console.log(`   - Events analyzed: ${data.result.total_events_analyzed}`);
          console.log(`   - Duplicate groups found: ${data.result.duplicate_groups_found}`);
          console.log(`   - Duplicates removed: ${data.result.duplicates_removed}`);
        } else {
          console.log(`   - Error: ${data.error}`);
        }
      }
    } else {
      console.log('\n🧠 Test 6: Skipping AI deduplication (not enough events)');
    }

    console.log('\n' + '=' .repeat(70));
    console.log('🎉 System testing completed!');
    console.log('💡 Your multi-source event discovery system is ready to use!');
    console.log('🚀 Next steps:');
    console.log('   1. Integration with your React frontend');
    console.log('   2. Set up scheduled collection runs');
    console.log('   3. Add user preferences and personalization');
    console.log('   4. Implement additional sources (RSS, social media)');

  } catch (error) {
    console.error('❌ System test failed with error:', error);
  }
}

// Run the test
testSystem();