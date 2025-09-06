#!/usr/bin/env node
/**
 * Test script for BlacklistManager functionality
 */

import { BlacklistManager } from './src/utils/BlacklistManager.js';

async function testBlacklistManager() {
  console.log('🧪 Testing BlacklistManager...\n');

  const blacklistManager = new BlacklistManager();

  try {
    // Test 1: Load patterns
    console.log('📋 Test 1: Loading blacklist patterns...');
    const patterns = await blacklistManager.loadPatterns();
    console.log(`✅ Loaded ${patterns.length} blacklist patterns`);
    console.log('Patterns:', patterns);

    // Test 2: Test blacklisted URLs
    console.log('\n🚫 Test 2: Testing blacklisted URLs...');
    const testUrls = [
      'https://encrypted-tbn0.gstatic.com/images/test.jpg',
      'https://google.com/search?q=events',
      'https://www.google.com/search?q=music',
      'https://youtube.com/watch?v=test', // Should not be blacklisted (enabled=false)
      'https://sfjazz.org/events/concert', // Should not be blacklisted (not in patterns)
      'https://eventbrite.com/e/music-event-123'
    ];

    for (const url of testUrls) {
      const isBlacklisted = await blacklistManager.isBlacklisted(url);
      console.log(`   ${isBlacklisted ? '🚫' : '✅'} ${url} ${isBlacklisted ? '(BLOCKED)' : '(ALLOWED)'}`);
    }

    // Test 3: Bulk URL filtering
    console.log('\n📦 Test 3: Bulk URL filtering...');
    const bulkResults = await blacklistManager.filterUrls(testUrls);
    console.log(`✅ Bulk filtering results:`);
    console.log(`   Total: ${bulkResults.total}`);
    console.log(`   Allowed: ${bulkResults.allowed.length}`);
    console.log(`   Blocked: ${bulkResults.blocked.length}`);
    console.log('   Blocked URLs:', bulkResults.blocked);

    // Test 4: Runtime pattern management
    console.log('\n⚙️ Test 4: Runtime pattern management...');
    await blacklistManager.addPattern('test.example.com/*');
    const isTestBlocked = await blacklistManager.isBlacklisted('https://test.example.com/events');
    console.log(`   ✅ Added pattern, test.example.com blocked: ${isTestBlocked}`);

    await blacklistManager.removePattern('test.example.com/*');
    const isTestStillBlocked = await blacklistManager.isBlacklisted('https://test.example.com/events');
    console.log(`   ✅ Removed pattern, test.example.com blocked: ${isTestStillBlocked}`);

    // Test 5: Get statistics
    console.log('\n📊 Test 5: Getting blacklist statistics...');
    const stats = await blacklistManager.getStats();
    console.log('✅ Blacklist Statistics:');
    console.log(`   Total patterns: ${stats.totalPatterns}`);
    console.log(`   Domain patterns: ${stats.domainPatterns}`);
    console.log(`   Path patterns: ${stats.pathPatterns}`);
    console.log(`   Wildcard patterns: ${stats.wildcardPatterns}`);
    console.log(`   Example patterns:`, stats.examples);

    // Test 6: Cache performance test
    console.log('\n⚡ Test 6: Testing cache performance...');
    const start1 = Date.now();
    await blacklistManager.isBlacklisted('https://google.com/test');
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await blacklistManager.isBlacklisted('https://google.com/test2');
    const time2 = Date.now() - start2;

    console.log(`✅ First call: ${time1}ms, Second call: ${time2}ms`);

    // Test 7: Edge cases
    console.log('\n🔍 Test 7: Testing edge cases...');
    console.log(`   Null URL: ${await blacklistManager.isBlacklisted(null)}`);
    console.log(`   Empty URL: ${await blacklistManager.isBlacklisted('')}`);
    console.log(`   Invalid URL: ${await blacklistManager.isBlacklisted('not-a-url')}`);

    console.log('\n🎉 All BlacklistManager tests passed!');

  } catch (error) {
    console.error('❌ BlacklistManager test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testBlacklistManager();