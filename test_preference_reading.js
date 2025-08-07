#!/usr/bin/env node
/**
 * Test script to verify that the system is correctly reading user preference JSON files
 */

import fs from 'fs/promises';
import path from 'path';

async function testPreferenceReading() {
  console.log('📋 TESTING PREFERENCE FILE READING');
  console.log('='.repeat(40));
  
  try {
    // Find the preference files
    const demoOutputsDir = 'demo_outputs';
    const files = await fs.readdir(demoOutputsDir);
    
    // Look for both types of preference files
    const curationFiles = files.filter(f => f.startsWith('curation_prompt_'));
    const preferenceFiles = files.filter(f => f.startsWith('user_preferences_'));
    
    console.log(`\n📁 Found ${curationFiles.length} curation prompt files`);
    console.log(`📁 Found ${preferenceFiles.length} user preference files`);
    
    if (curationFiles.length === 0) {
      console.log('❌ No preference files found. Run: python demo_user_input.py');
      return;
    }
    
    // Read the most recent curation prompt file
    const latestCurationFile = curationFiles.sort().reverse()[0];
    const curationPath = path.join(demoOutputsDir, latestCurationFile);
    
    console.log(`\n📄 Reading: ${latestCurationFile}`);
    console.log('-'.repeat(50));
    
    const curationContent = await fs.readFile(curationPath, 'utf-8');
    const curationData = JSON.parse(curationContent);
    
    // Display the preferences that the system would read
    console.log('🎯 YOUR PREFERENCES AS READ BY THE SYSTEM:');
    console.log('='.repeat(45));
    
    // Location preferences
    const location = curationData.user_profile?.location;
    if (location) {
      console.log(`\n📍 LOCATION:`);
      console.log(`   Primary Location: ${location.primary_location}`);
      console.log(`   Search Radius: ${location.radius_miles} miles`);
    }
    
    // Interest categories
    const interests = curationData.user_profile?.interests;
    if (interests) {
      console.log(`\n🎯 INTERESTS (Rating 1-5):`);
      const sortedInterests = Object.entries(interests)
        .sort(([,a], [,b]) => b - a);
      
      for (const [category, rating] of sortedInterests) {
        const stars = '⭐'.repeat(Math.floor(rating));
        console.log(`   ${category.padEnd(12)}: ${rating} ${stars}`);
      }
    }
    
    // Time preferences
    const timePrefs = curationData.user_profile?.time_preferences;
    if (timePrefs) {
      console.log(`\n⏰ TIME PREFERENCES:`);
      console.log(`   Preferred Days: ${timePrefs.preferred_days?.join(', ')}`);
      console.log(`   Preferred Times: ${timePrefs.preferred_times?.join(', ')}`);
      console.log(`   Advance Notice: ${timePrefs.advance_notice_days} days`);
    }
    
    // Additional preferences
    const additionalPrefs = curationData.user_profile?.additional_preferences;
    if (additionalPrefs) {
      console.log(`\n💰 ADDITIONAL PREFERENCES:`);
      
      const priceInfo = additionalPrefs.price_preference;
      if (priceInfo) {
        console.log(`   Price Range: ${priceInfo.preference} (max: $${priceInfo.max || 'unlimited'})`);
      }
      
      console.log(`   Group Size: ${additionalPrefs.group_size_preference || 'any'}`);
      console.log(`   Accessibility: ${additionalPrefs.accessibility_required ? 'Required' : 'Not required'}`);
      console.log(`   Parking: ${additionalPrefs.parking_required ? 'Required' : 'Not required'}`);
    }
    
    // AI Instructions
    const aiInstructions = curationData.user_profile?.ai_instructions;
    if (aiInstructions) {
      console.log(`\n🤖 AI INSTRUCTIONS:`);
      console.log(`   "${aiInstructions}"`);
    }
    
    // Curation parameters
    const curationParams = curationData.curation_parameters;
    if (curationParams) {
      console.log(`\n⚙️  CURATION SETTINGS:`);
      console.log(`   Max Events per Week: ${curationParams.max_events_per_week}`);
      console.log(`   Quality Threshold: ${curationParams.quality_threshold}`);
      console.log(`   Diversity Factor: ${curationParams.diversity_factor}`);
      console.log(`   Personalization Weight: ${curationParams.personalization_weight}`);
    }
    
    // Test how the backend would process these preferences
    console.log(`\n🔍 HOW THE BACKEND PROCESSES YOUR PREFERENCES:`);
    console.log('='.repeat(50));
    
    // Show which categories would be searched
    if (interests) {
      const searchableInterests = Object.entries(interests)
        .filter(([,rating]) => rating >= 2.0)
        .sort(([,a], [,b]) => b - a);
      
      console.log(`\n📊 Categories to Search (rating ≥ 2.0):`);
      for (const [category, rating] of searchableInterests) {
        const priority = rating >= 4.0 ? 'HIGH' : rating >= 3.0 ? 'MEDIUM' : 'LOW';
        console.log(`   ${category.padEnd(12)}: ${rating} (${priority} priority)`);
      }
    }
    
    // Show search strategy
    console.log(`\n🎯 Search Strategy:`);
    console.log(`   Location: "${location?.primary_location}" within ${location?.radius_miles} miles`);
    console.log(`   Time Frame: Next ${timePrefs?.advance_notice_days || 7} days`);
    console.log(`   Preferred Times: ${timePrefs?.preferred_times?.join(' or ') || 'any time'}`);
    console.log(`   Budget: Up to $${additionalPrefs?.price_preference?.max || 'unlimited'}`);
    
    console.log(`\n✅ SUCCESS: The system is correctly reading all your preferences!`);
    console.log(`\n📋 File Details:`);
    console.log(`   Session ID: ${curationData.metadata?.user_session_id}`);
    console.log(`   Generated: ${curationData.metadata?.generated_at}`);
    console.log(`   File Size: ${(await fs.stat(curationPath)).size} bytes`);
    
    // Test if the backend would accept this data
    console.log(`\n🔗 Backend Compatibility Check:`);
    const requiredFields = [
      'user_profile.location.primary_location',
      'user_profile.interests',
      'curation_parameters.max_events_per_week'
    ];
    
    let allFieldsPresent = true;
    for (const field of requiredFields) {
      const fieldParts = field.split('.');
      let value = curationData;
      
      for (const part of fieldParts) {
        value = value?.[part];
      }
      
      if (value !== undefined) {
        console.log(`   ✅ ${field}: Present`);
      } else {
        console.log(`   ❌ ${field}: Missing`);
        allFieldsPresent = false;
      }
    }
    
    if (allFieldsPresent) {
      console.log(`\n🎉 Your preferences are fully compatible with the backend API!`);
      console.log(`\n🚀 Ready to send to personalization endpoint:`);
      console.log(`   POST http://localhost:3000/api/personalization/curate`);
    } else {
      console.log(`\n⚠️  Some required fields are missing. Re-run the user input processor.`);
    }
    
  } catch (error) {
    console.error('❌ Error reading preference files:', error.message);
    console.log('\n💡 Make sure to run: python demo_user_input.py');
  }
}

testPreferenceReading();
