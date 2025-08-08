#!/usr/bin/env node

// Automated test to verify category filtering
import fetch from 'node-fetch';

async function testCategoryFiltering() {
  console.log('🧪 Testing Category Filtering System\n');
  
  try {
    // Test backend API
    console.log('📡 Step 1: Testing Backend API...');
    const response = await fetch('http://localhost:8765/api/events/all-categories?location=San%20Francisco,%20CA&date_range=next%2030%20days&limit=3');
    
    if (!response.ok) {
      throw new Error(`Backend API failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Backend response received');
    console.log('📊 Total events:', data.totalEvents);
    console.log('🔑 Category keys:', Object.keys(data.eventsByCategory));
    
    // 2. Check for tech/technology duplication
    console.log('\n🔍 Step 2: Checking tech/technology categories...');
    const techEvents = data.eventsByCategory['tech'] || [];
    const technologyEvents = data.eventsByCategory['technology'] || [];
    
    console.log(`📂 'tech' category: ${techEvents.length} events`);
    console.log(`📂 'technology' category: ${technologyEvents.length} events`);
    console.log(`🔄 Combined total: ${techEvents.length + technologyEvents.length} events`);
    
    // 3. Verify other categories
    console.log('\n📋 Step 3: Event distribution by category:');
    Object.entries(data.eventsByCategory).forEach(([category, events]) => {
      console.log(`  ${category}: ${events.length} events`);
    });
    
    console.log('\n✅ Category filtering test data ready!');
    console.log('💡 Now test the frontend by:');
    console.log('   1. Click "Fetch Events" button in the UI');
    console.log('   2. Click "Technology" in the suggested categories sidebar');
    console.log('   3. Verify it shows combined tech + technology events');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCategoryFiltering();
