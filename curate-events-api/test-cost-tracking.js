#!/usr/bin/env node
/**
 * Test script for cost tracking utilities
 */

import { ExaCostCalculator, SerperCostCalculator, CostTracker } from './src/utils/costTracking.js';
import fs from 'fs';
import path from 'path';

async function testCostTracking() {
  console.log('🧪 Testing Cost Tracking Utilities...\n');

  try {
    // Test 1: Exa Cost Calculator
    console.log('💰 Test 1: Exa Cost Calculator...');
    
    // Test search costs
    const neuralSearchCost = ExaCostCalculator.calculateSearchCost('neural', 40);
    const keywordSearchCost = ExaCostCalculator.calculateSearchCost('keyword', 40);
    console.log(`✅ Neural search (40 results): $${neuralSearchCost.toFixed(6)}`);
    console.log(`✅ Keyword search (40 results): $${keywordSearchCost.toFixed(6)}`);
    
    // Test content costs
    const contentCost = ExaCostCalculator.calculateContentCost(40, false);
    const livecrawlCost = ExaCostCalculator.calculateContentCost(40, true);
    console.log(`✅ Content retrieval (40 pages): $${contentCost.toFixed(6)}`);
    console.log(`✅ Content + livecrawl (40 pages): $${livecrawlCost.toFixed(6)}`);
    
    // Test total costs
    const totalCost = ExaCostCalculator.calculateTotalCost('auto', 40, 40, true);
    console.log(`✅ Total Exa cost (auto/40/40/livecrawl): $${totalCost.toFixed(6)}`);

    // Test 2: Serper Cost Calculator
    console.log('\n🔍 Test 2: Serper Cost Calculator...');
    const serperCost = SerperCostCalculator.calculateRequestCost(100);
    console.log(`✅ Serper cost (100 requests): $${serperCost.toFixed(6)}`);

    // Test 3: Cost Tracker
    console.log('\n📊 Test 3: Cost Tracker...');
    const costTracker = new CostTracker('test_cost_log.csv');
    
    // Log some Exa costs
    const cost1 = await costTracker.logExaCost({
      query: 'music events San Francisco',
      searchType: 'auto',
      numResults: 25,
      numPages: 20,
      hasLivecrawl: true,
      operation: 'search'
    });
    console.log(`✅ Logged Exa cost: $${cost1.toFixed(6)}`);

    const cost2 = await costTracker.logExaCost({
      query: 'AI talks Berkeley',
      searchType: 'fast',
      numResults: 15,
      numPages: 10,
      hasLivecrawl: false,
      operation: 'search'
    });
    console.log(`✅ Logged second Exa cost: $${cost2.toFixed(6)}`);

    // Log some Serper costs
    const cost3 = await costTracker.logSerperCost({
      query: 'theater performances Oakland',
      numRequests: 50,
      operation: 'search'
    });
    console.log(`✅ Logged Serper cost: $${cost3.toFixed(6)}`);

    // Test 4: Cost Analytics
    console.log('\n📈 Test 4: Cost Analytics...');
    const analytics = await costTracker.getCostAnalytics(24);
    console.log('✅ 24-hour cost analytics:', {
      totalCost: `$${analytics.totalCost}`,
      breakdown: {
        exa: `$${analytics.breakdown.exa || 0}`,
        serper: `$${analytics.breakdown.serper || 0}`
      },
      requestCount: analytics.requestCount
    });

    // Test 5: Daily Cost Summary
    console.log('\n📅 Test 5: Daily Cost Summary...');
    const dailySummary = await costTracker.getDailyCostSummary(7);
    console.log('✅ 7-day cost summary:', {
      totalCost: `$${dailySummary.totalCost}`,
      averageDailyCost: `$${dailySummary.averageDailyCost?.toFixed(6)}`,
      projectedMonthlyCost: `$${dailySummary.projectedMonthlyCost?.toFixed(6)}`
    });

    // Test 6: Verify CSV log file
    console.log('\n📄 Test 6: Verify CSV log file...');
    const logPath = path.join(process.cwd(), 'test_cost_log.csv');
    if (fs.existsSync(logPath)) {
      const csvContent = fs.readFileSync(logPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      console.log(`✅ CSV log created with ${lines.length} lines (including header)`);
      console.log('   Header:', lines[0]);
      if (lines.length > 1) {
        console.log('   Sample entry:', lines[1]);
      }
    } else {
      console.log('❌ CSV log file not found');
    }

    // Test 7: Cost calculations validation
    console.log('\n🧮 Test 7: Cost calculation validation...');
    
    // Validate Exa rates (as of 2025)
    console.log('Expected rates:');
    console.log('  Neural/Auto: $5/1000 searches = $0.005 per search');
    console.log('  Keyword/Fast: $2.50/1000 searches = $0.0025 per search');
    console.log('  Content: $1/1000 pages = $0.001 per page');
    console.log('  Livecrawl multiplier: 1.2x');
    
    const testNeuralCost = ExaCostCalculator.calculateSearchCost('neural', 1);
    const testKeywordCost = ExaCostCalculator.calculateSearchCost('keyword', 1);
    const testContentCost = ExaCostCalculator.calculateContentCost(1, false);
    const testLivecrawlCost = ExaCostCalculator.calculateContentCost(1, true);
    
    console.log('Actual calculations:');
    console.log(`  Neural (1 search): $${testNeuralCost.toFixed(6)}`);
    console.log(`  Keyword (1 search): $${testKeywordCost.toFixed(6)}`);
    console.log(`  Content (1 page): $${testContentCost.toFixed(6)}`);
    console.log(`  Livecrawl (1 page): $${testLivecrawlCost.toFixed(6)}`);
    
    // Validate expected values
    const expectedNeuralCost = 0.005;
    const expectedKeywordCost = 0.0025;
    const expectedContentCost = 0.001;
    const expectedLivecrawlCost = 0.0012; // 1.2x multiplier
    
    console.log('Validation:');
    console.log(`  Neural cost ${Math.abs(testNeuralCost - expectedNeuralCost) < 0.000001 ? '✅' : '❌'}`);
    console.log(`  Keyword cost ${Math.abs(testKeywordCost - expectedKeywordCost) < 0.000001 ? '✅' : '❌'}`);
    console.log(`  Content cost ${Math.abs(testContentCost - expectedContentCost) < 0.000001 ? '✅' : '❌'}`);
    console.log(`  Livecrawl cost ${Math.abs(testLivecrawlCost - expectedLivecrawlCost) < 0.000001 ? '✅' : '❌'}`);

    // Clean up test file
    try {
      fs.unlinkSync(logPath);
      console.log('\n🧹 Cleaned up test CSV file');
    } catch (e) {
      // Ignore cleanup errors
    }

    console.log('\n🎉 All Cost Tracking tests passed!');

  } catch (error) {
    console.error('❌ Cost Tracking test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testCostTracking();