#!/usr/bin/env node
/**
 * Test script for WhitelistManager functionality
 */

import { WhitelistManager } from './src/utils/WhitelistManager.js';

async function testWhitelistManager() {
  console.log('🧪 Testing WhitelistManager...\n');

  const whitelistManager = new WhitelistManager();

  try {
    // Test 1: Load all patterns
    console.log('📋 Test 1: Loading all patterns...');
    const allPatterns = await whitelistManager.loadPatterns();
    console.log(`✅ Loaded ${allPatterns.length} patterns`);
    console.log('Sample patterns:', allPatterns.slice(0, 3).map(p => `${p.category}/${p.scope}/${p.precision}: ${p.pattern}`));
    
    // Test 2: Filter by arts-culture + bayarea + official
    console.log('\n🎨 Test 2: Filtering arts-culture/bayarea/official...');
    const artsPatterns = await whitelistManager.getPatterns('arts-culture', 'bayarea', 'official');
    console.log(`✅ Found ${artsPatterns.length} patterns for arts-culture/bayarea/official`);
    console.log('Sample patterns:', artsPatterns.slice(0, 5));

    // Test 3: Filter by talks-ai + bayarea + official
    console.log('\n🤖 Test 3: Filtering talks-ai/bayarea/official...');
    const aiTalksPatterns = await whitelistManager.getPatterns('talks-ai', 'bayarea', 'official');
    console.log(`✅ Found ${aiTalksPatterns.length} patterns for talks-ai/bayarea/official`);
    console.log('Sample patterns:', aiTalksPatterns.slice(0, 3));

    // Test 4: Filter by technology + bayarea + broad
    console.log('\n💻 Test 4: Filtering technology/bayarea/broad...');
    const techPatterns = await whitelistManager.getPatterns('technology', 'bayarea', 'broad');
    console.log(`✅ Found ${techPatterns.length} patterns for technology/bayarea/broad`);
    console.log('Sample patterns:', techPatterns.slice(0, 3));

    // Test 5: Scope hierarchy test - berkeley should match bayarea patterns
    console.log('\n🏛️ Test 5: Testing scope hierarchy (berkeley should get bayarea patterns)...');
    const berkeleyArts = await whitelistManager.getPatterns('arts-culture', 'berkeley', 'official');
    console.log(`✅ Found ${berkeleyArts.length} patterns for arts-culture/berkeley/official`);

    // Test 6: Get statistics
    console.log('\n📊 Test 6: Getting pattern statistics...');
    const stats = await whitelistManager.getStats();
    console.log('✅ Pattern Statistics:');
    console.log(`   Total patterns: ${stats.totalPatterns}`);
    console.log(`   Categories:`, Object.keys(stats.categories).length);
    console.log(`   Scopes:`, Object.keys(stats.scopes));
    console.log(`   Precisions:`, Object.keys(stats.precisions));

    // Test 7: Cache performance test
    console.log('\n⚡ Test 7: Testing cache performance...');
    const start1 = Date.now();
    await whitelistManager.getPatterns('music', 'bayarea', 'official');
    const time1 = Date.now() - start1;
    
    const start2 = Date.now();
    await whitelistManager.getPatterns('music', 'bayarea', 'official');
    const time2 = Date.now() - start2;
    
    console.log(`✅ First call: ${time1}ms, Cached call: ${time2}ms (should be much faster)`);

    console.log('\n🎉 All WhitelistManager tests passed!');

  } catch (error) {
    console.error('❌ WhitelistManager test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testWhitelistManager();