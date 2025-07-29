import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with same config as frontend
const supabaseUrl = 'https://llspbinxevyitinvagvx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFrontendFetch() {
  console.log('🌐 Testing frontend fetch functionality...');
  
  try {
    // Simulate the exact same call the frontend makes
    console.log('📡 Calling fetch-real-events function (same as frontend)...');
    
    const { data, error } = await supabase.functions.invoke('fetch-real-events', {
      body: {
        location: 'San Francisco, CA',
        preferences: {
          categories: ['Music', 'Art', 'Food'],
          keywords: ['concert', 'festival', 'show']
        }
      }
    });

    if (error) {
      console.error('❌ Function call failed:', error);
      return;
    }

    console.log('✅ Function call successful!');
    console.log('📊 Response data:', data);
    
    if (data.debug) {
      console.log('\n🔍 DEBUG INFORMATION:');
      console.log('📊 Events by source:', data.debug.eventsBySource);
      console.log('📊 Total events:', data.debug.totalEvents);
      console.log('🎯 Portfolio events:', data.debug.portfolioEvents);
    }
    
    if (data.events) {
      console.log(`📊 Total events returned: ${data.events.length}`);
      
      // Check for portfolio scraped events
      const portfolioEvents = data.events.filter(event => 
        event.source === 'brave_search_scraped'
      );
      
      console.log(`🎯 Portfolio scraped events: ${portfolioEvents.length}`);
      
      if (portfolioEvents.length > 0) {
        console.log('\n🎯 PORTFOLIO SCRAPED EVENTS:');
        portfolioEvents.forEach((event, index) => {
          console.log(`${index + 1}. "${event.title}"`);
          console.log(`   📍 ${event.venue || 'Unknown venue'}`);
          console.log(`   📅 ${event.date || 'Unknown date'}`);
          console.log(`   🔗 ${event.url || 'No URL'}`);
          console.log('');
        });
      }
      
      // Show all events
      console.log('\n📋 ALL EVENTS:');
      data.events.forEach((event, index) => {
        console.log(`${index + 1}. "${event.title}" (${event.source})`);
      });
    }
    
    // Now check what's in the database
    console.log('\n🗄️ Checking database for recent events...');
    const { data: dbEvents, error: dbError } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (dbError) {
      console.error('❌ Database query failed:', dbError);
    } else {
      console.log(`📊 Database contains ${dbEvents.length} recent events`);
      
      const portfolioDbEvents = dbEvents.filter(event => 
        event.source === 'brave_search_scraped'
      );
      
      console.log(`🎯 Portfolio events in database: ${portfolioDbEvents.length}`);
      
      if (portfolioDbEvents.length > 0) {
        console.log('\n🎯 PORTFOLIO EVENTS IN DATABASE:');
        portfolioDbEvents.forEach((event, index) => {
          console.log(`${index + 1}. "${event.title}"`);
          console.log(`   📍 ${event.venue || 'Unknown venue'}`);
          console.log(`   📅 ${event.date || 'Unknown date'}`);
          console.log(`   🕒 Created: ${event.created_at}`);
          console.log('');
        });
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

testFrontendFetch();
