#!/usr/bin/env node
/**
 * Simple Integration Test for Personalization System
 * Tests the basic workflow from user input to personalized events
 */

import fs from 'fs/promises';
import path from 'path';

async function testIntegration() {
  console.log('🧪 Simple Personalization Integration Test');
  console.log('='.repeat(50));
  
  try {
    // Test 1: Check if demo outputs exist
    console.log('\n📋 Test 1: Checking Demo Outputs');
    console.log('-'.repeat(30));
    
    const demoOutputsDir = 'demo_outputs';
    
    try {
      const files = await fs.readdir(demoOutputsDir);
      const curationFiles = files.filter(f => f.startsWith('curation_prompt_'));
      
      if (curationFiles.length === 0) {
        console.log('❌ No curation prompt files found');
        console.log('💡 Run: python demo_user_input.py');
        return;
      }
      
      const latestFile = curationFiles.sort().reverse()[0];
      console.log(`✅ Found curation prompt: ${latestFile}`);
      
      // Load and validate the prompt
      const filePath = path.join(demoOutputsDir, latestFile);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const curationPrompt = JSON.parse(fileContent);
      
      console.log(`📍 Location: ${curationPrompt.user_profile?.location?.primary_location}`);
      console.log(`🎯 Interests: ${Object.keys(curationPrompt.user_profile?.interests || {}).length} categories`);
      console.log(`⚙️  Max Events: ${curationPrompt.curation_parameters?.max_events_per_week}`);
      
    } catch (error) {
      console.log(`❌ Error reading demo outputs: ${error.message}`);
      console.log('💡 Run: python demo_user_input.py');
      return;
    }
    
    // Test 2: Check backend server status
    console.log('\n🔗 Test 2: Backend Server Status');
    console.log('-'.repeat(30));
    
    try {
      // Try to connect to the backend
      const response = await fetch('http://localhost:3000/api/health');
      
      if (response.ok) {
        const healthData = await response.json();
        console.log('✅ Backend server is running');
        console.log(`📊 Status: ${healthData.status}`);
      } else {
        console.log('❌ Backend server responded with error');
        console.log(`Status: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.log('❌ Cannot connect to backend server');
      console.log('💡 Start server: cd curate-events-api && npm start');
      return;
    }
    
    // Test 3: Check personalization route
    console.log('\n🎯 Test 3: Personalization Route');
    console.log('-'.repeat(30));
    
    try {
      const response = await fetch('http://localhost:3000/api/personalization/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      
      if (response.status === 400) {
        console.log('✅ Personalization route is responding (validation working)');
      } else {
        console.log(`⚠️  Unexpected response: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`❌ Personalization route error: ${error.message}`);
    }
    
    console.log('\n🎉 Basic integration test complete!');
    console.log('\n🚀 Next Steps:');
    console.log('1. Ensure demo data exists: python demo_user_input.py');
    console.log('2. Start backend server: cd curate-events-api && npm start');
    console.log('3. Run full integration test: node test_personalization_integration.js');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  }
}

// Use dynamic import for fetch if needed
const fetch = globalThis.fetch || (await import('node-fetch')).default;

testIntegration();
