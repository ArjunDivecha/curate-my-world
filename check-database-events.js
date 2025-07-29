// Check what events are actually stored in the database
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://llspbinxevyitinvagvx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzY3OTc1NSwiZXhwIjoyMDY5MjU1NzU1fQ.FWsVRHgQwKDhSsJJfNqMSsNzjhTKFmkBKKJvRCWNKVg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabaseEvents() {
  console.log('🔍 Checking events in database...');
  
  try {
    // Get recent events from the database
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('❌ Database error:', error);
      return;
    }
    
    console.log(`📊 Found ${events.length} recent events in database`);
    
    if (events.length > 0) {
      // Group by source
      const sourceBreakdown = {};
      events.forEach(event => {
        sourceBreakdown[event.source] = (sourceBreakdown[event.source] || 0) + 1;
      });
      
      console.log('\n📊 Database event sources:');
      Object.entries(sourceBreakdown).forEach(([source, count]) => {
        console.log(`  - ${source}: ${count} events`);
      });
      
      // Show scraped events specifically
      const scrapedEvents = events.filter(event => event.source === 'brave_search_scraped');
      
      if (scrapedEvents.length > 0) {
        console.log(`\n🎯 Scraped events in database (${scrapedEvents.length}):`);
        scrapedEvents.forEach((event, index) => {
          console.log(`${index + 1}. "${event.title}"`);
          console.log(`   📍 ${event.venue}`);
          console.log(`   📅 ${new Date(event.date_time).toLocaleDateString()}`);
          console.log(`   🔗 ${event.external_url}`);
          console.log(`   💾 Created: ${new Date(event.created_at).toLocaleString()}`);
          console.log('');
        });
        
        console.log('✅ Scraped events ARE being stored in the database!');
      } else {
        console.log('\n❌ No scraped events found in database');
      }
      
      // Show most recent events
      console.log('\n📋 Most recent events (all sources):');
      events.slice(0, 10).forEach((event, index) => {
        console.log(`${index + 1}. "${event.title}" (${event.source})`);
        console.log(`   📅 ${new Date(event.created_at).toLocaleString()}`);
        console.log('');
      });
      
    } else {
      console.log('❌ No events found in database');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  }
}

checkDatabaseEvents();
