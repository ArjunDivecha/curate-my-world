#!/usr/bin/env node

/**
 * Standalone test for Serper API integration
 * Tests the new Serper.dev API key and client functionality
 */

import dotenv from 'dotenv';
import { SerperClient } from './src/clients/SerperClient.js';

// Load environment variables
dotenv.config();

async function testSerperAPI() {
    console.log('🧪 Testing Serper API Integration...\n');
    
    // Check if API key is loaded
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error('❌ SERPER_API_KEY not found in environment variables');
        process.exit(1);
    }
    
    console.log(`✅ API Key loaded: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
    
    // Initialize client
    const serperClient = new SerperClient();
    
    try {
        // Test 1: Health Check
        console.log('\n📡 Testing health check...');
        const healthResult = await serperClient.getHealthStatus();
        console.log('Health check result:', healthResult);
        
        if (healthResult.status !== 'healthy') {
            console.error('❌ Health check failed');
            return;
        }
        
        // Test 2: Search Events
        console.log('\n🔍 Testing event search...');
        const searchParams = {
            category: 'technology',
            location: 'San Francisco',
            limit: 5
        };
        
        console.log('Search parameters:', searchParams);
        
        const startTime = Date.now();
        const searchResult = await serperClient.searchEvents(searchParams);
        const duration = Date.now() - startTime;
        
        console.log(`\n⏱️  Search completed in ${duration}ms`);
        console.log('Search result:', JSON.stringify(searchResult, null, 2));
        
        const events = searchResult.events || [];
        console.log(`📊 Found ${events.length} events`);
        
        if (events.length > 0) {
            console.log('\n📋 Sample events:');
            events.slice(0, 3).forEach((event, index) => {
                console.log(`\n${index + 1}. ${event.title}`);
                console.log(`   📍 ${event.venue}`);
                console.log(`   📅 ${event.startDate}`);
                console.log(`   🔗 ${event.eventUrl}`);
                console.log(`   ⭐ Confidence: ${event.confidence}`);
                console.log(`   🏷️  Source: ${event.source}`);
            });
        }
        
        // Test 3: Different category
        console.log('\n🎵 Testing music events search...');
        const musicResult = await serperClient.searchEvents({
            category: 'music',
            location: 'San Francisco',
            limit: 3
        });
        
        const musicEvents = musicResult.events || [];
        console.log(`🎶 Found ${musicEvents.length} music events`);
        
        // Summary
        console.log('\n✅ All tests completed successfully!');
        console.log('\n📊 Test Summary:');
        console.log(`   - Health check: ${healthResult.status === 'healthy' ? 'PASS' : 'FAIL'}`);
        console.log(`   - Technology events: ${events.length} found`);
        console.log(`   - Music events: ${musicEvents.length} found`);
        console.log(`   - Total response time: ${duration}ms`);
        
    } catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error('Error message:', error.message);
        console.error('Error details:', error);
        
        if (error.response) {
            console.error('HTTP Status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        process.exit(1);
    }
}

// Run the test
testSerperAPI().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
