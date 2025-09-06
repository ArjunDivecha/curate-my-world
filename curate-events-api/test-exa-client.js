#!/usr/bin/env node
/**
 * Test script for EnhancedExaClient functionality
 */

import { EnhancedExaClient } from './src/clients/EnhancedExaClient.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testEnhancedExaClient() {
  console.log('🧪 Testing Enhanced Exa Client...\n');

  if (!process.env.EXA_API_KEY) {
    console.log('❌ EXA_API_KEY not found in environment variables');
    process.exit(1);
  }

  const client = new EnhancedExaClient({
    apiKey: process.env.EXA_API_KEY
  });

  try {
    // Test 1: Basic event search
    console.log('🔍 Test 1: Basic event search...');
    const response1 = await client.searchEvents({
      category: 'music concerts',
      location: 'San Francisco',
      topicProfile: 'music',
      scope: 'berkeley',
      limit: 5
    });
    console.log(`✅ Found ${response1.events?.length || 0} music events in San Francisco`);
    if (response1.events && response1.events.length > 0) {
      console.log('   Sample event:', {
        title: response1.events[0].title,
        date: response1.events[0].date,
        venue: response1.events[0].venue,
        category: response1.events[0].category
      });
    }

    // Test 2: Different category search
    console.log('\n🎨 Test 2: Art events search...');
    const response2 = await client.searchEvents({
      category: 'art exhibitions galleries',
      location: 'San Francisco',
      topicProfile: 'arts-culture',
      scope: 'bayarea',
      limit: 3
    });
    console.log(`✅ Found ${response2.events?.length || 0} art events in Bay Area`);
    if (response2.events && response2.events.length > 0) {
      console.log('   Sample event:', {
        title: response2.events[0].title,
        venue: response2.events[0].venue,
        category: response2.events[0].category
      });
    }

    // Test 3: Test whitelist filtering
    console.log('\n📝 Test 3: Whitelist filtering...');
    const response3 = await client.searchEvents({
      category: 'tech talks meetups',
      location: 'Berkeley',
      topicProfile: 'technology',
      scope: 'berkeley',
      limit: 5,
      precision: 'official'
    });
    console.log(`✅ Found ${response3.events?.length || 0} tech events with official precision filtering`);

    // Test 4: Test cache performance
    console.log('\n⚡ Test 4: Cache performance...');
    const start1 = Date.now();
    await client.searchEvents({
      category: 'music concerts',
      location: 'San Francisco',
      topicProfile: 'music',
      scope: 'berkeley',
      limit: 5
    });
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await client.searchEvents({
      category: 'music concerts',
      location: 'San Francisco',
      topicProfile: 'music',
      scope: 'berkeley',
      limit: 5
    });
    const time2 = Date.now() - start2;

    console.log(`✅ First call: ${time1}ms, Cached call: ${time2}ms`);
    console.log(`   Cache speedup: ${(((time1 - time2) / time1) * 100).toFixed(1)}%`);

    // Test 5: Cost tracking validation
    console.log('\n💰 Test 5: Cost tracking...');
    const costStats = client.getCostStats();
    console.log('✅ Cost statistics:', {
      totalCost: `$${costStats.totalCost.toFixed(6)}`,
      requestCount: costStats.requestCount,
      averageCostPerRequest: `$${costStats.averageCostPerRequest?.toFixed(6) || '0.000000'}`
    });

    // Test 6: Validate event data structure
    console.log('\n📊 Test 6: Event data structure validation...');
    if (response1.events && response1.events.length > 0) {
      const event = response1.events[0];
      const requiredFields = ['title', 'date', 'venue', 'category', 'url', 'source'];
      const missingFields = requiredFields.filter(field => !event[field]);
      
      if (missingFields.length === 0) {
        console.log('✅ All required event fields present');
        console.log('   Event structure:', Object.keys(event).join(', '));
      } else {
        console.log(`❌ Missing fields: ${missingFields.join(', ')}`);
      }
    } else {
      console.log('⚠️ No events found for structure validation');
    }

    // Test 7: Error handling
    console.log('\n🚨 Test 7: Error handling...');
    try {
      await client.searchEvents({
        category: '',
        location: '',
        topicProfile: 'invalid',
        scope: 'invalid',
        limit: 0
      });
      console.log('❌ Should have thrown validation error');
    } catch (error) {
      console.log('✅ Properly handles invalid input:', error.message);
    }

    console.log('\n🎉 All Enhanced Exa Client tests completed!');

  } catch (error) {
    console.error('❌ Enhanced Exa Client test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testEnhancedExaClient();