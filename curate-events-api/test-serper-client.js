#!/usr/bin/env node
/**
 * Test script for HighVolumeSerperClient functionality
 */

import { HighVolumeSerperClient } from './src/clients/HighVolumeSerperClient.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testHighVolumeSerperClient() {
  console.log('🧪 Testing High-Volume Serper Client...\n');

  if (!process.env.SERPER_API_KEY) {
    console.log('❌ SERPER_API_KEY not found in environment variables');
    process.exit(1);
  }

  const client = new HighVolumeSerperClient({
    apiKey: process.env.SERPER_API_KEY
  });

  try {
    // Test 1: Basic music events search
    console.log('🎵 Test 1: Music events search...');
    const response1 = await client.searchEvents({
      category: 'music concerts',
      location: 'San Francisco',
      topicProfile: 'music',
      scope: 'bayarea',
      limit: 10
    });
    console.log(`✅ Found ${response1.events?.length || 0} music events in Bay Area`);
    console.log(`   Processing time: ${response1.processingTime}ms`);
    console.log(`   Cost: $${response1.cost?.toFixed(6) || '0.000000'}`);
    if (response1.events && response1.events.length > 0) {
      console.log('   Sample event:', {
        title: response1.events[0].title,
        venue: response1.events[0].venue,
        date: response1.events[0].startDate,
        location: response1.events[0].location
      });
    }

    // Test 2: Arts & culture events
    console.log('\n🎨 Test 2: Arts & culture events...');
    const response2 = await client.searchEvents({
      category: 'art exhibitions',
      location: 'Berkeley',
      topicProfile: 'arts-culture',
      scope: 'berkeley',
      limit: 5
    });
    console.log(`✅ Found ${response2.events?.length || 0} arts events in Berkeley`);
    console.log(`   Processing time: ${response2.processingTime}ms`);
    console.log(`   Cost: $${response2.cost?.toFixed(6) || '0.000000'}`);

    // Test 3: Technology events with precision filtering
    console.log('\n💻 Test 3: Technology events...');
    const response3 = await client.searchEvents({
      category: 'tech meetups',
      location: 'San Francisco',
      topicProfile: 'technology',
      scope: 'bayarea',
      limit: 8,
      precision: 'official',
      horizonDays: 21
    });
    console.log(`✅ Found ${response3.events?.length || 0} tech events in Bay Area`);
    console.log(`   Raw results: ${response3.metadata?.rawResults || 0}`);
    console.log(`   Filtered out: ${response3.metadata?.filtered || 0}`);
    console.log(`   Processing time: ${response3.processingTime}ms`);

    // Test 4: Cache performance test
    console.log('\n⚡ Test 4: Cache performance...');
    const start1 = Date.now();
    await client.searchEvents({
      category: 'music concerts',
      location: 'San Francisco',
      topicProfile: 'music',
      scope: 'bayarea',
      limit: 10
    });
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    const cachedResponse = await client.searchEvents({
      category: 'music concerts',
      location: 'San Francisco',
      topicProfile: 'music',
      scope: 'bayarea',
      limit: 10
    });
    const time2 = Date.now() - start2;

    console.log(`✅ First call: ${time1}ms, Cached call: ${time2}ms`);
    if (time1 > time2) {
      console.log(`   Cache speedup: ${(((time1 - time2) / time1) * 100).toFixed(1)}%`);
    }

    // Test 5: Geographic scope filtering
    console.log('\n🌍 Test 5: Geographic scope filtering...');
    
    // Berkeley scope (most restrictive)
    const berkeleyEvents = await client.searchEvents({
      category: 'events',
      location: 'Berkeley',
      topicProfile: 'arts-culture',
      scope: 'berkeley',
      limit: 5
    });
    console.log(`   Berkeley scope: ${berkeleyEvents.events?.length || 0} events`);

    // East Bay scope (medium)
    const eastbayEvents = await client.searchEvents({
      category: 'events',
      location: 'Berkeley',
      topicProfile: 'arts-culture',
      scope: 'eastbay',
      limit: 5
    });
    console.log(`   East Bay scope: ${eastbayEvents.events?.length || 0} events`);

    // Bay Area scope (broadest)
    const bayareaEvents = await client.searchEvents({
      category: 'events',
      location: 'Berkeley',
      topicProfile: 'arts-culture',
      scope: 'bayarea',
      limit: 5
    });
    console.log(`   Bay Area scope: ${bayareaEvents.events?.length || 0} events`);

    // Test 6: Cost tracking
    console.log('\n💰 Test 6: Cost tracking...');
    const costStats = client.getCostStats();
    console.log('✅ Cost statistics:', {
      totalCost: `$${costStats.totalCost.toFixed(6)}`,
      requestCount: costStats.requestCount,
      averageCostPerRequest: `$${costStats.averageCostPerRequest?.toFixed(6) || '0.000000'}`
    });

    // Test 7: Event data structure validation
    console.log('\n📊 Test 7: Event data structure validation...');
    if (response1.events && response1.events.length > 0) {
      const event = response1.events[0];
      const requiredFields = ['id', 'title', 'category', 'source', 'startDate'];
      const optionalFields = ['venue', 'location', 'url', 'description', 'tags'];
      
      const missingRequired = requiredFields.filter(field => !event[field]);
      const presentOptional = optionalFields.filter(field => event[field]);
      
      if (missingRequired.length === 0) {
        console.log('✅ All required event fields present');
        console.log(`   Optional fields present: ${presentOptional.join(', ')}`);
        console.log(`   Event structure: ${Object.keys(event).join(', ')}`);
      } else {
        console.log(`❌ Missing required fields: ${missingRequired.join(', ')}`);
      }
    } else {
      console.log('⚠️ No events found for structure validation');
    }

    // Test 8: Date filtering
    console.log('\n📅 Test 8: Date filtering...');
    const shortHorizonEvents = await client.searchEvents({
      category: 'events',
      location: 'San Francisco',
      topicProfile: 'arts-culture',
      scope: 'bayarea',
      limit: 5,
      horizonDays: 7  // Only events in next week
    });
    
    const longHorizonEvents = await client.searchEvents({
      category: 'events',
      location: 'San Francisco',
      topicProfile: 'arts-culture',
      scope: 'bayarea',
      limit: 5,
      horizonDays: 60  // Events in next 2 months
    });

    console.log(`✅ 7-day horizon: ${shortHorizonEvents.events?.length || 0} events`);
    console.log(`✅ 60-day horizon: ${longHorizonEvents.events?.length || 0} events`);

    // Test 9: Error handling
    console.log('\n🚨 Test 9: Error handling...');
    try {
      await client.searchEvents({
        category: '',
        location: '',
        topicProfile: 'invalid',
        scope: 'invalid',
        limit: -1
      });
      console.log('⚠️ Invalid input handled gracefully');
    } catch (error) {
      console.log('✅ Properly handles invalid input:', error.message);
    }

    // Test 10: Performance summary
    console.log('\n📈 Test 10: Performance summary...');
    
    // Calculate average response times
    const responseTimes = [
      response1.processingTime,
      response2.processingTime,
      response3.processingTime
    ].filter(time => time > 0);
    
    if (responseTimes.length > 0) {
      const avgTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
      const minTime = Math.min(...responseTimes);
      const maxTime = Math.max(...responseTimes);
      
      console.log('✅ Performance metrics:', {
        averageResponseTime: `${avgTime.toFixed(0)}ms`,
        minResponseTime: `${minTime}ms`,
        maxResponseTime: `${maxTime}ms`,
        totalRequests: costStats.requestCount,
        averageCostPerRequest: `$${costStats.averageCostPerRequest?.toFixed(6)}`
      });
    }

    console.log('\n🎉 All High-Volume Serper Client tests completed!');

  } catch (error) {
    console.error('❌ High-Volume Serper Client test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testHighVolumeSerperClient();